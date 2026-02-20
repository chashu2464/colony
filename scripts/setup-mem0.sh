#!/bin/bash
# Quick Start Script for Mem0 Integration

set -e

echo "=== Colony Mem0 Integration Quick Start ==="
echo ""

# Check Python
echo "1. Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.8+"
    exit 1
fi
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo "✓ Python $PYTHON_VERSION found"
echo ""

# Check Node.js
echo "2. Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi
NODE_VERSION=$(node --version)
echo "✓ Node.js $NODE_VERSION found"
echo ""

# Install Python dependencies
echo "3. Installing Python dependencies..."
if [ -f "requirements-mem0.txt" ]; then
    pip3 install -r requirements-mem0.txt
    echo "✓ Python dependencies installed"
else
    echo "❌ requirements-mem0.txt not found"
    exit 1
fi
echo ""

# Install Node dependencies
echo "4. Installing Node.js dependencies..."
npm install
echo "✓ Node.js dependencies installed"
echo ""

# Check environment variables
echo "5. Checking environment variables..."
if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  OPENAI_API_KEY not set"
    echo "   Please set it: export OPENAI_API_KEY=sk-..."
    echo "   Mem0 features will not work without it"
else
    echo "✓ OPENAI_API_KEY is set"
fi
echo ""

# Check Qdrant
echo "6. Checking Qdrant..."
if curl -s http://localhost:6333/collections > /dev/null 2>&1; then
    echo "✓ Qdrant is running on port 6333"
else
    echo "⚠️  Qdrant not running"
    echo "   Start it with: docker run -p 6333:6333 qdrant/qdrant"
    echo "   Or use Chroma (embedded, no setup needed)"
fi
echo ""

# Build
echo "7. Building Colony..."
npm run build:server
echo "✓ Build successful"
echo ""

# Run tests (optional)
echo "8. Running Mem0 integration tests (optional)..."
read -p "Run tests now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -n "$OPENAI_API_KEY" ]; then
        node dist/tests/mem0-integration-test.js
        echo "✓ Tests passed"
    else
        echo "❌ Cannot run tests without OPENAI_API_KEY"
    fi
fi
echo ""

# Summary
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Start Qdrant (if not running):"
echo "   docker run -p 6333:6333 qdrant/qdrant"
echo ""
echo "2. Set environment variables:"
echo "   export OPENAI_API_KEY=sk-..."
echo ""
echo "3. Start Colony:"
echo "   npm start"
echo ""
echo "4. Open Web UI:"
echo "   http://localhost:3000"
echo ""
echo "For more details, see:"
echo "- docs/mem0-integration-guide.md"
echo "- docs/mem0-research.md"
echo ""
