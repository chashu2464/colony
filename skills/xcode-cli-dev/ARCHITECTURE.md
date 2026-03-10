# Xcode CLI Development - Architecture Design

## Problem Statement

AI agents need to develop iOS/macOS applications without access to Xcode IDE's GUI. Traditional Xcode development relies heavily on Interface Builder, visual debuggers, and interactive simulators, which are inaccessible in a headless CLI environment.

## Design Goals

1. **Full CLI Automation**: Enable complete development lifecycle via command-line tools
2. **Visual Confidence**: Provide visual verification without live preview
3. **Reproducible Builds**: Ensure consistent results across environments
4. **Git-Friendly**: All artifacts must be text-based and version-controllable
5. **Integration**: Seamlessly integrate with existing Colony workflows

## Architecture Decisions

### Decision 1: Code-Only Development Paradigm

**Choice**: Mandate SwiftUI for all new UI, prohibit Storyboards/XIBs

**Rationale**:
- Storyboards are XML files requiring visual editor for practical editing
- SwiftUI is declarative and fully code-based
- Code is AI-editable, git-friendly, and reviewable
- Reduces "works on my machine" issues from binary file corruption

**Trade-offs**:
- Learning curve for UIKit-heavy teams
- Legacy code requires refactoring
- Some complex layouts harder in SwiftUI (mitigated by iOS 15+ improvements)

**Alternatives Considered**:
- XML editing of Storyboards: Too error-prone, no validation
- Programmatic UIKit: Verbose, harder to maintain than SwiftUI

### Decision 2: Visual Regression Testing via Screenshots

**Choice**: Automated screenshot capture + baseline comparison

**Rationale**:
- Without live preview, need confidence that UI renders correctly
- Screenshots provide visual documentation
- Baseline comparison catches unintended regressions
- Standardized simulator state ensures reproducibility

**Implementation**:
- `xcrun simctl io booted screenshot` for capture
- `xcrun simctl status_bar override` for consistent state (9:41 AM, 100% battery)
- Git-tracked baselines in `.xcode-baselines/`
- Human review for pixel differences

**Trade-offs**:
- False positives from minor rendering differences
- Requires manual baseline updates
- Storage cost for baseline images

**Alternatives Considered**:
- Swift Snapshot Testing library: Requires code integration, adds dependency
- No visual testing: Too risky for blind development
- Video recording: Higher storage cost, harder to diff

### Decision 3: Standardized Simulator Configuration

**Choice**: Default to iPhone 15 with fixed status bar state

**Rationale**:
- Reproducibility requires eliminating variables
- Status bar (time, battery) changes cause false positives
- Single device type reduces resource usage
- iPhone 15 represents modern iOS capabilities

**Configuration**:
```bash
xcrun simctl status_bar <UDID> override \
  --time "9:41" \
  --batteryLevel 100 \
  --batteryState charged \
  --cellularMode active \
  --cellularBars 4 \
  --wifiBars 3
```

**Trade-offs**:
- Doesn't test device-specific layouts (iPad, SE)
- Requires manual testing for edge cases

**Alternatives Considered**:
- Multiple device matrix: Too slow, resource-intensive
- Random device: Non-reproducible results

### Decision 4: Integration with Colony Workflows

**Choice**: Standalone skill that composes with `quick-task` and `dev-workflow`

**Rationale**:
- Separation of concerns: Xcode operations vs. git workflow
- Reusable across different project types
- Allows independent evolution of each skill

**Integration Pattern**:
```bash
# Start workflow
quick-task start "Fix button"

# Use xcode-cli-dev for verification
xcode-cli-dev verify-ui --scheme MyApp

# Complete workflow
quick-task done
```

**Trade-offs**:
- Requires two skill invocations
- Agents must understand composition

**Alternatives Considered**:
- Monolithic skill: Too complex, hard to maintain
- Xcode-specific workflow: Duplicates git logic

### Decision 5: Dependency Management Strategy

**Choice**: Prefer Swift Package Manager, support CocoaPods

**Rationale**:
- SPM is native, no external tools required
- `Package.swift` is code, easily editable
- CocoaPods still widely used, must support
- Carthage requires manual binary management (incompatible with CLI)

**Implementation**:
- SPM: Direct editing of `Package.swift`
- CocoaPods: `pod install` via bash, edit `Podfile` as text

