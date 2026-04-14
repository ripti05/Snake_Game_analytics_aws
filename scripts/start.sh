
#!/bin/bash
cd /home/ubuntu/snake-analytics
pm2 restart app.js || pm2 start app.js