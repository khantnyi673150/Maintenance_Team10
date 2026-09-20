# Maintenance Team 10 API

This repository contains the Assignment #3 database migration and Next.js API implementation for the Maintenance platform.

## Setup

The database is hosted in Supabase. The backend and frontend run locally:

- Supabase database and authentication: hosted project
- Backend API: `http://localhost:3000`
- Frontend API console: `http://localhost:3001`

### Prerequisites

- Node.js 20 or later and npm
- A Supabase account with access to the Team 10 project
- The Supabase project URL and anon/publishable key
- The test account passwords, shared separately from this repository

### Environment files

1. Install dependencies:

   ```powershell
   cd backend
   npm install
   ```

2. Create the backend environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Replace the placeholder values in `backend/.env.local`:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-or-publishable-key>
   FRONTEND_ORIGINS=http://localhost:3001
   ```

   Do not commit `.env.local` or share passwords and access tokens in the repository.

### Database setup

The schema and API functions are in `supabase/migrations`. Link the Supabase CLI to the shared project:

```powershell
cd backend
npx supabase login
npx supabase link --project-ref <project-ref>
```

For a new Supabase project, open the Supabase Dashboard SQL Editor and run the migration files in numeric order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_api_policies_and_lifecycle.sql`
3. `supabase/migrations/003_atomic_create_and_start.sql`
4. `supabase/migrations/004_seed_api_test_data.sql`
5. `supabase/migrations/005_fix_api_test_uuid_values.sql`

The current repository uses legacy numeric migration names. If `npx supabase db push` reports that remote migration versions are missing locally, use the SQL Editor procedure above instead of repairing or deleting remote migration history. The final seed migration adds the valid API-console location and category IDs.

### Start the applications

Open two PowerShell terminals from `Maintenance_Team10`.

Terminal 1, backend:

```powershell
cd backend
npm install
npm run dev
```

Terminal 2, frontend:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set these values in `frontend/.env.local`:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-or-publishable-key>
```

Open the console at `http://localhost:3001` and check the backend at `http://localhost:3000/api/health`.

### First API test

1. Select `reporter1@gmail.com` or `staff1@gmail.com`.
2. Enter the test account password and select **Sign in**.
3. Send the default `POST /work-orders` request.
4. Confirm the response is `201 Created` and the work-order status is `OPEN`.
5. Change the method to `GET`, keep the path `/work-orders`, and send the request again. The created work order should be returned in `data`.

The frontend obtains the Supabase access token through sign-in and sends it as `Authorization: Bearer <token>`. A `400 Invalid UUID` response usually means an old request body is open; refresh the page so the valid seeded UUIDs are loaded.

## API routes

- `POST /api/work-orders`
- `GET /api/work-orders`
- `GET /api/work-orders/{id}`
- `PATCH /api/work-orders/{id}`
- `DELETE /api/work-orders/{id}`
- `POST /api/work-orders/{id}/assign`
- `POST /api/work-orders/{id}/in-progress`
- `POST /api/work-orders/{id}/resolve`
- `POST /api/work-orders/{id}/close`
- `GET /api/work-orders/{id}/history`

Protected routes require:

```http
Authorization: Bearer <supabase-access-token>
```

The token user must have `role: reporter` or `role: staff` in Supabase Auth metadata. Staff-only routes enforce the role on the server. CORS allows the configured `FRONTEND_ORIGINS` values.

The separate API test client is in `../frontend` and runs on port `3001`.

## Validation

```powershell
npm run typecheck
npm run build
```

The database migration source is in `supabase/migrations`. Assignment documentation is in `A3-Team10-Database-Design.md`.
