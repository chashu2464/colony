# Xcode CLI Development Skill

> **Headless iOS/macOS development for AI agents**

This skill enables complete Xcode project development through command-line tools, allowing AI agents to build, test, and verify iOS/macOS applications without Xcode IDE access.

## Quick Start

### 1. Fix Environment (One-Time Setup)

```bash
# Check current setup
xcode-select -p

# If it shows /Library/Developer/CommandLineTools, fix it:
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer

# Verify
cd /path/to/Colony/skills/xcode-cli-dev
echo '{"action": "check-env"}' | bash scripts/handler.sh
```

### 2. Migrate Your Project

```bash
# Copy your Xcode project to Colony workspace
cp -r ~/MyApp /Users/casu/Documents/Colony/MyApp

# Find your scheme name
cd /Users/casu/Documents/Colony/MyApp
xcodebuild -list
```

### 3. Run Your First Build

```bash
cd /Users/casu/Documents/Colony/skills/xcode-cli-dev
echo '{"action": "build", "scheme": "MyApp"}' | bash scripts/handler.sh
```

### 4. Verify UI

```bash
echo '{"action": "verify-ui", "scheme": "MyApp", "device": "iPhone 15"}' | bash scripts/handler.sh
```

This will:
- Build your app
- Launch iPhone 15 simulator
- Install and run your app
- Take a screenshot
- Save it as baseline for future comparisons

## Usage Examples

### Check Environment
```bash
echo '{"action": "check-env"}' | bash scripts/handler.sh
```

**Output**:
```json
{
  "status": "success",
  "xcode_version": "Xcode 15.0",
  "xcode_path": "/Applications/Xcode.app/Contents/Developer",
  "simulator_count": 12
}
```

### Build Project
```bash
echo '{"action": "build", "scheme": "MyApp"}' | bash scripts/handler.sh
```

**Output**:
```json
{
  "status": "success",
  "scheme": "MyApp",
  "log": "/tmp/xcodebuild.log"
}
```

### Run Tests
```bash
echo '{"action": "test", "scheme": "MyApp", "device": "iPhone 15"}' | bash scripts/handler.sh
```

**Output**:
```json
{
  "status": "success",
  "scheme": "MyApp",
  "device": "iPhone 15",
  "summary": "Test Suite 'All tests' passed...",
  "log": "/tmp/xcodebuild-test.log"
}
```

### Verify UI (Visual Regression)
```bash
echo '{"action": "verify-ui", "scheme": "MyApp"}' | bash scripts/handler.sh
```

**First Run** (creates baseline):
```json
{
  "status": "success",
  "message": "Baseline created",
  "screenshot": ".xcode-baselines/MyApp_iPhone_15_20260310_120000.png",
  "baseline": ".xcode-baselines/MyApp_iPhone_15_baseline.png"
}
```

**Subsequent Runs** (compares with baseline):
```json
{
  "status": "warning",
  "message": "Visual difference detected",
  "screenshot": ".xcode-baselines/MyApp_iPhone_15_20260310_120530.png",
  "baseline": ".xcode-baselines/MyApp_iPhone_15_baseline.png",
  "size_diff": 15234
}
```

## Development Standards

### ✅ DO
- Use SwiftUI for all new UI
- Edit `.swift` files directly
- Commit baseline screenshots to git
- Run `verify-ui` after UI changes
- Use Swift Package Manager for dependencies

### ❌ DON'T
- Create new Storyboards or XIBs
- Edit Interface Builder files as XML
- Skip visual verification
- Commit build artifacts
- Use Carthage for dependencies

## Integration with Workflows

### Small Changes (< 1 hour)
```bash
# Start quick task
cd /Users/casu/Documents/Colony/skills/quick-task
echo '{"action": "start", "task_name": "Fix button color"}' | bash scripts/handler.sh

# Make changes to Swift files...

# Verify UI
cd /Users/casu/Documents/Colony/skills/xcode-cli-dev
echo '{"action": "verify-ui", "scheme": "MyApp"}' | bash scripts/handler.sh

# Complete task
cd /Users/casu/Documents/Colony/skills/quick-task
echo '{"action": "done"}' | bash scripts/handler.sh
```

### Large Features (> 1 hour)
```bash
# Start dev workflow
cd /Users/casu/Documents/Colony/skills/dev-workflow
echo '{"action": "start", "task_name": "Add user profile screen"}' | bash scripts/handler.sh

# Develop with continuous verification
cd /Users/casu/Documents/Colony/skills/xcode-cli-dev
echo '{"action": "build", "scheme": "MyApp"}' | bash scripts/handler.sh
echo '{"action": "test", "scheme": "MyApp"}' | bash scripts/handler.sh
echo '{"action": "verify-ui", "scheme": "MyApp"}' | bash scripts/handler.sh

# Complete workflow
cd /Users/casu/Documents/Colony/skills/dev-workflow
echo '{"action": "done"}' | bash scripts/handler.sh
```

## Troubleshooting

### Error: "tool requires Xcode"
```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

### Error: "Scheme not found"
```bash
# List available schemes
xcodebuild -list

# Make sure scheme is shared (one-time in Xcode):
# Product > Scheme > Manage Schemes > Check "Shared"
```

### Error: "Unable to boot simulator"
```bash
# List available devices
xcrun simctl list devices

# Delete unavailable devices
xcrun simctl delete unavailable

# Restart CoreSimulatorService
sudo killall -9 com.apple.CoreSimulator.CoreSimulatorService
```

### Screenshots differ on every run
The skill automatically standardizes simulator state (time, battery). If still seeing differences:
```bash
# Check if status_bar override is supported
xcrun simctl status_bar booted override --help

# Manually verify simulator state
xcrun simctl status_bar booted list
```

## File Structure

```
xcode-cli-dev/
├── SKILL.md           # Complete documentation
├── ARCHITECTURE.md    # Design decisions and rationale
├── README.md          # This file (quick start)
└── scripts/
    └── handler.sh     # Main implementation
```

## Parameters Reference

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | string | ✅ | - | `check-env`, `build`, `test`, `verify-ui` |
| `scheme` | string | ❌ | - | Xcode scheme name (required for build/test/verify-ui) |
| `device` | string | ❌ | `"iPhone 15"` | Simulator device name |
| `baseline_dir` | string | ❌ | `".xcode-baselines"` | Directory for baseline screenshots |

## Next Steps

1. **Read SKILL.md** for complete documentation
2. **Read ARCHITECTURE.md** for design rationale
3. **Run check-env** to validate your setup
4. **Migrate a project** and run your first build
5. **Establish baselines** with verify-ui

## Support

For issues or questions:
1. Check Troubleshooting section above
2. Review SKILL.md for detailed documentation
3. Check ARCHITECTURE.md for design context
4. Review build logs in `/tmp/xcodebuild*.log`

## Version

- **Version**: 1.0.0
- **Last Updated**: 2026-03-10
- **Compatibility**: Xcode 14+, iOS 15+
