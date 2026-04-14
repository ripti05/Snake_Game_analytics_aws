const express = require("express");
const AWS = require("aws-sdk");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// AWS Config
AWS.config.update({ region: "ap-south-1" });

const kinesis = new AWS.Kinesis();
const athena = new AWS.Athena();

// 🔥 IN-MEMORY HIGH SCORE (REAL-TIME FIX)
let globalHighScore = 0;

// 🎮 SEND EVENTS TO KINESIS
app.post("/event", async (req, res) => {
  try {
    await kinesis.putRecord({
      StreamName: "game-events-stream",
      Data: JSON.stringify(req.body),
      PartitionKey: "key"
    }).promise();

    res.send("Event sent");
  } catch (err) {
    console.error("Kinesis Error:", err);
    res.status(500).send("Error sending event");
  }
});

// 📊 ANALYZE (HYBRID: ATHENA + MEMORY)
app.get("/analyze", async (req, res) => {
  const sessionId = req.query.session_id;
  const currentScore = Number(req.query.current_score);

  const params = {
    QueryString: `
      SELECT MAX(score) AS athena_max
      FROM game_events
      WHERE session_id != ${sessionId}
    `,
    ResultConfiguration: {
      OutputLocation: "s3://snake-data-lake-23-03-2026/Query-result/"
    }
  };

  try {
    const start = await athena.startQueryExecution(params).promise();
    const queryId = start.QueryExecutionId;

    let status = "RUNNING";

    while (status === "RUNNING" || status === "QUEUED") {
      await new Promise(r => setTimeout(r, 2000));

      const execution = await athena.getQueryExecution({
        QueryExecutionId: queryId
      }).promise();

      status = execution.QueryExecution.Status.State;
    }

    const result = await athena.getQueryResults({
      QueryExecutionId: queryId
    }).promise();

    const rows = result.ResultSet.Rows;

    const athenaMax = Number(rows[1]?.Data[0]?.VarCharValue || 0);

    // 🔥 COMBINE ATHENA + MEMORY
    const previousMax = Math.max(globalHighScore, athenaMax);

    let finalHighScore = previousMax;
    let isNewHigh = false;

    if (currentScore > previousMax) {
      finalHighScore = currentScore;
      globalHighScore = currentScore; // ✅ INSTANT UPDATE
      isNewHigh = true;
    }

    res.json({
      previous_max_score: previousMax,
      final_high_score: finalHighScore,
      is_new_high: isNewHigh
    });

  } catch (err) {
    console.error("Athena Error:", err);
    res.status(500).send("Query failed");
  }
});

app.listen(3000, () => console.log("Server running on port 3000 🚀"));