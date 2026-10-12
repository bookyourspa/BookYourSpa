#!/usr/bin/env bash
# Local full-stack dev/preview server (API + static site).
set -e
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
PIDFILE="/tmp/bys-dev-$PORT.pid"
LOG="/tmp/bys-dev-$PORT.log"
case "${1:-start}" in
  stop)
    if [ -f "$PIDFILE" ]; then
      PID=$(cat "$PIDFILE")
      # kill the whole process group created by setsid at start
      kill -TERM -- "-$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
      rm -f "$PIDFILE"
      sleep 2
    fi
    ;;
  start)
    cd worker
    setsid nohup npx wrangler dev --port "$PORT" --ip 0.0.0.0 --local > "$LOG" 2>&1 < /dev/null &
    echo $! > "$PIDFILE"
    sleep 14
    ;;
esac
curl -s -m 8 "http://127.0.0.1:$PORT/api/health" || echo "DOWN"
