# Assignment To-Do List

This checklist follows the instructor's assignment requirements and uses the tools and names already defined in the project Markdown files.

**Project references:**
- `PRD_Maintenance.md`
- `architecture.md`
- `role-reviews.md`

## Team Split

Use this split so both people can work at the same time. Replace **Person A** and **Person B** with your names before submitting.

### Person A - Backend, Database, and API Owner (you are person A and you have to do the tasks only related with that)

- Own Assignment #3 sections A, B, D, and E.
- Implement or document Supabase PostgreSQL, schema constraints, migrations, and Next.js API routes.
- Enforce backend authentication, staff authorization, valid status transitions, assignment conflict prevention, and closure rules.
- Prepare working API request/response examples and the complete work-order lifecycle demonstration.

### Person B - Integration, Evidence, and Document Owner

- Own Assignment #5 sections A, B, and C.
- Confirm the partner group, webhook endpoints, HMAC-SHA256 signing, retries, idempotency, and degradation behavior.
- Collect screenshots, logs, timestamps, request/response examples, and partner confirmation without exposing secrets.
- Assemble the final Assignment #3 and Assignment #5 documents, export the PDF, and check formatting.

### Shared Checkpoints

- Agree on entity names, status names, endpoint names, and example IDs before writing evidence.
- Review the database schema and API examples together before the integration tests begin.
- Run the final Markdown consistency check together.
- Both people review the final PDF and confirm that no secrets are included.

## Parallel Handoffs

### Start immediately in parallel

- **Person A:** Database choice, schema, constraints, migration, API route behavior, and CRUD examples.
- **Person B:** Partner/interface confirmation, webhook contract, evidence template, and test-log collection plan.

### Person A hands off to Person B

- Final table and column names, including UUID examples.
- Exact status values and allowed transitions.
- API endpoint list with sample requests and responses.
- Webhook payload shape, event name `maintenance.status_changed`, and signature-header format.
- Migration/deployment result and the test data IDs that may be used in screenshots.

### Person B hands off to Person A

- Confirmed partner endpoint and expected response format.
- Required webhook headers and HMAC verification details.
- Failure, retry, timeout, and idempotency scenarios that the API must support.
- Any partner-specific field or naming requirement that affects the schema or routes.

### Final merge order

1. Person A completes the schema and API contract.
2. Person B updates webhook evidence using that contract and reports any mismatch.
3. Person A fixes contract or implementation mismatches.
4. Person B assembles the final documents and PDF.
5. Both people perform the final consistency and secret-removal review.

## Assignment #3: Database Design

### A. Database Choice and Explanation

- [ ] Use **Supabase PostgreSQL**, matching `architecture.md` and the PRD technology choice.
- [ ] Write why Supabase PostgreSQL is suitable for this project.
- [ ] Explain the database tool and how the team will use it to create, inspect, and deploy the database.
- [ ] Explain how the database supports the Next.js application and its API routes.

### B. Database Schema

- [ ] Create the database schema for `Location`.
- [ ] Create the database schema for `Category`.
- [ ] Create the database schema for `WorkOrder`.
- [ ] Create the database schema for `Assignment`.
- [ ] Create the database schema for `StatusHistory`.
- [ ] Include the fields, data types, primary keys, foreign keys, and relationships defined in `PRD_Maintenance.md`.
- [ ] Include the required database constraints from the PRD, such as non-null fields, foreign keys, and valid status transitions.
- [ ] Use the PRD work-order statuses: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`.

### C. ER Diagram and Schema Documentation

- [ ] Create an ER diagram for the Supabase PostgreSQL database.
- [ ] Show the relationships between `Location`, `Category`, `WorkOrder`, `Assignment`, and `StatusHistory`.
- [ ] Add the ER diagram and a written schema description to the Assignment #3 Markdown document.

### D. Migration and Remote Database

- [ ] Create the SQL schema or migration file for Supabase PostgreSQL.
- [ ] Run the migration using the selected Supabase database tool.
- [ ] Deploy the schema to the remote Supabase database.
- [ ] Check that the remote database matches the ER diagram and written schema.
- [ ] Record the migration/deployment process in the Assignment #3 Markdown document.

### E. APIs and CRUD Demonstration

- [ ] Provide APIs through the **Next.js API routes** described in `architecture.md`.
- [ ] Document create: `POST /work-orders`.
- [ ] Document read: `GET /work-orders` and `GET /work-orders/{id}`.
- [ ] Document update: `PATCH /work-orders/{id}`.
- [ ] Document assignment: `POST /work-orders/{id}/assign`.
- [ ] Document resolution: `POST /work-orders/{id}/resolve`.
- [ ] Document closure: `POST /work-orders/{id}/close`.
- [ ] Document archive/delete: `DELETE /work-orders/{id}` (soft-delete using `archived_at`).
- [ ] Document history: `GET /work-orders/{id}/history`.
- [ ] Prepare an example request for each required CRUD operation.
- [ ] Prepare the matching example response for each request.
- [ ] Demonstrate the complete work-order flow from creation through closure.
- [ ] Add the API requests and responses to the Assignment #3 Markdown document.

### F. Assignment #3 Documents

- [ ] Create or update the Assignment #3 Markdown document with the database choice, schema, ER diagram, migration/deployment process, APIs, requests, and responses.
- [ ] Export the completed Assignment #3 document as a PDF.
- [ ] Submit both the Markdown (`.md`) file and PDF.

## Assignment #5: Interface Between Groups

### A. Integration Based on the Project Architecture

- [ ] Confirm the partner group and the interface connected to this Maintenance project.
- [ ] Use the project webhook event name: `maintenance.status_changed`.
- [ ] Document the webhook sender in the Next.js backend/API layer.
- [ ] Document the webhook receiver or partner endpoint.
- [ ] Use the architecture-described HMAC-SHA256 signature for webhook verification.

### B. Required Evidence

- [ ] **Consumer Proof:** record the provider URL, request timestamp, and response body.
- [ ] **Provider Proof:** record the endpoint URL, internal request log, and partner confirmation.
- [ ] **Webhook Receiver:** record the incoming payload, secret-verification result, and stored log.
- [ ] **Webhook Sender:** record the internal trigger action, outgoing payload, and partner response log.
- [ ] **Idempotency Proof:** compare request 1 and request 2, and show database proof that only one record was created.
- [ ] **Degradation Proof:** record the timeout or failure timestamp, fallback JSON output, and automatic recovery log.

### C. Assignment #5 Document

- [ ] Create `A5-TeamName-Integration-Evidence.md`.
- [ ] Include all six evidence sections: Consumer Proof, Provider Proof, Webhook Receiver, Webhook Sender, Idempotency Proof, and Degradation Proof.
- [ ] Add screenshots, logs, request/response examples, and timestamps as evidence.
- [ ] Remove secrets such as Supabase keys, HMAC signing secrets, JWTs, and passwords from screenshots and examples.

## Markdown Consistency Check

- [ ] Ensure the database section matches the PRD entities and fields.
- [ ] Ensure the architecture section says Next.js client/API routes, Supabase PostgreSQL, Supabase Auth, AI categorization, and webhook dispatch.
- [ ] Ensure the API descriptions match the endpoint names in `PRD_Maintenance.md`.
- [ ] Ensure the status names and status-transition rules match the PRD.
- [ ] Ensure the Assignment #3 and Assignment #5 documents use the same names as the project Markdown files.

## Missing Reference

- [ ] Add the ajarn's lecture slide file to the project or provide it in the chat.
- [ ] After the slides are available, add the exact slide-recommended tools and commands to the relevant tasks above.
