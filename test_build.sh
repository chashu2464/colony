#!/bin/bash
set -e

echo "Starting build verification..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "node_modules not found. Please run npm install first."
    exit 1
fi

echo "Running build:server..."
npm run build:server

echo "Build successful!"
