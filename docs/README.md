# Dashboard documentation

Documentation is grouped by implementation status. “Implemented” describes code
present in the repository; it does not imply production deployment or verification
on every device. Maintenance guides describe current behavior. Original plans and
phase records preserve design decisions, including features later revised or removed.

## Implemented functionality

| Area                         | Current guidance                                                                                             | Design and implementation history                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Finance                      | [Maintenance, storage, exports and recovery](implemented/FINANCE_MAINTENANCE.md)                             | [Original eight-phase scope](implemented/PERSONAL_FINANCE_SCOPE.md)                                                                |
| Work and projects            | [Handover](implemented/work-management/HANDOVER.md), [operations](implemented/work-management/OPERATIONS.md) | [Context, phase plans and progress](implemented/work-management/README.md)                                                         |
| Calendar and recurring dates | [Recurring work, holidays and birthdays](implemented/RECURRING_WORK.md)                                      | [Display and navigation](implemented/DISPLAY_AND_NAVIGATION.md)                                                                    |
| Knowledge base               | [Maintenance](implemented/KNOWLEDGE_MAINTENANCE.md)                                                          | [Architecture and original plan](implemented/KNOWLEDGE_BASE_PLAN.md)                                                               |
| Notification inbox           | [Maintenance](implemented/NOTIFICATION_INBOX_MAINTENANCE.md)                                                 | [Plan](implemented/NOTIFICATION_INBOX_PLAN.md)                                                                                     |
| Activity logs                | [Coverage, privacy, retention and recovery](implemented/AUDIT_LOG_MAINTENANCE.md)                            | [Approved design](implemented/AUDIT_LOG_PLAN.md)                                                                                   |
| Global dashboard search      | [Maintenance and verification](implemented/GLOBAL_SEARCH_MAINTENANCE.md)                                     | [Design plan](implemented/GLOBAL_SEARCH_PLAN.md); seven record groups, keyboard and mobile controls                                |
| Dashboard Quick add          | [Plan and implementation notes](implemented/GLOBAL_QUICK_ADD_PLAN.md)                                        | Desktop dashboard button; phone quick-actions menu throughout the app                                                              |
| Weekly report                | [Maintenance and example data](implemented/WEEKLY_REPORT_MAINTENANCE.md)                                     | [Plan](implemented/WEEKLY_REPORT_PLAN.md)                                                                                          |
| Outgoing email               | [Resend setup, shared outbox and PDF delivery](implemented/EMAIL_MAINTENANCE.md)                             | Reusable template-based email infrastructure; weekly PDF is the first template                                                     |
| Invited users                | [Accounts, invitations and operations](implemented/MULTI_USER_MAINTENANCE.md)                                | [Architecture and implementation decisions](implemented/MULTI_USER_ACCESS_PLAN.md); Google/GitHub and isolated Japanese workspaces |
| Japanese practice            | [Activity review timer recovery](implemented/ACTIVITY_REVIEW_TIMER_RECOVERY.md)                              | See the [project README](../README.md) for other practice functionality                                                            |
| Deployment                   | [Synology and GitHub Actions](implemented/deployment.md)                                                     | Recovery procedures are also covered in module maintenance guides                                                                  |

The work-management phase files remain together, in their original order, under
`implemented/work-management/phases/`. Read their context and current handover
before using historical instructions.

## Not yet implemented

| Proposal                                                                  | Scope                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Dashboard improvement ideas](planned/DASHBOARD_IMPROVEMENT_IDEAS.md)     | Recoverable drafts remain a proposal; ideas 1 and 3–5 have implementation references                          |
| [Stock market overview](planned/STOCK_MARKET_PLAN.md)                     | Major indexes, notable stock movers and one or two market news items; free and paid data options              |
| [Integrated AI assistant](planned/AI_ASSISTANT_PLAN.md)                   | Chat/voice capture, validated task/calendar/Knowledge actions, hosting options and worked usage-cost examples |
| [Outlook calendar synchronization](planned/OUTLOOK_CALENDAR_SYNC_PLAN.md) | Automatic one-way imports, read-only event details, task links, sync reliability and expected costs           |
| [Daily journal](planned/DAILY_JOURNAL_PLAN.md)                            | Voice-first daily memories, speech-to-text transcription, editable entries and positive-moment prompts        |

These are planning documents, not features enabled by reorganizing this folder.
