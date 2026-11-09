# Helpdesk connection

The code supports Team 14 proposal v0.4. Deployment and a joint test with Team 14 are still required.

## Setup

1. Apply `backend/supabase/migrations/015_helpdesk_integration.sql` after migration 014.
2. Set private backend environment variables from `backend/.env.example`:
   - `HELPDESK_API_KEY`: a new, random read-only credential shared with Helpdesk.
   - `HELPDESK_WEBHOOK_URL`: Team 14's full receiver URL.
   - `HELPDESK_WEBHOOK_SECRET`: the private HMAC signing secret agreed with Team 14.
   - `HELPDESK_WORKER_SECRET`: a separate worker credential, kept within Team 10.
3. Deploy the backend and frontend. The optional Helpdesk reference is available on both report forms. Enter the `TKT-xxxxx` reference provided by Helpdesk; the confirmation gives the work-order UUID to copy into their linking screen.
4. Run `npm run worker:helpdesk --prefix backend` on an always-on host. Set `HELPDESK_WORKER_URL` to the deployed backend's `/api/integrations/helpdesk/deliver` endpoint and supply the same worker secret on that host. For a single pass, append `-- --once`.

Alternatively, configure your scheduler to call `GET /api/integrations/helpdesk/deliver` every minute with `Authorization: Bearer <HELPDESK_WORKER_SECRET>`. No scheduler is installed automatically. The worker must run for pending deliveries to leave the queue. Do not expose worker credentials in a browser or reuse another partner's key.

## Lookup

`GET /api/v1/work-orders/{uuid}` requires `Authorization: Bearer <HELPDESK_API_KEY>`. Send `X-Correlation-Id`; the response echoes it. Responses are not cached. Only non-archived work orders created with a Helpdesk ticket reference are available through this endpoint; unrelated work orders return 404.

The response is `{ "data": { "id": "<uuid>", "status": "in_progress", "ticketRef": "TKT-00012", "updatedAt": "<ISO timestamp>" } }`. No names, descriptions, title, location or repair notes are exposed. Team 14 must confirm it can use this minimum response; its draft also mentions title and location.

Internal statuses remain unchanged. The Helpdesk lookup and webhook adapter use `OPEN -> reported`, `ASSIGNED -> assigned`, `IN_PROGRESS -> in_progress`, `RESOLVED -> completed`, and `CLOSED -> closed`. These match the vocabulary in Team 14's draft. Maintenance never resolves the Helpdesk ticket. Cancellation is not implemented as a lifecycle status.

## Events and recovery

The database queues `maintenance.status_changed` atomically when a tagged work order is created or changes status. The initial `reported` event has `previousStatus: null`. References are immutable; one non-archived work order can use a ticket reference at a time. Public references are supplied by the submitter, so Helpdesk must independently authorise linking rather than treating a reference as proof of ownership.

The sender uses `X-Timestamp` in Unix seconds and lowercase hex `X-Signature = HMAC-SHA256(secret, timestamp + "." + rawBody)`. `X-Correlation-Id` is the stable event UUID. Each attempt has a three-second timeout. Retries keep identical body bytes and event ID, with a fresh timestamp/signature. The shared secret is never sent as a header.

Only 200 and 202 acknowledge delivery. A 5xx or network failure schedules another attempt after 1, 5 and 30 minutes (four attempts total). Other responses stop automatic retries. Scheduling is approximate to worker polling intervals. Per-work-order pending events are sent in lifecycle order; concurrent workers use a 60-second lease and a lease token so stale workers cannot acknowledge a newer attempt. Duplicate delivery remains possible after a lost acknowledgement; Helpdesk must deduplicate event IDs.

Inspect `public.helpdesk_outbox` through a trusted administrative database session for pending/failed events. Failures retain their exact body and ID. After correcting receiver configuration, an administrator can replay a failed event:

```sql
update public.helpdesk_outbox
set state = 'pending', attempts = 0, available_at = now(),
    lease_token = null, leased_until = null, delivered_at = null
where event_id = '<event-uuid>' and state = 'failed';
```

Use the database owner for this recovery; the API service has no direct outbox write permission. Replay never changes the event ID. Helpdesk should initialise linked status from lookup and handle older/delayed updates; events received before linking may be acknowledged with 202.

## Verification

- `npm run test:helpdesk --prefix backend`: actual API handlers, credentials, reference validation, signature formula, real local HTTP receiver and timeout checks; includes Student Identity creation regression tests.
- `npm run test:helpdesk:db --prefix backend`: isolated PostgreSQL migration, permissions, atomic lifecycle/outbox rollback, exact event shape, real HTTP 503/recovery, lease fencing and retry exhaustion. Requires `PGLITE_PACKAGE_ROOT` pointing to a separate temporary installation of `@electric-sql/pglite@0.3.15`; it does not use the hosted database.
- From the repository root, run `postman simulation run postman/simulations/helpdesk.sim.yaml --port 4514 --no-history --output ndjson`, then `node --experimental-strip-types backend/scripts/test-helpdesk-simulation.mjs`. The stand-in comes from the supplied draft and exercises acceptance, 5xx and timeout; it does not establish live compatibility.

The versioned webhook response cases are recorded in `backend/contracts/helpdesk-webhook.openapi.json`. Run Team 14's eight joint tests against both test deployments before production use. No real Helpdesk secret or test URL is bundled.
