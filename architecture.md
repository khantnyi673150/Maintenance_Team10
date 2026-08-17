# Platform Architecture

## Architecture Overview
The platform uses a simple monolithic Next.js architecture. The client and backend live in the same application, with server-side API routes handling authentication checks, work-order operations, AI categorization, and webhook publishing.

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
Next.js app for issue submission, tracking, and staff dispatch board.

### Backend/API
Next.js API routes for authentication checks, work-order CRUD, assignment, closure, and audit history.

### Database
Supabase PostgreSQL stores locations, categories, work orders, assignments, and status history.

### Authentication
Supabase Auth provides JWTs, and the backend verifies them on every protected route.

### External Services
AI categorization and downstream webhook consumers.

## Failure Handling
- If AI classification fails or is too slow, the system falls back to manual category selection.
- If webhook dispatch fails, the main work-order transaction still completes.
- If an unauthorized user calls a staff-only route, the backend rejects the request.
- If two staff actions happen at the same time, the backend/database must enforce valid status transitions and prevent inconsistent updates.
