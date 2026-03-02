#!/bin/bash
# ── Colony: Web Frontend Verification ─────────────────────
# This script executes the build and type safety check.

echo "=== Starting Web Build & Type Safety Check ==="

# Navigate to web directory
cd web || { echo "❌ Error: web directory not found"; exit 1; }

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing web dependencies..."
    npm install --silent
fi

# Run build (includes tsc -b)
echo "🏗️ Running npm run build..."
if npm run build; then
    echo "✅ PASS: Web build and type checking successful."
else
    echo "❌ FAIL: Web build or type checking failed."
    exit 1
fi

# Verify the IME fix is in the code
echo "🔍 Verifying IME fix in App.tsx..."
if grep -q "e.nativeEvent.isComposing" src/App.tsx; then
    echo "✅ PASS: IME composition check found in App.tsx."
else
    echo "❌ FAIL: IME composition check NOT found in App.tsx."
    exit 1
fi

echo "=== Web Verification Completed successfully ==="
