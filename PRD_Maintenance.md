# Product Requirements Document
## 1. Product Overview

### Product Name
Maintenance (Team 10)

### Problem Statement
Campus facility issues such as broken equipment, electrical faults, and plumbing leaks are submitted through fragmented channels without real-time tracking. Facility and maintenance personnel lack a centralized dispatch board, which leads to untracked repair requests, unassigned issues, and no reliable audit history.

### Target Users
- **Campus Reporters**: Students and staff who report facility repair issues.
- **Maintenance Staff & Dispatchers**: Operations personnel who triage, assign, update, and resolve work orders.

### Product Goal
Turn a campus repair report into an assigned, trackable work order for staff and reporters.

---

## 2. Scope

### In Scope
- **3 Core UI Journeys**: Issue reporting, work-order tracking, and staff dispatch board.
- **REST API Layer**: Full CRUD and lifecycle endpoints for work orders.
- **Platform Integrations**: Inbound role consumption via Identity Service JWTs and outbound `maintenance.status_changed` webhook event publishing.
- **AI-Native Flow**: Free-text categorization of issue descriptions with a deterministic fallback asking reporters to select a category.
- **Automated Quality Gates**: Minimum 7 automated tests covering create, read, status change, assignment, close, history audit, and webhook signatures.

### Out of Scope
- Multi-campus hardware procurement and inventory supply tracking.
- Real-time VoIP or video communication between reporters and technicians.
- Hardware-level automated IoT telemetry ingestion.

---

## 3. User Roles and Permissions

### User (Reporter)
- Authenticated campus member (student/faculty).
- Submits issue reports.
- Views status progression and personal submission history.

### Admin (Maintenance Staff / Dispatcher)
- Authenticated operations personnel.
- Views the full dispatch board.
- Assigns technicians, updates repair statuses, and closes work orders with resolution logs.

---

## 4. Core User Journey

### Main Journey
1. **Issue Submission**: Reporter logs in, inputs location and problem description, receives AI-suggested category or selects one manually, and submits the ticket.
2. **Dispatch & Assignment**: Maintenance staff views unassigned tickets on the dispatch board and assigns a technician via `POST /work-orders/{id}/assign`.
3. **Repair Tracking**: Reporter and staff track the ticket as its status moves from `OPEN` to `ASSIGNED` to `IN_PROGRESS`.
4. **Resolution & Closure**: Staff completes the repair, enters resolution notes, and calls `POST /work-orders/{id}/close` to finalize the work order and trigger downstream notifications.

---

## 5. Functional Requirements

### FR-01 - Create Work Order
The system shall provide a `POST /work-orders` endpoint to create a work order containing `location_id`, `description`, `category_id`, and `reporter_id`.

### FR-02 - Work Order Inquiries
The system shall provide `GET /work-orders` with filters for status and location, and `GET /work-orders/{id}` for detailed entity status.

### FR-03 - Work Order Mutation & Assignment
The system shall provide `PATCH /work-orders/{id}` for metadata updates and `POST /work-orders/{id}/assign` for assigning a technician ID to an active order.

### FR-04 - Work Order Closure & History
The system shall provide `POST /work-orders/{id}/close` requiring completion notes and `GET /work-orders/{id}/history` to retrieve an immutable audit trail of state transitions.

### FR-05 - AI Issue Classification & Fallback
The system shall classify free-text problem descriptions into categories using an AI model and automatically fall back to manual category selection if classification fails or has low confidence.

### FR-06 - Inter-Team Event Publishing
The system shall dispatch a signed `maintenance.status_changed` webhook payload to Helpdesk, Notification Hub, Security & Compliance, and Analytics upon any work-order status update.

---

## 6. Non-Functional Requirements

### NFR-01 Performance
All core REST API endpoints must respond with p95 under 300 ms. AI categorization must fall back to manual selection if response time exceeds 1500 ms.

### NFR-02 Security
Backend routes must independently verify JWT claims and roles (`reporter` vs. `staff`) from the Identity Service. Client-side route guards are never trusted for authorization.

### NFR-03 Availability
The platform must maintain high uptime through serverless edge deployment, isolating outbound webhook dispatch failures from blocking main database transactions.

### NFR-04 Cost
The platform architecture must operate with 0 THB hosting cost using eligible free-tier cloud quotas.

---

## 7. Business Rules

### BR-01
A work order cannot transition to `CLOSED` without an assigned technician and non-empty resolution notes.

### BR-02
Only users with authenticated `staff` role permissions are authorized to execute assignment and closure endpoints.

### BR-03
Downstream Helpdesk integrations may create a linked support ticket reference but must never duplicate the work order entity.

---

## 8. Data Model

### Location
- `id` (UUID, Primary Key)
- `building` (VARCHAR)
- `floor_room` (VARCHAR)
- `created_at` (TIMESTAMP)

