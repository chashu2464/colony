# Stage 7 Retest Report After Claimed P1 Fixes (QA)

- Task ID: `df22275d`
- Stage: `7. Integration Testing Retest`
- Date: `2026-03-31`
- Owner: `qa_lead`
- Trigger: Developer claimed fixes for `P1-SEC-DF22275D-001` and `P1-SEC-DF22275D-002`

## 1) Execution Scope

Retest target worktree:
`/Users/casu/Documents/Colony/.worktrees/task-df22275d`

Priority execution order:
1. `TC-IDEMP-001` (cross-room replay isolation)
2. `TC-SEC-001` (forged metadata fail-closed)

## 2) Commands Executed

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

## 3) Results Summary

- `npm run test -- src/tests/unit/workflow/workflowRoute.test.ts`: PASS (`5/5`)
- `npm run build:server`: PASS
- Targeted black-box retest for P1 issues: **FAIL**

## 4) Findings (By Severity)

## P1-SEC-DF22275D-001 Cross-room idempotency collision still reproducible

- TC mapping: `TC-IDEMP-001`
- Expected:
  - Same `event_id` in different rooms must dispatch independently.
- Actual:
  - `room-a` first call: `200 success`
  - `room-b` second call (same `event_id`): `200` with `status=duplicate_ignored`
  - only one wake-up for the pair (`sentCount` does not include `room-b` dispatch)
- Core evidence:
  - log: `Workflow event replay ignored ... roomId: 'room-b' ... event_id: 'evt-same-001'`
  - response body for `room-b`: `status: duplicate_ignored`

## P1-SEC-DF22275D-002 Forged routing semantics still accepted

- TC mapping: `TC-SEC-001`
- Expected:
  - forged `decision_source` or role/actor mismatch must fail-closed with `400` deterministic error.
- Actual:
  - payload `{ next_actor_role:'architect', next_actor:'developer', decision_source:'manual_override' }` returned `200 success`
  - wake-up dispatched to `developer`
- Core evidence:
  - log: accepted event includes forged tuple and `decision_source: 'manual_override'`
  - response body: `success: true`

## 5) P0/P1 Mandatory Three Questions

## For P1-SEC-DF22275D-001

1. 修复内容
- Ensure idempotency key is room-scoped: `roomId:event_id` (or equivalent composite).
- Add executable regression test proving same `event_id` across `room-a/room-b` dispatches twice.

2. 引入原因
- Idempotency audit map still uses global event scope in runtime behavior.

3. 归因路径
- Claimed patch is not present in current tested code path (`workflow.ts` runtime still exhibits global replay suppression).

## For P1-SEC-DF22275D-002

1. 修复内容
- Enforce semantic validation against workflow truth source and `decision_source` allowlist.
- Reject forged role/actor/source tuple with `400 + WF_STAGE_TRANSITION_INVALID`.

2. 引入原因
- Runtime validation remains structural/routability only; semantic trust boundary is not enforced.

3. 归因路径
- Claimed route hardening is not observable in current tested implementation and no corresponding regression assertions exist in current test file.

## 6) Stage 7 Gate Decision

- Gate: `FAIL` (Blocked)
- Rationale: Both previously-blocking P1 defects remain reproducible in independent retest.

## 7) Required Follow-up

1. Re-submit actual code changes for:
- room-scoped idempotency key
- semantic validation against workflow history truth (including `decision_source` allowlist and role/actor consistency)

2. Add/commit executable regressions in:
- `src/tests/unit/workflow/workflowRoute.test.ts`

3. Return with command evidence and response bodies for:
- cross-room same `event_id` independent dispatch
- forged metadata fail-closed `400`
