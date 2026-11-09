# Campus Maintenance Management System – Dashboard Framework

## 1. Overview

The system will have two main user types:

1. **Reporter:** Can access the public dashboard without logging in to submit maintenance reports and track their progress.
2. **Staff:** Must log in and select their working category directly on the login page.

The system will have four maintenance categories:

- Plumbing
- Electrical
- HVAC
- Safety

In addition, there will be an **Admin role** responsible for reviewing unclear or insufficient ticket submissions and manually assigning them to the appropriate category.

If a submitted ticket does not contain enough information for reliable classification, it will be sent to the Admin for manual review.

## 2. Reporter Flow (No Login Required)

**Public Dashboard → Submit Report → Category Classification → Track Ticket Progress**

Reporters can:

- Access the public dashboard without creating an account.
- Submit maintenance problems with descriptions and locations.
- Receive a reference number after submitting a ticket.
- View their submitted ticket history.
- Track the progress of each ticket based on its current status.

### Ticket History and Status Tracking

Reporters should be able to see the progress of their submitted tickets, including:

- **Submitted:** The ticket has been successfully received.
- **In Progress:** Staff members are working on the reported problem.
- **Resolved:** The reported problem has been fixed.
- **Closed:** The maintenance request has been completed and closed.

Reporters should also be able to view the details and latest status of each submitted ticket.

### Ticket Classification

After a reporter submits a ticket:

- If the problem description is clear enough, the system classifies it into one of the four maintenance categories.
- If the information is unclear or insufficient, the ticket is forwarded to the Admin for manual review.
- The Admin reviews the ticket and assigns the appropriate category.
- Once classified, the ticket becomes available to the corresponding maintenance staff.

## 3. Staff Flow (Login Required)

**Staff Login Page → Select Category → Enter Credentials → Login → Category Dashboard**

Staff members must select their working category directly on the login page before entering their credentials.

### Available Staff Categories

- **Plumbing:** Handles water supply, pipes, drainage, and related problems.
- **Electrical:** Handles electrical systems, lighting, power, and related problems.
- **HVAC:** Handles air conditioning, ventilation, and related problems.
- **Safety:** Handles safety-related issues and potential hazards.

After successful authentication, staff members are redirected to the dashboard corresponding to their selected category.

The system must verify that the staff account is authorized to access the selected category.

## 4. Dashboard Overview

### 4.1 Public Reporter Dashboard

- Submit maintenance reports.
- View submitted ticket history.
- View individual ticket details.
- Track ticket progress and status.
- Receive submission confirmation and a reference number.

### 4.2 Plumbing Dashboard

- View Plumbing-related reports.
- View assigned work orders.
- Update maintenance progress.
- Update work-order status.

### 4.3 Electrical Dashboard

- View Electrical-related reports.
- View assigned work orders.
- Update maintenance progress.
- Update work-order status.

### 4.4 HVAC Dashboard

- View HVAC-related reports.
- View assigned work orders.
- Update maintenance progress.
- Update work-order status.

### 4.5 Safety Dashboard

- View Safety-related reports.
- View assigned work orders.
- Update maintenance progress.
- Update work-order status.

### 4.6 Admin Dashboard

- View and manage all submitted reports.
- Review tickets with unclear or insufficient information.
- Manually classify tickets into Plumbing, Electrical, HVAC, or Safety.
- Monitor staff activities and work assignments.
- Monitor overall maintenance progress.

## 5. Ticket Classification Process

The classification process will follow this flow:

1. Reporter submits a maintenance ticket.
2. The system checks whether the ticket information is clear enough for classification.
3. If the information is clear, the ticket is assigned to the appropriate category.
4. If the information is unclear or insufficient, the ticket is sent to the Admin for manual review.
5. The Admin reviews the ticket and selects the correct category.
6. The ticket becomes available to the corresponding maintenance staff.

## 6. Existing Maintenance Workflow

The existing maintenance workflow will be maintained:

`OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED`

The new dashboards and ticket classification process will connect to the existing maintenance and work-order system rather than replacing it.

The reporter's ticket history will display understandable status labels corresponding to the existing workflow.

## 7. Scope of Changes

### What We Want to Add

- Public reporter dashboard without login.
- Ticket history and status tracking for reporters.
- Staff login page with four maintenance category selections.
- Role-based redirection after successful login.
- Separate dashboards for Plumbing, Electrical, HVAC, and Safety.
- Admin dashboard for manual ticket review and classification.
- Ticket classification process for clear and unclear submissions.

### What We Want to Keep

- Existing maintenance process.
- Existing work-order workflow.
- Existing database and backend structure where possible.
- Existing report status lifecycle.

## 8. Main Objective

The goal is to improve the Campus Maintenance Management System by separating public reporters from maintenance staff, organizing maintenance work into four categories, and allowing the Admin to manually review and classify unclear tickets.

Reporters will be able to submit reports and follow their progress, while staff members will manage maintenance requests through their respective category dashboards.

The new features should improve ticket organization, tracking, and management while keeping the existing maintenance workflow intact.
