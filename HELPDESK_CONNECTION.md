# Helpdesk connection

The code supports Team 14 proposal v0.4. Deployment and a joint test with Team 14 are still required.

## Setup

1. After migration 014, apply `015_helpdesk_integration.sql`, `016_helpdesk_direct_creation.sql`, then `017_helpdesk_category.sql`. Migration 016 enables direct creation; migration 017 adds the optional category field. Apply migration 017 before deploying category support.
2. Set private backend environment variables from `backend/.env.example`:
   - `HELPDESK_API_KEY`: the dedicated lookup and direct-creation credential shared with Helpdesk.
   - `HELPDESK_WEBHOOK_URL`: Team 14's full receiver URL.
   - `HELPDESK_WEBHOOK_SECRET`: the private HMAC signing secret agreed with Team 14.
   - `HELPDESK_WORKER_SECRET`: a separate worker credential, kept within Team 10.
3. Deploy the backend and frontend. The optional Helpdesk reference is available on both report forms. Enter the `TKT-xxxxx` reference provided by Helpdesk; the confirmation gives the work-order UUID to copy into their linking screen.
4. Run `npm run worker:helpdesk --prefix backend` on an always-on host. Set `HELPDESK_WORKER_URL` to the deployed backend's `/api/integrations/helpdesk/deliver` endpoint and supply the same worker secret on that host. For a single pass, append `-- --once`.

Alternatively, configure your scheduler to call `GET /api/integrations/helpdesk/deliver` every minute with `Authorization: Bearer <HELPDESK_WORKER_SECRET>`. No scheduler is installed automatically. The worker must run for pending deliveries to leave the queue. Do not expose worker credentials in a browser or reuse another partner's key.

On Windows, `npm run worker:helpdesk:install --prefix backend` installs the `Maintenance-Team10-Helpdesk-Delivery` scheduled task. It runs a hidden single-pass worker every minute while the installing user is signed in and the laptop is awake. Logs are in the ignored `backend/.helpdesk-worker.log`. Set `HELPDESK_DELIVERY_ENABLED=false` in `backend/.env.local` to keep delivery paused; change it to `true` only when the backend and Helpdesk receiver are ready. This local task does not run on Vercel or on another laptop. For a laptop-independent deployment, use an always-on host or an external scheduler.

`npm run check:helpdesk:live --prefix backend` checks backend readiness, receiver POST availability, migration 015 and the existing `TKT-00012` lookup without creating a repair or changing a status. It sends only an empty unsigned probe to the receiver; a 400/401 proves the handler is reachable, not that the shared signing secret matches.

## Direct creation and manual backup

`POST /api/v1/work-orders` uses the same Bearer credential as lookup. Send `X-Correlation-Id` and `Content-Type: application/json`. Required fields are `ticketRef`, `title` and `description`. `location` and `category` are optional. Personal information is not required.

Example request: `{ "ticketRef": "TKT-00012", "title": "Air conditioner in room B-204 not working", "description": "It does not cool and makes a noise." }`.

A new request returns HTTP 201 with `{ "data": { "id": "<uuid>", "status": "reported", "ticketRef": "TKT-00012", "updatedAt": "<ISO timestamp>" } }`. A retry with the same reference returns HTTP 200 and the original work order with its current status. Retries never overwrite repair details or queue another creation event. A matching manual submission also counts as an existing work order. A creation receipt preserves the original UUID even if the work order is later archived.

Missing or invalid fields return HTTP 400 with `{ "error": { "code": "...", "message": "..." } }`. Unauthorised calls return 401. A temporary database error or timeout returns 503; retry using the same reference. Responses echo the correlation ID and disable caching.

Accepted category values are exactly `Plumbing`, `Electrical`, `HVAC` and `Safety` (case sensitive). A valid category is saved and the new repair enters that trade's normal assignment workflow. Omit category or send `null` to enter Manual Review. Unknown category strings return 400. The original three-field request remains supported.

Location is stored when provided; otherwise it is marked `Location to be confirmed`. Category and location are not guessed from free text. Repeating a reference never changes its original category, title, description or location, including when the original request omitted category. The report screen and UUID linking remain available as a manual backup.

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
- `npm run test:helpdesk:concurrency --prefix backend`: duplicate API calls, API/manual-form races and rollback recovery on a real disposable PostgreSQL server. Requires an empty loopback database named `helpdesk_test` through `HELPDESK_TEST_DATABASE_URL`, plus `PG_PACKAGE_ROOT` pointing to a temporary installation of `pg`. It refuses a hosted database or a nonempty test schema.
- From the repository root, run `postman simulation run postman/simulations/helpdesk.sim.yaml --port 4514 --no-history --output ndjson`, then `node --experimental-strip-types backend/scripts/test-helpdesk-simulation.mjs`. The stand-in comes from the supplied draft and exercises acceptance, 5xx and timeout; it does not establish live compatibility.

The versioned webhook response cases are recorded in `backend/contracts/helpdesk-webhook.openapi.json`. Run Team 14's eight joint tests against both test deployments before production use. No real Helpdesk secret or test URL is bundled.
