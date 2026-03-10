#!/bin/bash
set -euo pipefail

# Parse JSON input
INPUT=$(cat)
ACTION=$(echo "$INPUT" | jq -r '.action')
SCHEME=$(echo "$INPUT" | jq -r '.scheme // empty')
DEVICE=$(echo "$INPUT" | jq -r '.device // "iPhone 15"')
BASELINE_DIR=$(echo "$INPUT" | jq -r '.baseline_dir // ".xcode-baselines"')

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check environment setup
check_env() {
    log_info "Checking Xcode environment..."
    
    # Check xcode-select path
    XCODE_PATH=$(xcode-select -p 2>/dev/null || echo "")
    if [[ -z "$XCODE_PATH" ]]; then
        log_error "xcode-select not configured"
        echo '{"status": "error", "message": "xcode-select not configured. Run: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer"}'
        exit 1
    fi
    
    if [[ "$XCODE_PATH" == *"CommandLineTools"* ]]; then
        log_error "xcode-select points to Command Line Tools, not Xcode"
        echo '{"status": "error", "message": "Developer tools path is Command Line Tools. Run: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer", "current_path": "'"$XCODE_PATH"'"}'
        exit 1
    fi
    
    # Check xcodebuild
    if ! command -v xcodebuild &> /dev/null; then
        log_error "xcodebuild not found"
        echo '{"status": "error", "message": "xcodebuild not found in PATH"}'
        exit 1
    fi
    
    XCODE_VERSION=$(xcodebuild -version | head -1)
    log_info "Found: $XCODE_VERSION"
    
    # Check simctl
    if ! xcrun simctl list devices &> /dev/null; then
        log_error "simctl not available"
        echo '{"status": "error", "message": "xcrun simctl not available"}'
        exit 1
    fi
    
    SIMULATOR_COUNT=$(xcrun simctl list devices available | grep -c "iPhone" || echo "0")
    log_info "Available simulators: $SIMULATOR_COUNT"
    
    echo '{"status": "success", "xcode_version": "'"$XCODE_VERSION"'", "xcode_path": "'"$XCODE_PATH"'", "simulator_count": '$SIMULATOR_COUNT'}'
}

# Build project
build_project() {
    if [[ -z "$SCHEME" ]]; then
        log_error "Scheme name required for build action"
        echo '{"status": "error", "message": "scheme parameter is required"}'
        exit 1
    fi
    
    log_info "Building scheme: $SCHEME"
    
    if xcodebuild -scheme "$SCHEME" -sdk iphonesimulator build 2>&1 | tee /tmp/xcodebuild.log; then
        log_info "Build succeeded"
        echo '{"status": "success", "scheme": "'"$SCHEME"'", "log": "/tmp/xcodebuild.log"}'
    else
        log_error "Build failed"
        ERRORS=$(grep "error:" /tmp/xcodebuild.log | head -5 || echo "See /tmp/xcodebuild.log for details")
        echo '{"status": "error", "message": "Build failed", "errors": "'"$ERRORS"'", "log": "/tmp/xcodebuild.log"}'
        exit 1
    fi
}

# Run tests
run_tests() {
    if [[ -z "$SCHEME" ]]; then
        log_error "Scheme name required for test action"
        echo '{"status": "error", "message": "scheme parameter is required"}'
        exit 1
    fi
    
    log_info "Running tests for scheme: $SCHEME on $DEVICE"
    
    DESTINATION="platform=iOS Simulator,name=$DEVICE"
    
    if xcodebuild test -scheme "$SCHEME" -destination "$DESTINATION" 2>&1 | tee /tmp/xcodebuild-test.log; then
        log_info "Tests passed"
        TEST_SUMMARY=$(grep -E "Test Suite|Executed" /tmp/xcodebuild-test.log | tail -5 || echo "")
        echo '{"status": "success", "scheme": "'"$SCHEME"'", "device": "'"$DEVICE"'", "summary": "'"$TEST_SUMMARY"'", "log": "/tmp/xcodebuild-test.log"}'
    else
        log_error "Tests failed"
        FAILURES=$(grep "error:" /tmp/xcodebuild-test.log | head -5 || echo "See /tmp/xcodebuild-test.log for details")
        echo '{"status": "error", "message": "Tests failed", "failures": "'"$FAILURES"'", "log": "/tmp/xcodebuild-test.log"}'
        exit 1
    fi
}

