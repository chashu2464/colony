// ── Colony: Workflow Event API Test ──────────────────────
// Tests for the workflow event notification endpoint.

async function testWorkflowEventAPI() {
    console.log('=== Testing Workflow Event API ===\n');

    const port = process.env.PORT || 3001;
    const roomId = process.argv[2] || 'test-room-123';
    const url = `http://localhost:${port}/api/workflow/events`;

    const payload = {
        type: 'WORKFLOW_STAGE_CHANGED',
        roomId: roomId,
        from_stage: 5,
        to_stage: 6,
        next_actor_role: 'developer',
        next_actor: 'developer',
        event_id: `wf-test-${Date.now()}`,
        decision_source: 'stage_map'
    };

    console.log(`Sending POST request to ${url} for room ${roomId}...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 404) {
            console.error('\n✗ Failed: Endpoint not found (404). Is the server running and route registered?');
            return;
        }

        const result = await response.json() as any;
        console.log('Response status:', response.status);
        console.log('Response body:', result);

        if (response.ok && result.success) {
            console.log('\n✓ Workflow event handled successfully!');
        } else {
            console.error('\n✗ Failed to handle workflow event:', result.error || 'Unknown error');
        }
    } catch (error: any) {
        console.error('\n✗ Request failed:', error.message);
        console.log('(Make sure the Colony server is running)');
    }
}

testWorkflowEventAPI();
