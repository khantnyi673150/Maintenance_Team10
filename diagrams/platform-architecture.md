# Platform Architecture Diagram

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
