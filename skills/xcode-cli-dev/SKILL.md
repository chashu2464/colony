---
name: xcode-cli-dev
description: Xcode CLI development workflow for headless iOS/macOS development
---

# xcode-cli-dev

Complete CLI-based Xcode development workflow enabling headless iOS/macOS app development without Xcode IDE.

## Overview

This skill provides a standardized workflow for developing Xcode projects through command-line tools, enabling AI agents to build, test, and verify iOS/macOS applications without GUI access.

## Prerequisites

### Environment Setup

1. **Xcode Installation**: Full Xcode.app must be installed (not just Command Line Tools)
2. **Developer Tools Path**: Must point to Xcode, not Command Line Tools

Check and fix environment:
```bash
# Check current setup
xcode-select -p

# If it shows /Library/Developer/CommandLineTools, fix it:
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer

# Verify
xcodebuild -version
xcrun simctl list devices
```

## Usage

### Check Environment
```bash
echo '{"action": "check-env"}' | bash scripts/handler.sh
```

Validates Xcode installation, developer tools path, and simulator availability.

### Verify UI (Visual Regression)
```bash
echo '{"action": "verify-ui", "scheme": "MyApp", "device": "iPhone 15"}' | bash scripts/handler.sh
```

Builds the app, launches simulator, takes screenshot for visual verification.

### Run Tests
```bash
echo '{"action": "test", "scheme": "MyApp", "device": "iPhone 15"}' | bash scripts/handler.sh
```

Runs unit and UI tests on specified simulator.

### Build Project
```bash
echo '{"action": "build", "scheme": "MyApp"}' | bash scripts/handler.sh
```

Builds the project and reports compilation status.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `check-env`, `verify-ui`, `test`, `build` |
| `scheme` | string | ❌ | Xcode scheme name (required for build/test/verify-ui) |
| `device` | string | ❌ | Simulator device name (default: "iPhone 15") |
| `baseline_dir` | string | ❌ | Directory for baseline screenshots (default: `.xcode-baselines/`) |

## Development Standards

### 1. Code-Only Architecture

**Mandatory Rules**:
- ✅ **SwiftUI First**: All new UI must use SwiftUI (declarative, code-based)
- ❌ **No Storyboards**: `.storyboard` and `.xib` files are prohibited for new features
- ✅ **Programmatic UIKit**: Legacy UIKit code must be refactored to programmatic views
- ✅ **Direct File Editing**: All changes via direct `.swift`, `.plist`, `project.pbxproj` editing

**Rationale**: Without Xcode IDE, Interface Builder files can only be edited as XML, which is error-prone and unmaintainable.

### 2. Visual Regression Testing

**Workflow**:
1. **Baseline Capture**: First run captures baseline screenshots
2. **Change Detection**: Subsequent runs compare against baseline
3. **Human Review**: Pixel differences flagged for manual verification
4. **Baseline Update**: Approved changes update baseline

**Implementation**:
- Uses `xcrun simctl io booted screenshot` for capture
- Standardizes simulator state via `xcrun simctl status_bar` (9:41 AM, 100% battery)
- Stores baselines in `.xcode-baselines/` (git-tracked)

### 3. Automated Testing Pipeline

**Test Levels**:
- **Unit Tests**: `xcodebuild test -scheme <Scheme> -destination 'platform=iOS Simulator,name=iPhone 15'`
- **UI Tests**: XCUITest-based automation
- **Visual Tests**: Screenshot comparison (via this skill)

**Quality Gate**: All three must pass before merge.

### 4. Dependency Management

**Supported**:
- ✅ **Swift Package Manager**: Preferred (edit `Package.swift` directly)
- ✅ **CocoaPods**: Supported (requires `pod install` via bash)

**Not Supported**:
- ❌ **Carthage**: Manual binary management incompatible with CLI workflow

## Architecture Constraints

