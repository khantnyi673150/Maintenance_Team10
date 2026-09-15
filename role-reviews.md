# Role Reviews

## KHANT NYI NYI AUNG (6731503059) — Product Manager

### Summary
The PRD clearly identifies the maintenance problem, users, and core journey. The main product risk is keeping the MVP focused on the repair-reporting and dispatch flow without adding unnecessary features.

### Findings
| ID | PRD section | Issue or question | Why it matters | Severity | Recommended change |
|---|---|---|---|---|---|
| PM-01 | Scope | The MVP scoedpe is broad enough to include reporting, tracking, dispatch, AI categorization, and webhook publishing. | Too many first-release items may reduce delivery quality within one semester. | Medium | Keep the core journey as submission → assignment → closure, and treat non-essential enhancements as future work. |
| PM-02 | Acceptance Criteria | The PRD lists high-level acceptance criteria but does not make each one observable enough for testing. | Weak acceptance criteria make completion subjective. | Medium | Add measurable acceptance criteria for create, assign, close, history, and webhook behavior. |
| PM-03 | Future Improvements | Future improvements are listed, but there is no explicit note that they are not part of the MVP. | Teams may accidentally treat future items as required work. | Low | Mark future improvements as out of scope for the current release. |

### Decision requests for the group
- Confirm the MVP only covers the core work-order flow.
- Make acceptance criteria more testable.
- Keep future improvements out of implementation scope.

## Hein Zaw (6731503055) — Frontend UX/UI

### Summary
The core journey is understandable, but the PRD should explicitly describe user-facing states so the UI can be implemented without guesswork.

### Findings
| ID | PRD section | Issue or question | Why it matters | Severity | Recommended change |
|---|---|---|---|---|---|
| UX-01 | Core User Journey | The PRD does not define empty, loading, error, or permission-denied states for the main screens. | Users need clear feedback during slow requests or access denial. | Medium | Add UI state requirements for reporting, tracking, and dispatch screens. |
| UX-02 | Functional Requirements | The work-order endpoints are defined, but the user flow for manual category fallback is not fully described. | Users may not know what to do when AI classification fails. | Medium | Add a clear fallback step for manual category selection in the reporting flow. |
| UX-03 | Scope | There is no explicit responsive or accessibility requirement. | A student project should still be usable on common laptop and mobile sizes. | Low | Add a lightweight accessibility and responsive-design requirement. |

### Decision requests for the group
- Add UI states for loading, error, empty, and permission-denied.
- Document the manual fallback interaction.
- Confirm the app should be usable on common screen sizes.

## Ye Myat Min (6731503094) — Backend API and Database

### Summary
The data model is appropriate for the MVP, but it needs clearer integrity rules for duplicate operations, assignment conflicts, and status transitions.

### Findings
| ID | PRD section | Issue or question | Why it matters | Severity | Recommended change |
|---|---|---|---|---|---|
| BE-01 | Data Model | The PRD defines WorkOrder, Assignment, and StatusHistory, but not the exact constraint or transaction strategy that prevents duplicate or conflicting updates. | Simultaneous requests can create inconsistent work-order states. | High | Add backend transaction rules and database constraints for assignment, closure, and history writes. |
| BE-02 | Business Rules | BR-01 requires closure only with an assigned technician and resolution notes, but the enforcement point is not stated. | If enforced only in the UI, the rule can be bypassed. | High | State that this rule is enforced by the backend and database, not just the frontend. |
| BE-03 | API / Interface Notes | The API list is clear, but response shapes and error codes are not specified. | Implementation and testing become harder without predictable API behavior. | Medium | Define basic success and error responses for create, assign, close, and history endpoints. |

### Decision requests for the group
- Add backend-enforced integrity rules.
- Specify where validation happens.
- Define minimal API response and error expectations.

## Zwe Nyi Win (6731503096) — Quality and Security

### Summary
Security is directionally correct, but the PRD should more clearly separate authentication, authorization, and outbound event safety.

### Findings
| ID | PRD section | Issue or question | Why it matters | Severity | Recommended change |
|---|---|---|---|---|---|
| QS-01 | Security and Privacy | The PRD states JWT verification and role checks, but not that every protected backend route must enforce them. | Missing server-side checks can expose staff-only actions. | High | Require backend authorization checks on every protected API route. |
| QS-02 | Platform Architecture | Signed webhooks are mentioned, but failure handling and retry behavior are not fully specified. | Event loss or repeated delivery can cause downstream inconsistencies. | Medium | Document asynchronous retry or queue-based delivery for webhook failures. |
| QS-03 | Error Handling and Failure Scenarios | Failure cases are listed, but duplicate submission and simultaneous assignment handling are not tied to tests. | A secure design must be testable under real failure conditions. | Medium | Add testable scenarios for duplicate requests, invalid access, and race conditions. |

### Decision requests for the group
- Enforce authorization on every protected API route.
- Define webhook retry/failure handling.
- Add security-focused test scenarios.

## Danielle Jusayan (6731503051) — Delivery and Document

### Summary
The stack is feasible for a 3–5 student team, one semester, and zero budget, but the document should state deployment and operational assumptions more explicitly.

### Findings
| ID | PRD section | Issue or question | Why it matters | Severity | Recommended change |
|---|---|---|---|---|---|
| DD-01 | Technology Stack | The PRD recommends Vercel and Supabase, but does not note any free-tier or billing assumptions. | The project must stay within 0 THB and avoid surprise billing. | High | Add a note that only free-tier services are allowed and paid upgrades are not part of the plan. |
| DD-02 | Deployment Plan | Deployment steps are high level only. | The team needs a practical path to ship and verify the app. | Medium | Add brief development and production deployment notes, including environment variables. |
| DD-03 | Risks and Mitigations | The PRD lists risks, but not the main delivery dependency order. | Teams need to know what must be built first. | Low | Add a simple delivery order: auth and database first, then work orders, then UI, then webhook integration. |

### Decision requests for the group
- Confirm the deployment stays on free-tier services only.
- Add a simple deployment plan.
- Document the build order for the semester.

## Decision Log

| Finding ID | Decision | PRD change made | Owner | Reason |
|---|---|---|---|---|
| PM-01 | Accept | Keep only the core work-order flow in MVP scope | KHANT NYI NYI AUNG (6731503059) | Avoid scope creep |
| PM-02 | Accept | Expand acceptance criteria to be measurable | KHANT NYI NYI AUNG (6731503059) | Improve testability |
| UX-01 | Accept | Add loading, error, empty, and permission-denied states | Hein Zaw (6731503055) | Improve usability |
| UX-02 | Accept | Document manual category fallback interaction | Hein Zaw (6731503055) | Prevent user confusion |
| BE-01 | Accept | Add backend/database constraint note for duplicates and race conditions | Ye Myat Min (6731503094) | Prevent inconsistent work orders |
| BE-02 | Accept | State that closure rules are enforced server-side | Ye Myat Min (6731503094) | Prevent bypass through UI |
| QS-01 | Accept | Require backend auth checks on every protected route | Zwe Nyi Win (6731503096) | Prevent unauthorized access |
| QS-02 | Accept | Add retry/failure handling for webhooks | Zwe Nyi Win (6731503096) | Keep downstream systems consistent |
| DD-01 | Accept | Note free-tier-only deployment assumptions | Danielle Jusayan (6731503051) | Protect zero-budget constraint |
| DD-02 | Accept | Add brief deployment plan and env-var notes | Danielle Jusayan (6731503051) | Improve release readiness |
