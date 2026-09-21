# Assignment To-Do List

This checklist follows the instructor's assignment requirements and uses the tools and names already defined in the project Markdown files.

**Project references:**
- `PRD_Maintenance.md`
- `architecture.md`
- `role-reviews.md`

## Assignment #3: Database Design

### A. Database Choice and Explanation

- [x] Use **Supabase PostgreSQL**, matching `architecture.md` and the PRD technology choice.
- [x] Write why Supabase PostgreSQL is suitable for this project.
- [x] Explain the database tool and how the team will use it to create, inspect, and deploy the database.
- [x] Explain how the database supports the Next.js application and its API routes.

### B. Database Schema

- [x] Create the database schema for `Location`.
- [x] Create the database schema for `Category`.
- [x] Create the database schema for `WorkOrder`.
- [x] Create the database schema for `Assignment`.
- [x] Create the database schema for `StatusHistory`.
- [x] Include the fields, data types, primary keys, foreign keys, and relationships defined in `PRD_Maintenance.md`.
- [x] Include the required database constraints from the PRD, such as non-null fields, foreign keys, and valid status transitions.
- [x] Use the PRD work-order statuses: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`.

### C. ER Diagram and Schema Documentation

- [x] Create an ER diagram for the Supabase PostgreSQL database.
- [x] Show the relationships between `Location`, `Category`, `WorkOrder`, `Assignment`, and `StatusHistory`.
- [x] Add the ER diagram and a written schema description to the Assignment #3 Markdown document.

### D. Migration and Remote Database

- [x] Create the SQL schema or migration file for Supabase PostgreSQL.
- [x] Run the migration using the selected Supabase database tool.
- [x] Deploy the schema to the remote Supabase database.
- [x] Check that the remote database matches the ER diagram and written schema.
- [x] Record the migration/deployment process in the Assignment #3 Markdown document.

### E. APIs and CRUD Demonstration

- [x] Provide APIs through the **Next.js API routes** described in `architecture.md`.
- [x] Document create: `POST /work-orders`.
- [x] Document read: `GET /work-orders` and `GET /work-orders/{id}`.
- [x] Document update: `PATCH /work-orders/{id}`.
- [x] Document assignment: `POST /work-orders/{id}/assign`.
- [x] Document resolution: `POST /work-orders/{id}/resolve`.
- [x] Document closure: `POST /work-orders/{id}/close`.
- [x] Document archive/delete: `DELETE /work-orders/{id}` (soft-delete using `archived_at`).
- [x] Document history: `GET /work-orders/{id}/history`.
- [x] Prepare an example request for each required CRUD operation.
- [x] Prepare the matching example response for each request.
- [ ] Demonstrate the complete work-order flow from creation through closure.
- [x] Add the API requests and responses to the Assignment #3 Markdown document.

### F. Assignment #3 Documents

- [x] Create or update the Assignment #3 Markdown document with the database choice, schema, ER diagram, migration/deployment process, APIs, requests, and responses.
- [ ] Export the completed Assignment #3 document as a PDF.
- [ ] Submit both the Markdown (`.md`) file and PDF.

## Assignment #5: Interface Between Groups

### A. Integration Based on the Project Architecture

- [x] Confirm the partner group and the interface connected to this Maintenance project.
- [x] Use the project webhook event name: `maintenance.status_changed`.
- [x] Document the webhook sender in the Next.js backend/API layer.
- [x] Document the webhook receiver or partner endpoint.
- [x] Use the architecture-described HMAC-SHA256 signature for webhook verification.

### B. Required Evidence

- [ ] **Consumer Proof:** record the provider URL, request timestamp, and response body.
- [ ] **Provider Proof:** record the endpoint URL, internal request log, and partner confirmation.
- [ ] **Webhook Receiver:** record the incoming payload, secret-verification result, and stored log.
- [ ] **Webhook Sender:** record the internal trigger action, outgoing payload, and partner response log.
- [x] **Idempotency Proof:** compare request 1 and request 2, and show database proof that only one record was created.
- [ ] **Degradation Proof:** record the timeout or failure timestamp, fallback JSON output, and automatic recovery log.

### C. Assignment #5 Document

- [x] Create `A5-Team10-Integration-Evidence.md`.
- [x] Include all six evidence sections: Consumer Proof, Provider Proof, Webhook Receiver, Webhook Sender, Idempotency Proof, and Degradation Proof.
- [ ] Add screenshots, logs, request/response examples, and timestamps as evidence.
- [x] Remove secrets such as Supabase keys, HMAC signing secrets, JWTs, and passwords from screenshots and examples.

## Markdown Consistency Check

- [ ] Ensure the database section matches the PRD entities and fields.
- [ ] Ensure the architecture section says Next.js client/API routes, Supabase PostgreSQL, Supabase Auth, AI categorization, and webhook dispatch.
- [ ] Ensure the API descriptions match the endpoint names in `PRD_Maintenance.md`.
- [ ] Ensure the status names and status-transition rules match the PRD.
- [ ] Ensure the Assignment #3 and Assignment #5 documents use the same names as the project Markdown files.

## Missing Reference

- [ ] Add the ajarn's lecture slide file to the project or provide it in the chat.
- [ ] After the slides are available, add the exact slide-recommended tools and commands to the relevant tasks above.
