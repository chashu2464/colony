# Stage 7 Retest Report Round 2 (QA)

- Task ID: `df22275d`
- Stage: `7. Integration Testing Retest`
- Date: `2026-03-31`
- Owner: `qa_lead`
- Trigger: Developer re-submitted fixes for `P1-SEC-DF22275D-001` and `P1-SEC-DF22275D-002`

## 1) Scope & Priority

Priority order executed:
1. `TC-IDEMP-001` cross-room replay isolation
2. `TC-SEC-001` forged metadata fail-closed

Retest worktree:
`/Users/casu/Documents/Colony/.worktrees/task-df22275d`

## 2) Evidence Commands

```bash
npm run test -- src/tests/unit/workflow/workflowRoute.test.ts
npm run build:server
node <<'NODE'
const express = require('express');
const { createWorkflowRouter } = require('./dist/server/routes/workflow.js');

async function post(port, payload){
  const res = await fetch(`http://127.0.0.1:${port}/api/workflow/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  return {status:res.status, body: await res.json()};
}

(async ()=>{
  const sent = [];
  const room = (id)=>({
    getAgents: ()=>[
      {id:'developer',name:'开发者'},
      {id:'qa-lead',name:'QA负责人'},
      {id:'architect',name:'架构师'}
    ],
    sendSystemMessage:(content,mentions)=>{sent.push({room:id,content,mentions});}
  });
  const rooms = new Map([['room-a',room('room-a')],['room-b',room('room-b')]]);
  const roomManager = {getRoom:(id)=>rooms.get(id)};

  const app = express();
  app.use(express.json());
  app.use('/api/workflow', createWorkflowRouter(roomManager));
  const server = app.listen(0);
  const port = server.address().port;

  const base = {
    type:'WORKFLOW_STAGE_CHANGED',
    from_stage:6,
    to_stage:7,
    event_id:'evt-same-001',
    next_actor_role:'qa_lead',
    next_actor:'qa-lead',
    decision_source:'stage_map'
  };

  const r1 = await post(port,{...base,roomId:'room-a'});
  const r2 = await post(port,{...base,roomId:'room-b'});

  const forged = await post(port,{
    type:'WORKFLOW_STAGE_CHANGED',
    roomId:'room-a',
    from_stage:6,
    to_stage:7,
    event_id:'evt-forged-001',
    next_actor_role:'architect',
    next_actor:'developer',
    decision_source:'manual_override'
  });

  server.close();
  console.log(JSON.stringify({r1,r2,forged,sentCount:sent.length,sent},null,2));
})();
NODE
```

## 3) Results

- `npm run test -- src/tests/unit/workflow/workflowRoute.test.ts` => PASS (`8/8`)
- `npm run build:server` => PASS
- Black-box retest => PASS
  - `room-a + evt-same-001` => `200 success`
  - `room-b + evt-same-001` => `200 success` (not duplicate)
  - forged payload (`manual_override` + role/actor mismatch) => `400 WF_STAGE_TRANSITION_INVALID`
  - `sentCount = 2` (room-a and room-b both dispatched)

## 4) Given-When-Then Validation

### TC-IDEMP-001 (Cross-room idempotency isolation)
- Given two different rooms (`room-a`, `room-b`) and same `event_id=evt-same-001`
- When both rooms post valid workflow event payload
- Then both requests return `200` with `success=true`, neither is `duplicate_ignored`, and wake-up dispatch count is `2`

### TC-SEC-001 (Forged metadata fail-closed)
- Given forged metadata (`decision_source=manual_override`, `next_actor_role=architect`, `next_actor=developer`)
- When posting to `/api/workflow/events`
- Then route rejects with `400` and deterministic code `WF_STAGE_TRANSITION_INVALID`, and no extra wake-up dispatch occurs

## 5) P0/P1 Status

- No reproducible P0/P1 found in this retest scope.
- Previously blocking P1 defects are verified fixed in runtime behavior.

## 6) Stage 7 Gate Declaration

- Gate decision: `PASS` (allow promotion to Stage 8)
- Verified scenario classes:
  1. Cross-room idempotency scope isolation
  2. Forged routing metadata fail-closed semantics
  3. Deterministic structured error signaling for invalid transition semantics

## 7) Residual Risks

1. Idempotency audit remains in-process memory; process restart clears replay history (operational tradeoff, not a Stage 7 blocker).
2. Current retest focuses on priority P1 closure paths; full-load performance and distributed multi-instance idempotency strategy should be covered in later hardening.