### Category
- `id` (UUID, Primary Key)
- `name` (VARCHAR)
- `sla_hours` (INTEGER)
- `created_at` (TIMESTAMP)

### WorkOrder
- `id` (UUID, Primary Key)
- `reporter_id` (UUID, Foreign Key)
- `location_id` (UUID, Foreign Key)
- `category_id` (UUID, Foreign Key)
- `title` (VARCHAR)
- `description` (TEXT)
- `status` (ENUM: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Assignment
- `id` (UUID, Primary Key)
- `work_order_id` (UUID, Foreign Key)
- `staff_id` (UUID, Foreign Key)
- `assigned_at` (TIMESTAMP)

### StatusHistory
- `id` (UUID, Primary Key)
- `work_order_id` (UUID, Foreign Key)
- `changed_by` (UUID, Foreign Key)
- `from_status` (ENUM)
- `to_status` (ENUM)
- `note` (TEXT)
- `timestamp` (TIMESTAMP)

### Data That Should Not Be Stored
- Raw passwords.
- Unnecessary sensitive personal data.
- Duplicate free-text notes that repeat structured fields.

### Sensitive Data
- Auth tokens.
- Reporter identity.
- Staff identity.
- Resolution notes if they contain personal details.

### Potential Duplicate or Inconsistent Data
- Duplicate work orders for the same incident.
- Conflicting assignment records.
- Status history that does not match the current status.

### Important Database Constraints
- Foreign keys on all relationships.
- Non-null constraints for required fields.
- Status transition validation.
- Uniqueness or deduplication rules for repeated assignments if needed.

---

## 9. Platform Architecture

### Architecture Overview
The platform follows a simple monolithic Next.js architecture. A Next.js client interacts with Next.js backend API routes that validate incoming requests, communicate with Supabase PostgreSQL, trigger AI categorization, and publish signed webhook events.

### Architecture Diagram

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

### Components

#### Frontend
Next.js app for issue submission, tracking, and dispatch board.

#### Backend
Next.js API routes that implement authentication checks, work-order CRUD, assignment, closure, and webhook publication.

#### Database
Supabase PostgreSQL for relational storage of work orders, locations, categories, assignments, and history.

#### Authentication
Supabase Auth with server-side JWT verification and role-based access control.

#### Storage
Supabase Storage only if file attachments are added later.

#### External Services
AI classification service and downstream webhook consumers.

---

## 10. Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js | Simple full-stack workflow and shared UI/API codebase |
| Backend | Next.js Server/API Routes | Keeps the system monolithic and easy to deploy |
| Database | Supabase PostgreSQL | Free-tier relational DB with a strong fit for work orders |
| Auth | Supabase Auth | JWT-based auth with role checks |
| Hosting | Vercel | Free-tier deployment and easy setup |

---

## 11. API / Interface Notes

### API-01
`POST /work-orders` creates a new work order.

### API-02
`GET /work-orders` and `GET /work-orders/{id}` retrieve work-order lists and details.

### API-03
`PATCH /work-orders/{id}` updates metadata.

### API-04
`POST /work-orders/{id}/assign` assigns a staff member.

### API-05
`POST /work-orders/{id}/close` closes a work order.

### API-06
`GET /work-orders/{id}/history` returns audit history.

---

## 12. Security and Privacy

### Authentication
Server-side JWT verification using Supabase Auth.

### Authorization
Role-based access control with separate rules for reporter and staff actions.

### Data Protection
- Do not trust client-side route guards.
- Sign outgoing webhook payloads.
- Protect environment variables and secrets.

---

## 13. Error Handling and Failure Scenarios

### Expected Errors
- Invalid input.
- Unauthorized access.
- Not found.
- AI classification timeout.
- Webhook delivery failure.

### Failure Scenarios
- Duplicate submissions.
- Simultaneous assignment requests.
- Invalid status transitions.
- Database transaction failure.
- Third-party service outage.

---

## 14. Deployment Plan

### Development
Local Next.js development with Supabase credentials from environment variables.

### Production
Deploy the Next.js app to Vercel and use Supabase for database and authentication.

---

## 15. Constraints

- **Budget**: 0 THB.
- **Time**: One semester.
- **Team**: 3–5 student developers.
- **Free Tier**: Required.

---

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| AI classification errors | Medium | Manual fallback and category review |
| Unauthorized access | High | Server-side JWT verification and role checks |
| Duplicate requests | Medium | Deduplication and transaction controls |
| Webhook failure | Medium | Retry asynchronously outside main request path |
| Scope creep | High | Keep MVP limited to core workflows |

---

## 17. Acceptance Criteria

### MVP is complete when:
- Reporters can submit work orders.
- Staff can assign and close work orders.
- Work-order status history is recorded.
- AI fallback works when classification fails.
- Signed webhook events are emitted on status changes.

---

## 18. Future Improvements

- File attachments for issues.
- Better dashboards and analytics.
- More advanced categorization models.
- Notifications to reporters.
- Optional support ticket linkage.
