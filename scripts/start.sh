#!/bin/bash
cd /home/ubuntu/snake-analytics
pm2 restart server.js || pm2 start server.js