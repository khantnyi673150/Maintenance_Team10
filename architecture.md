# Platform Architecture

## Architecture Overview
The platform uses a small monorepo with two independently runnable Next.js applications. `frontend/` contains the client journeys and API test console. `backend/` contains the Next.js App Router API, server-side authentication and authorization, work-order operations, and Supabase migrations. This preserves the simple monolithic domain design while keeping the browser client and API boundary explicit.

## Architecture Diagram

```text
┌─────────────────┐       HTTPS       ┌───────────────────────────────┐
│ Next.js Client  ├──────────────────▶│      Next.js API Gateway      │
│ (3 UI Journeys) │                   │   (REST Routes)               │
└─────────────────┘                   └───────┬──────────────┬────────┘
                                              │              │
                                              ▼              ▼
                                       ┌──────────────┐ ┌─────────────┐
                                       │ PostgreSQL   │ │ AI Classify │
                                       │ (Supabase)   │ │ (Structured)│
                                       └──────┬───────┘ └─────────────┘
                                              │
                                   (HMAC-SHA256 Signature)
                                              ▼
                                 ┌─────────────────────────┐
                                 │ Webhook Dispatcher      │
                                 │ maintenance.status_     │
                                 │ changed                 │
                                 └────────────┬────────────┘
                                              │
                             ┌────────────────┼────────────────┐
                             ▼                ▼                ▼
                      ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
                      │  Helpdesk   │  │Notification │  │  Analytics  │
                      │             │  │  Hub       │  │             │
                      └─────────────┘  └─────────────┘  └─────────────┘
```

## Components

### Frontend
The `frontend/` Next.js app supports issue submission, tracking, staff dispatch, and API testing. It sends the Supabase access token as a bearer token to the backend and uses `NEXT_PUBLIC_API_BASE_URL` for the API origin.

### Backend/API
The `backend/` Next.js app exposes `/api/work-orders` routes for authentication checks, work-order CRUD, assignment, in-progress transition, resolution, closure, archiving, and audit history. CORS allows only configured frontend origins through `FRONTEND_ORIGINS`.

### Database
Supabase PostgreSQL stores locations, categories, work orders, assignments, and status history.

### Authentication
Supabase Auth provides JWTs, and the backend verifies them on every protected route.

### External Services
AI categorization and downstream webhook consumers.

## Repository Structure

```text
Maintenance_Team10/
├── backend/
│   ├── app/api/work-orders/       # Next.js API route handlers
│   ├── lib/                       # auth, validation, Supabase helpers
│   └── supabase/migrations/       # database schema and lifecycle functions
├── frontend/
│   └── app/                       # client and API test console
├── A3-Team10-Database-Design.md
└── PRD_Maintenance.md
```

The backend runs on port `3000`; the frontend test client runs on port `3001` during local development. The frontend never performs authorization itself; the backend repeats JWT and role checks for every protected route.

## Failure Handling
- If AI classification fails or is too slow, the system falls back to manual category selection.
- If webhook dispatch fails, the main work-order transaction still completes.
- If an unauthorized user calls a staff-only route, the backend rejects the request.
- If two staff actions happen at the same time, the backend/database must enforce valid status transitions and prevent inconsistent updates.
