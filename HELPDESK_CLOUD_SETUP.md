# Helpdesk cloud delivery

## What changes

Supabase queues a request to the existing Vercel worker immediately after an
outbox insert commits. This covers direct Helpdesk creation, public reports,
authenticated reports and all status transitions, including database-originated
changes. Rolled-back transactions send nothing. Bursts within ten seconds share
a kick; the worker processes up to ten events per invocation and cron handles
remaining work. Helpdesk event IDs, signatures, ordering, leases and retries stay
unchanged. Team 12 is unchanged.

A Supabase Cron job checks every minute for due events, including expired leases
and retries. An idle queue does not invoke Vercel. No laptop process is needed.
This uses the existing deployed delivery endpoint, so no Vercel code deployment
is needed for this migration. The Supabase project must remain running.

## Activate in your existing Supabase project

These steps need the database owner (`postgres`) in the Supabase dashboard.
The migration is deliberately disabled initially; installing it alone does not
activate delivery. Do not run unrelated pending migrations blindly.

1. Confirm migrations 015–018 are already applied to the database used by the
   production backend, and that its `/api/integrations/helpdesk/deliver` endpoint
   is deployed with the worker and Helpdesk receiver credentials.
2. Run `backend/supabase/migrations/019_helpdesk_cloud_delivery.sql` in SQL Editor.
   It installs the managed extensions, the private configuration, an outbox
   trigger, and the `maintenance-helpdesk-delivery` cron job.
3. In Supabase Vault, add a secret named `maintenance_helpdesk_worker_secret`.
   Its value must match the production Vercel `HELPDESK_WORKER_SECRET` exactly
   and be at least 16 characters. Use the existing dedicated worker credential;
   never use a Supabase service-role key or a partner credential. Keep the value
   out of committed SQL and screenshots. Vault encrypts it at rest, but pg_net
   temporarily stores the decrypted HTTP header in its request queue; database
   roles with pg_net access can read it. Restrict database access accordingly:
   https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357
4. Activate the private configuration in SQL Editor:

   ```sql
   update maintenance_private.helpdesk_cloud_delivery
   set enabled = true
   where singleton;
   select maintenance_private.request_helpdesk_delivery();
   ```

   This immediately processes any due, existing Helpdesk events. A null result
   means no work is due, delivery is disabled, the secret is missing, or a recent
   request already covers this burst. It is not proof of an HTTP success.
5. Run `backend/scripts/verify-helpdesk-cloud.sql` in a separate execution after
   the request completes. Confirm the named job is active. When a request has
   been made, expect HTTP 200 with `processed` and `delivered` counts. A cron
   status of `succeeded` alone does not prove successful HTTP delivery. HTTP 401
   means the worker secret does not match; 503 requires checking the backend's
   Helpdesk/database configuration. Do not paste keys into troubleshooting logs.
6. During the next legitimate Helpdesk repair/status change, verify that the
   outbox event becomes `delivered` and the Helpdesk side receives the update.
   Keep the Windows task `Maintenance-Team10-Helpdesk-Delivery` disabled.

## Pause and resume

Pause both cloud triggers without deleting any repair or queued event:

```sql
update maintenance_private.helpdesk_cloud_delivery set enabled = false where singleton;
```

Already queued HTTP requests can still finish. Set `enabled = true` to resume.
The local `.env.local` flag `HELPDESK_DELIVERY_ENABLED` controls only the old
laptop script; it does not pause the cloud scheduler.

## Validation and limitations

Run `npm run test:helpdesk:cloud --prefix backend` with `PGLITE_PACKAGE_ROOT`
pointing to a separate installation of `@electric-sql/pglite@0.3.15`. It executes
the migration's SQL on isolated PostgreSQL, using SQL stand-ins for managed
Vault, pg_cron and pg_net. It checks rollback, burst coalescing, idle/future/leased
work, retry kicks, ordering, failures and permissions. It cannot prove that
Supabase's background extensions or the deployed credentials are configured.
Run the existing Helpdesk database and HTTP simulation suites as well.

Cloud activation and live delivery must be verified separately. No scheduler can
deliver while Supabase or Vercel is unavailable; durable events remain queued
for subsequent runs, subject to the existing four-attempt retry policy.

References: https://supabase.com/docs/guides/cron/quickstart and
https://supabase.com/docs/guides/database/extensions/pg_net
