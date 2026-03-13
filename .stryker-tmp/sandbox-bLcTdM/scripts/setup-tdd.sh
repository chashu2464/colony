#!/bin/bash

# scripts/setup-tdd.sh - Initialize TDD environment and quality gates

set -e

echo "Initializing TDD environment..."

# 1. Install dependencies
echo "Installing Vitest and Stryker dependencies..."
npm install --save-dev vitest @vitest/coverage-v8 @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker

# 2. Update package.json scripts
echo "Updating package.json scripts..."
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts = {
  ...pkg.scripts,
  "test": "vitest run",
  "test:unit": "vitest run --dir src/tests/unit --coverage",
  "test:int": "vitest run --dir src/tests/integration --coverage",
  "test:mutation": "stryker run",
  "tdd:log": "node scripts/generate-tdd-log.js"
};
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
'

# 3. Create vitest.config.ts
if [ ! -f "vitest.config.ts" ]; then
  echo "Creating vitest.config.ts..."
  cat > vitest.config.ts <<EOF
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.d.ts",
        "vitest.config.ts",
        "stryker.config.json",
        "scripts/"
      ]
    }
  }
});
EOF
fi

# 4. Create stryker.config.json
if [ ! -f "stryker.config.json" ]; then
  echo "Creating stryker.config.json..."
  cat > stryker.config.json <<EOF
{
  "\$schema": "https://git.io/stryker-conf.schema.json",
  "packageManager": "npm",
  "reporters": ["html", "clear-text", "progress", "json"],
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "vitest": {
    "configFile": "vitest.config.ts"
  },
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/**/*.test.ts",
    "!src/types.ts",
    "!src/tests/**/*"
  ],
  "thresholds": {
    "high": 80,
    "low": 70,
    "break": 60
  }
}
EOF
fi

echo "TDD environment setup complete."
