# Test Cases: Web Session Message Isolation

## Test Case 1: Cross-Session Message Leakage Prevention
**Goal**: Verify that messages sent to Session A do not appear in Session B's view after switching.

**Steps**:
1. Open the Colony Web UI.
2. Create or select **Session A**.
3. Send a message in **Session A** that triggers a long-running response (e.g., "Write a long essay about bees").
4. Immediately click on **Session B** in the sidebar.
5. Wait for the Agent to respond to the prompt from Step 3.
6. Observe the chat message area in **Session B**.

**Expected Result**:
- No messages or thinking indicators from the Agent's response to Session A should appear in the view of Session B.

---

## Test Case 2: Immediate UI Cleanup on Session Switch
**Goal**: Verify that the message list is cleared immediately when a new session is selected.

**Steps**:
1. Select **Session A** (which has existing messages).
2. Click on **Session B**.
3. Observe the transition.

**Expected Result**:
- The message list area should become empty (or show the empty state icon) the instant Session B is clicked, before the fetch for Session B's messages completes.

---

## Test Case 3: Message Update Integrity (Thinking Dots)
**Goal**: Verify that `message_updated` events (like streaming text or thinking status) only update messages in their respective sessions.

**Steps**:
1. Trigger a thinking state in **Session A**.
2. Switch to **Session B**.
3. Observe if any thinking blocks or content updates from Session A manifest in Session B.

**Expected Result**:
- Updates to Session A's messages should be ignored by the UI while Session B is active.

---

## Test Case 4: Page Refresh Recovery
**Goal**: Verify that the underlying data remains correct.

**Steps**:
1. Perform the switch in Test Case 1.
2. Refresh the browser page.
3. Check both sessions.

**Expected Result**:
- Messages are correctly persisted and associated only with their respective rooms.
