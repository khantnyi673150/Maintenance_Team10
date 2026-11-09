# Student Identity Integration

This document explains how Maintenance Team 10 checks student identity claims when someone submits a public maintenance report, and what to coordinate with the Student Identity team.

## What the integration does

The public report form allows a reporter to optionally enter a student ID. The backend then requests that ID's claims from Student Identity. A report is still created if the ID is omitted or the identity service cannot confirm the claims.

The integration checks the ID's claims; it does **not** authenticate the reporter or prove that the person submitting the report owns the entered student ID. Do not treat this status as a login or authorization decision.

## Request flow

1. The public form sends the report fields and optional `student_id` to `POST /api/public/work-orders`.
2. The backend calls `GET https://student-identity.onrender.com/students/{studentId}/claims` with the `X-API-Key` header.
3. The backend marks the ID as verified only when the response confirms both student verification and profile completeness. It recognizes claim keys such as `student_verified` and `profile_complete` (also supported: `verified`, `is_student`, `is_verified_student`, and `is_profile_complete`, including equivalent normalized key formatting).
4. The backend creates the report through Supabase and saves only the status, not the student ID or full claims.
5. The public tracker and staff request details display one of these labels:
   - `Student ID claims verified`
   - `Student ID claims not verified`
   - `Student ID not checked` (for records whose status remains `not_checked`, such as older records)

An omitted ID, missing/false claims, missing consent, or an unavailable provider cannot produce a verified status. These cases do not prevent report creation.

## Coordinate with the Student Identity team

Before using the integration with real users, confirm with that team:

- The claims endpoint and deployment URL are current. The current backend is configured to use `https://student-identity.onrender.com`.
- Team 10 has an active API key and knows how to rotate it.
- The expected API-key header is `X-API-Key`.
- Students must grant the required `profile:read` consent for Maintenance to read claims.
- The response contains stable boolean claims for student verification and profile completeness. Confirm the exact names and response shape; the backend currently supports the names listed above.
- The team understands that Maintenance stores only a three-state result and does not store the submitted ID or claims payload.
- Any rate limits, test IDs, support contact, or service-availability expectations for integration testing.

Send API keys through the teams' approved private channel only. Do not commit keys to Git, put them in frontend environment variables, or share them in screenshots or chat.

## Backend configuration

Set the key in `backend/.env.local` for local development:

```dotenv
STUDENT_IDENTITY_API_KEY=<key-provided-securely-by-student-identity-team>
```

Keep it in the backend environment only. The optional staff **Identity test** view uses the same server-side key; it is a separate manual claims-inspection tool and is not required for public report submission.

For a deployed backend, add `STUDENT_IDENTITY_API_KEY` to that backend's environment-variable settings and redeploy/restart the backend. Do not set it on the frontend deployment.

## Database migration

Migration `backend/supabase/migrations/014_public_student_identity_status.sql` adds the `student_identity_status` column and updates the database functions used to create and list public work orders.

If migration 014 has not been applied to the correct Supabase project:

1. Open that project's **Supabase Dashboard → SQL Editor**.
2. Review and run only migration 014's SQL.
3. Confirm the query succeeds and the `work_orders.student_identity_status` column exists.

Do not approve or apply a batch of older pending migrations just to install migration 014. The Supabase CLI may show older migrations as pending if they were applied manually without updating CLI migration history. Check the target project and migration history before using `supabase db push`.

## Run and test locally

Start the backend from a PowerShell terminal:

```powershell
cd backend
npm run dev
```

Start the frontend in a second terminal:

```powershell
cd frontend
npm run dev
```

Open the public report form, enter a test student ID that has granted the required consent, and submit a report. Confirm the result appears in the form/tracker and in staff request details. Also test with no ID and with an ID for which claims are unavailable or consent is denied; the report should still be saved, without a verified status.

Run the backend route test from the backend directory:

```powershell
node --experimental-strip-types --test tests/public-student-identity-route.test.mjs
```

The route tests use mocked provider and Supabase requests; they do not call the live Student Identity service. Coordinate test IDs and consent with that team before doing a live check.

## Troubleshooting

- **Status is not verified:** Confirm the student granted `profile:read` consent and that the provider returns both required boolean claims as `true`.
- **Claims are unavailable or access is denied:** Check the backend's `STUDENT_IDENTITY_API_KEY`, confirm it is current, and ask the Identity team to verify the API key and consent state.
- **Local reports fail at database creation:** Confirm migration 014 was applied to the Supabase project configured in `backend/.env.local`.
- **Report creation still succeeds but claims are unavailable:** This is expected fail-open behavior for this optional check; the report status must not be interpreted as verified.