# Verify UI with screenshot
verify_ui() {
    if [[ -z "$SCHEME" ]]; then
        log_error "Scheme name required for verify-ui action"
        echo '{"status": "error", "message": "scheme parameter is required"}'
        exit 1
    fi
    
    log_info "Verifying UI for scheme: $SCHEME on $DEVICE"
    
    # Create baseline directory
    mkdir -p "$BASELINE_DIR"
    
    # Get device UDID
    DEVICE_UDID=$(xcrun simctl list devices available | grep "$DEVICE" | head -1 | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || echo "")
    
    if [[ -z "$DEVICE_UDID" ]]; then
        log_error "Device '$DEVICE' not found"
        echo '{"status": "error", "message": "Device not found: '"$DEVICE"'"}'
        exit 1
    fi
    
    log_info "Using device UDID: $DEVICE_UDID"
    
    # Boot simulator if not running
    DEVICE_STATE=$(xcrun simctl list devices | grep "$DEVICE_UDID" | grep -oE '\(.*\)' | tr -d '()')
    if [[ "$DEVICE_STATE" != "Booted" ]]; then
        log_info "Booting simulator..."
        xcrun simctl boot "$DEVICE_UDID"
        sleep 3
    fi
    
    # Standardize status bar
    log_info "Standardizing status bar..."
    xcrun simctl status_bar "$DEVICE_UDID" override --time "9:41" --batteryLevel 100 --batteryState charged --cellularMode active --cellularBars 4 --wifiBars 3 2>/dev/null || log_warn "Status bar override not supported on this iOS version"
    
    # Build and install app
    log_info "Building app..."
    DESTINATION="platform=iOS Simulator,name=$DEVICE"
    BUILD_DIR=$(mktemp -d)
    
    if ! xcodebuild -scheme "$SCHEME" -destination "$DESTINATION" -derivedDataPath "$BUILD_DIR" build 2>&1 | tee /tmp/xcodebuild-ui.log; then
        log_error "Build failed"
        echo '{"status": "error", "message": "Build failed", "log": "/tmp/xcodebuild-ui.log"}'
        exit 1
    fi
    
    # Find .app bundle
    APP_PATH=$(find "$BUILD_DIR" -name "*.app" -type d | head -1)
    if [[ -z "$APP_PATH" ]]; then
        log_error "Could not find .app bundle"
        echo '{"status": "error", "message": "App bundle not found in build output"}'
        exit 1
    fi
    
    log_info "Installing app: $APP_PATH"
    xcrun simctl install "$DEVICE_UDID" "$APP_PATH"
    
    # Get bundle ID
    BUNDLE_ID=$(defaults read "$APP_PATH/Info.plist" CFBundleIdentifier)
    log_info "Launching app: $BUNDLE_ID"
    xcrun simctl launch "$DEVICE_UDID" "$BUNDLE_ID"
    
    # Wait for app to render
    sleep 2
    
    # Take screenshot
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    SCREENSHOT_PATH="$BASELINE_DIR/${SCHEME}_${DEVICE// /_}_${TIMESTAMP}.png"
    
    log_info "Capturing screenshot..."
    xcrun simctl io "$DEVICE_UDID" screenshot "$SCREENSHOT_PATH"
    
    log_info "Screenshot saved: $SCREENSHOT_PATH"
    
    # Check for baseline
    BASELINE_PATTERN="$BASELINE_DIR/${SCHEME}_${DEVICE// /_}_baseline.png"
    if [[ -f "$BASELINE_PATTERN" ]]; then
        log_info "Comparing with baseline..."
        # Simple file size comparison (real implementation would use image diff)
        BASELINE_SIZE=$(stat -f%z "$BASELINE_PATTERN" 2>/dev/null || stat -c%s "$BASELINE_PATTERN")
        CURRENT_SIZE=$(stat -f%z "$SCREENSHOT_PATH" 2>/dev/null || stat -c%s "$SCREENSHOT_PATH")
        SIZE_DIFF=$((CURRENT_SIZE - BASELINE_SIZE))
        
        if [[ $SIZE_DIFF -gt 10000 ]] || [[ $SIZE_DIFF -lt -10000 ]]; then
            log_warn "Significant difference detected (${SIZE_DIFF} bytes)"
            echo '{"status": "warning", "message": "Visual difference detected", "screenshot": "'"$SCREENSHOT_PATH"'", "baseline": "'"$BASELINE_PATTERN"'", "size_diff": '$SIZE_DIFF'}'
        else
            log_info "Visual verification passed"
            echo '{"status": "success", "message": "No significant visual changes", "screenshot": "'"$SCREENSHOT_PATH"'", "baseline": "'"$BASELINE_PATTERN"'"}'
        fi
    else
        log_info "No baseline found, creating baseline..."
        cp "$SCREENSHOT_PATH" "$BASELINE_PATTERN"
        echo '{"status": "success", "message": "Baseline created", "screenshot": "'"$SCREENSHOT_PATH"'", "baseline": "'"$BASELINE_PATTERN"'"}'
    fi
    
    # Cleanup
    rm -rf "$BUILD_DIR"
}

# Main dispatcher
case "$ACTION" in
    check-env)
        check_env
        ;;
    build)
        build_project
        ;;
    test)
        run_tests
        ;;
    verify-ui)
        verify_ui
        ;;
    *)
        log_error "Unknown action: $ACTION"
        echo '{"status": "error", "message": "Unknown action. Valid actions: check-env, build, test, verify-ui"}'
        exit 1
        ;;
esac
