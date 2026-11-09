# Campus Maintenance Dashboard — Current Workflow

This document describes the dashboard as it is currently implemented in the Team 10 project. It replaces the earlier proposed workflow, which described separate category dashboards and features that are not part of the current application.

## 1. Application entry points

- The root page (`/`) opens the public reporter dashboard when there is no signed-in session. No account is needed to submit a public report or browse the public tracker.
- Users can open `/login` to access an authenticated workspace. After signing in, the dashboard uses the account's administrator-controlled Supabase `app_metadata.role`; users cannot choose or change their role themselves.
- Local reporter and staff previews are available from the login screen on supported loopback hosts. They use sample data, do not create a real session, and disable changes.

See the [backend setup guide](./backend/README.md) for environment configuration and startup instructions.

## 2. Public reporting and tracking

The public form accepts an issue title, description, location, a category, and an optional student ID:

1. The reporter selects Plumbing, Electrical, HVAC, or Safety, or selects **Not sure**.
2. The report is sent to `POST /api/public/work-orders`.
3. If a category is selected, the report is created in that category. **Not sure** is sent without a category and puts the report in the manual-review queue.
4. The reporter receives a reference number and can use **Track request** to find the report in the public tracker.

The public tracker is shared, not a private account-specific history. It provides search, status filtering, request details, and a refresh action. Public responses omit private fields such as reporter identity, assignments, staff notes, and audit history.

### Public status labels

The database has five internal lifecycle statuses, while the public tracker groups them into three labels:

| Internal status | Public label |
|---|---|
| `OPEN` | Submitted |
| `ASSIGNED` or `IN_PROGRESS` | In progress |
| `RESOLVED` or `CLOSED` | Finished |

Consequently, the public tracker does not distinguish an assigned request from one being worked on, or a resolved request from a closed one.

## 3. Optional Student Identity claims check

The public form optionally accepts a student ID. When provided, the backend calls the Student Identity claims endpoint using the server-side `STUDENT_IDENTITY_API_KEY`. The report is still saved if the ID is omitted or the service cannot confirm claims.

The result is marked **Student ID claims verified** only when both student verification and profile completeness are confirmed. Otherwise, the report shows **Student ID claims not verified**; older records without a stored result can show **Student ID not checked**.

Only the result status is saved. The entered student ID and claims response are not stored in the work order. This check verifies claims for the entered ID; because the public form is anonymous, it does not prove that the reporter owns that ID and must not be used as authentication.

Staff and administrators also have an **Identity test** view for manually inspecting claims when configured. It is separate from the public submission flow.

See [Student Identity Integration](./STUDENT_IDENTITY_INTEGRATION.md) for API configuration, consent, migration, and testing details.

## 4. Authenticated workspaces

All protected API requests are checked by the backend using the signed-in Supabase user and trusted account metadata. The login page asks the user to select a workspace; for maintenance staff, the backend verifies the selected category is authorized. This selection does not grant a role or permissions.

### Reporter

An authenticated reporter can view **Overview**, **My requests**, and **Report an issue**. The authenticated request list is protected and scoped by the database policies. The reporter form uses the authenticated work-order API and requires a category and campus location.

### Maintenance staff

Staff workspaces are selected by category: Plumbing, Electrical, HVAC, or Safety. Staff can view the overview, requests, dispatch board, and Identity test. The API scopes staff work orders to the authorized category and excludes requests that have not yet been classified.

The dispatch board supports the work-order lifecycle actions:

1. `OPEN` → assign the request to the current staff member (`ASSIGNED`)
2. `ASSIGNED` → start work (`IN_PROGRESS`)
3. `IN_PROGRESS` → resolve the request (resolution notes required, `RESOLVED`)
4. `RESOLVED` → close the request (`CLOSED`)

Updates are sent to the backend and reflected after the server confirms the change. The interface also shows request history, category repair targets, and overdue indicators.

### Administrator and manual review

Administrators can view the maintenance overview, requests, the manual-review queue, and Identity test. Staff can select the **Manual Review** workspace at login; access to its review API is still protected by the backend's staff/admin role check. The review queue contains active reports whose category needs review.

An administrator or authorized review user selects one of the four maintenance categories and assigns it. Once classified, the report can appear in the matching staff category's work-order list. Manual classification does not itself advance the request's lifecycle status.

## 5. Overview and request tools

The authenticated overview includes:

- Open request count
- In-progress request count
- Overdue/needs-attention count based on the category service target
- Requests resolved this week
- Recent status updates and requests requiring attention

The request list supports searching by title or request ID, filtering by status and location, sorting by newest, oldest, or repair target, refreshing, and loading more results. Staff can perform lifecycle actions from the dispatch board. The dashboard's request details and history are available to authorized signed-in users.

## 6. Categories and suggestions

The supported maintenance categories are Plumbing, Electrical, HVAC, and Safety. Category suggestions in the authenticated report flow are hints: users confirm their selection, and a suggested building does not silently replace the chosen location. On the public form, the reporter explicitly chooses a category or **Not sure**.

An unclassified report is held for manual review rather than being shown as a classified request to maintenance staff. Classification and lifecycle status are separate: assigning a category does not mean work has been assigned or started.

## 7. Local development

Run the backend and frontend in separate PowerShell terminals from the project directory:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

The backend runs at `http://localhost:3000`; the frontend runs at `http://localhost:3001`. Configure each app's local environment file as described in its README. Keep backend secrets, including `STUDENT_IDENTITY_API_KEY` and the Supabase service-role key, out of the frontend environment and source control.
