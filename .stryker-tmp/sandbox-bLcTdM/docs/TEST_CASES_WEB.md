# Test Cases: Web Frontend

## IME (Input Method Editor) Conflict Fix

### Overview
Verification of the fix for accidental message submission when using IME (e.g., Chinese/Japanese input) to confirm English characters with the 'Enter' key.

### TC-01: Standard Message Submission (Non-IME)
- **Given**: The user is in a chat session and the input box is focused.
- **Given**: The IME is NOT active (direct English input mode).
- **When**: The user types "Hello" and presses `Enter`.
- **Then**: `isComposing` is `false`.
- **Then**: The message "Hello" is sent to the session.
- **Then**: The input box is cleared.

### TC-02: Multi-line Input (Shift + Enter)
- **Given**: The user is in a chat session and the input box is focused.
- **When**: The user types "Line 1" and presses `Shift + Enter`.
- **Then**: A newline is inserted in the input box.
- **Then**: The message is NOT sent.

### TC-03: IME Confirmation (Confirming English in Chinese IME)
- **Given**: The user is in a chat session and the input box is focused.
- **Given**: A Chinese IME is active.
- **When**: The user types "colony" (appearing in the IME composition window) and presses `Enter` to confirm the English string.
- **Then**: `e.nativeEvent.isComposing` is `true`.
- **Then**: The string "colony" is committed to the input box.
- **Then**: The message is NOT sent to the session.

### TC-04: IME Candidate Selection (Confirming Pinyin)
- **Given**: The user is in a chat session and the input box is focused.
- **Given**: A Chinese IME is active.
- **When**: The user types "nihao" and presses `Enter` to confirm the Pinyin or select the first candidate.
- **Then**: `e.nativeEvent.isComposing` is `true`.
- **Then**: The text is committed to the input box (or remains in composition).
- **Then**: The message is NOT sent to the session.

## Regression Tests

### TC-05: Build and Type Safety
- **Given**: The web frontend source code.
- **When**: Running `npm run build` in the `web` directory.
- **Then**: The build process completes without TypeScript errors or linting violations.