### What We CAN Do
- ✅ Edit Swift source code directly
- ✅ Modify `Info.plist`, `project.pbxproj` as text
- ✅ Build and run on simulators
- ✅ Execute automated tests
- ✅ Capture and compare screenshots
- ✅ Manage Swift packages programmatically

### What We CANNOT Do
- ❌ Use Xcode Interface Builder visually
- ❌ Debug with Xcode's visual debugger
- ❌ Use Instruments GUI for profiling
- ❌ Manually interact with simulator UI (must script via XCUITest)

### Workarounds
- **UI Design**: Use SwiftUI Previews (code-based) + screenshot verification
- **Debugging**: Use `print()`, `os_log()`, and crash logs
- **Profiling**: Use `xcodebuild` with Instruments CLI
- **UI Interaction**: Script via XCUITest automation

## Project Migration Checklist

When bringing an Xcode project into this workflow:

1. **Copy Project**: Move `.xcodeproj` or `.xcworkspace` to workspace root
2. **Identify Scheme**: Run `xcodebuild -list` to find scheme names
3. **Check Tech Stack**: Determine if UIKit, SwiftUI, or hybrid
4. **Audit Storyboards**: List all `.storyboard`/`.xib` files for migration
5. **Verify Dependencies**: Check `Podfile`, `Package.swift`, or `Cartfile`
6. **Run Initial Build**: Execute `check-env` and `build` actions
7. **Capture Baseline**: Run `verify-ui` to establish visual baseline

## Integration with Colony Workflows

### For Small Changes (< 1 hour)
Use `quick-task` skill:
```bash
# Start
echo '{"action": "start", "task_name": "Fix button color"}' | bash ../quick-task/scripts/handler.sh

# Make changes, then verify
echo '{"action": "verify-ui", "scheme": "MyApp"}' | bash scripts/handler.sh

# Complete
echo '{"action": "done"}' | bash ../quick-task/scripts/handler.sh
```

### For Large Features (> 1 hour)
Use `dev-workflow` skill:
```bash
# Start
echo '{"action": "start", "task_name": "Add user profile screen"}' | bash ../dev-workflow/scripts/handler.sh

# Develop with continuous verification
echo '{"action": "verify-ui", "scheme": "MyApp"}' | bash scripts/handler.sh

# Complete
echo '{"action": "done"}' | bash ../dev-workflow/scripts/handler.sh
```

## Troubleshooting

### "xcodebuild: error: tool requires Xcode"
**Cause**: `xcode-select` points to Command Line Tools
**Fix**: `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`

### "Unable to boot simulator"
**Cause**: Simulator runtime not installed or corrupted
**Fix**: `xcrun simctl list runtimes` to check, reinstall via Xcode Settings > Platforms

### "Scheme not found"
**Cause**: Scheme name mismatch or scheme not shared
**Fix**: 
1. Run `xcodebuild -list` to see available schemes
2. In Xcode, edit scheme > check "Shared" checkbox (one-time setup)

### Screenshot differences on every run
**Cause**: Simulator state (time, battery) varies
**Fix**: Ensure `status_bar` override is applied (handled automatically by `verify-ui`)

## Design Rationale

### Why Code-Only?
- **Maintainability**: Text-based files are git-friendly and AI-editable
- **Automation**: No GUI dependencies enable full CI/CD automation
- **Consistency**: Declarative SwiftUI reduces "works on my machine" issues

### Why Visual Regression?
- **Trust**: Without live preview, screenshot comparison provides confidence
- **Regression Prevention**: Catches unintended UI changes automatically
- **Documentation**: Screenshots serve as visual documentation

### Why Standardized Simulators?
- **Reproducibility**: Fixed device + state = consistent test results
- **Performance**: Single simulator type reduces resource usage
- **Simplicity**: Fewer variables = easier debugging

## References

- [Swift Snapshot Testing](https://github.com/pointfreeco/swift-snapshot-testing)
- [xcodebuild man page](https://developer.apple.com/library/archive/technotes/tn2339/)
- [simctl documentation](https://nshipster.com/simctl/)