**Trade-offs**:
- CocoaPods requires Ruby environment
- SPM not universally adopted yet

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Colony Agent                             │
│  (Architect, Developer, QA)                                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Invokes skill
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              xcode-cli-dev Skill                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  check-env   │  │    build     │  │     test     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────────────────────────────────────────┐      │
│  │              verify-ui                            │      │
│  │  (build → install → launch → screenshot → diff)  │      │
│  └──────────────────────────────────────────────────┘      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Calls
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                  Xcode CLI Tools                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ xcodebuild   │  │ xcrun simctl │  │ xcode-select │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Operates on
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                  Xcode Project                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  .xcodeproj  │  │  .swift files│  │  Info.plist  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────────────────────────────────────────┐      │
│  │         .xcode-baselines/ (screenshots)          │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Build Flow
```
Agent → xcode-cli-dev build
  → xcodebuild -scheme <Scheme> -sdk iphonesimulator build
  → Compilation logs → /tmp/xcodebuild.log
  → Success/Error JSON response
```

### Visual Verification Flow
```
Agent → xcode-cli-dev verify-ui
  → xcodebuild build
  → xcrun simctl boot <device>
  → xcrun simctl status_bar override (standardize)
  → xcrun simctl install <app>
  → xcrun simctl launch <bundle-id>
  → xcrun simctl io screenshot
  → Compare with baseline
  → Success/Warning JSON response + screenshot path
```

## Error Handling Strategy

### Environment Errors
- **xcode-select misconfigured**: Return error with fix command
- **Simulator unavailable**: Return error with diagnostic info
- **Scheme not found**: Return error with available schemes list

### Build Errors
- **Compilation failure**: Extract first 5 errors, return with log path
- **Missing dependencies**: Detect and suggest `pod install` or SPM resolution

### Runtime Errors
- **Simulator boot failure**: Retry once, then fail with diagnostics
- **App crash on launch**: Return crash log path for analysis

## Performance Considerations

### Build Time
- **Cold build**: 30-120s depending on project size
- **Incremental build**: 5-30s
- **Optimization**: Use `-derivedDataPath` to cache builds

### Screenshot Capture
- **Simulator boot**: 3-5s
- **App launch**: 1-2s
- **Screenshot**: <1s
- **Total**: ~10s per verification

### Resource Usage
- **Simulator RAM**: 2-4GB per instance
- **Build artifacts**: 1-5GB per project
- **Baseline images**: ~500KB per screenshot

## Security Considerations

### Code Injection
- All Swift code is directly editable by agents
- Risk: Malicious code injection
- Mitigation: Code review by human, automated security scanning

### Simulator Access
- Simulators have access to host filesystem
- Risk: Data exfiltration via app
- Mitigation: Run in sandboxed environment, monitor network

### Credential Management
- Apps may require API keys, certificates
- Risk: Exposure in git
- Mitigation: Use environment variables, `.gitignore` secrets

## Scalability

### Single Project
- Current design handles 1 project at a time
- Sufficient for typical agent workflow

### Multiple Projects
- Future: Support workspace-level operations
- Challenge: Shared simulators, build conflicts

### Parallel Builds
- Future: Multiple simulators for parallel testing
- Challenge: Resource contention, coordination

## Maintenance

### Xcode Version Updates
- Breaking changes in `xcodebuild` CLI
- Mitigation: Version detection, compatibility layer

### iOS Version Updates
- New simulator runtimes
- Mitigation: Auto-detect available devices

### Skill Updates
- Backward compatibility for existing projects
- Versioning strategy: Semantic versioning in SKILL.md

## Success Metrics

1. **Environment Setup Success Rate**: >95% on first try
2. **Build Success Rate**: >90% for valid projects
3. **Visual Regression False Positive Rate**: <10%
4. **Average Verification Time**: <15s
5. **Agent Adoption Rate**: >80% of iOS projects use this skill

## Future Enhancements

1. **Advanced Image Diffing**: Integrate perceptual diff algorithms
2. **Multi-Device Testing**: Parallel testing on iPhone/iPad
3. **Performance Profiling**: CLI-based Instruments integration
4. **Crash Symbolication**: Automatic crash log analysis
5. **SwiftUI Preview Extraction**: Generate previews from code
6. **Accessibility Testing**: Automated VoiceOver verification

## References

- [xcodebuild man page](https://developer.apple.com/library/archive/technotes/tn2339/)
- [simctl documentation](https://nshipster.com/simctl/)
- [Swift Package Manager](https://swift.org/package-manager/)
- [Swift Snapshot Testing](https://github.com/pointfreeco/swift-snapshot-testing)
