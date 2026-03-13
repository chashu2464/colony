#!/bin/bash

# knowledge-manager skill handler
# Dispatches KMS operations based on JSON input.

COMMAND=$(echo "$1" | jq -r '.command // empty')
if [ -z "$COMMAND" ]; then
  # Fallback to reading from stdin
  INPUT=$(cat)
  COMMAND=$(echo "$INPUT" | jq -r '.command // empty')
else
  INPUT="$1"
fi

SCRIPTS_DIR="$(dirname "$0")"

case "$COMMAND" in
  check-compliance)
    FIX=$(echo "$INPUT" | jq -r '.fix // false')
    # Default to all md files in docs/ if no files specified
    FILES=$(echo "$INPUT" | jq -r '.files[]? // empty')
    
    ARGS=""
    if [ "$FIX" = "true" ]; then ARGS="--fix"; fi
    
    if [ -z "$FILES" ]; then
      FILES=$(find docs -name "*.md" -not -path "docs/archive/*" -not -name "BACKLOG.md" -not -name "README.md")
    fi
    
    node "$SCRIPTS_DIR/check-compliance.js" $ARGS $FILES
    ;;

  create-navigator)
    NAME=$(echo "$INPUT" | jq -r '.name // empty')
    OWNER=$(echo "$INPUT" | jq -r '.owner // "developer"')
    
    if [ -z "$NAME" ]; then
      echo '{"error": "Missing required parameter: name"}'
      exit 1
    fi
    
    node "$SCRIPTS_DIR/create-navigator.js" --name="$NAME" --owner="$OWNER"
    ;;

  find-related)
    FEATURE_ID=$(echo "$INPUT" | jq -r '.feature_id // empty')
    if [ -z "$FEATURE_ID" ]; then
      echo '{"error": "Missing required parameter: feature_id"}'
      exit 1
    fi
    node "$SCRIPTS_DIR/find-related.js" --feature="$FEATURE_ID"
    ;;

  check-hygiene)
    node "$SCRIPTS_DIR/check-hygiene.js"
    ;;

  archive)
    node "$SCRIPTS_DIR/archive.js"
    ;;

  *)
    echo "{\"error\": \"Unknown command: $COMMAND\"}"
    exit 1
    ;;
esac
