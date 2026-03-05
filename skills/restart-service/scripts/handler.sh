#!/bin/bash
# Colony skill: restart-service
# Rebuilds and restarts the Colony server.

set -e

# Read JSON params from stdin
PARAMS=$(cat)
CONFIRM=$(echo "$PARAMS" | jq -r '.confirm // false')

if [ "$CONFIRM" != "true" ]; then
    echo '{"error": "Authorization required. Please set confirm to true."}' >&2
    exit 1
fi

echo "--- Phase 1: Building Server ---"
if ! npm run build:server; then
    echo '{"error": "Build failed. Restart aborted."}' >&2
    exit 1
fi

echo "--- Phase 2: Restarting Service ---"
# Determine port (default 3001)
TARGET_PORT="${PORT:-3001}"

# Use nohup to ensure it survives the termination of the current process
nohup sh -c "lsof -i :$TARGET_PORT -t | xargs kill -9 2>/dev/null || true; npm start" > colony-server.log 2>&1 &
echo '{"status": "restarting", "message": "Service is restarting in the background. Check colony-server.log for details."}'
