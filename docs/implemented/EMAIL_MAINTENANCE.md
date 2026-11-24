# Outgoing email and weekly PDF reports

The dashboard uses Resend through a shared server-side sender and persistent
outbox. Weekly reports are its first template. There is no extra container,
SMTP server, browser renderer or public arbitrary-message relay.

## Production configuration

Add these to the NAS `.env`, shared by `dashboard` and `notification-worker`:

```dotenv
EMAIL_ENABLED=true
RESEND_API_KEY=re_replace_with_your_resend_api_key
EMAIL_FROM="Dashboard <reports@your-domain.com>"
EMAIL_TO=your-email@example.com
EMAIL_WORKER_SECRET=replace_with_a_random_secret
WEEKLY_REPORT_EMAIL_ENABLED=true
```

Generate the worker secret locally:

```sh
openssl rand -hex 32
```

Paste its output as `EMAIL_WORKER_SECRET`. Use the same value in both services;
never prefix these variables with `NEXT_PUBLIC_`. The API key must be permitted
to send from your chosen Resend domain. Verify that domain by adding Resend's
requested DNS records first. The From address must belong to it; the To address
is your receiving inbox. Keep the existing `NEXTAUTH_URL` set to the public HTTPS
dashboard URL so email links open the right application.

Official setup references: [verified domains](https://resend.com/docs/dashboard/domains/introduction),
[API keys](https://resend.com/docs/dashboard/api-keys/introduction), and
[PDF attachments](https://resend.com/docs/dashboard/emails/attachments).

Production Compose supplies `EMAIL_APP_URL=http://dashboard:3000` to the worker.
This is private container-to-container traffic, not a new exposed port. If running
the worker outside Compose, set `EMAIL_APP_URL` to the application's reachable
base URL; it otherwise falls back to `NEXTAUTH_URL`.

Deploy the release through the normal image workflow. Once the new image is
published, pull it and recreate the application and worker so both receive the
new environment:

```sh
sudo docker compose -f docker-compose.prod.yml pull dashboard notification-worker
sudo docker compose -f docker-compose.prod.yml up -d --force-recreate dashboard notification-worker
```

The existing startup command applies migrations before the application becomes
healthy, and the worker waits for it. Migration
`20261124140000_shared_email_delivery` only adds the shared outbox table and indexes;
it does not rewrite existing records. Use the normal backup/deployment procedure.
No production deployment or real provider send was performed during implementation.

Development Compose forces email off unless `DEV_EMAIL_ENABLED=true` is explicitly
set. Leave it false for normal development, even when copying production variables.
For an intentional development send, both services need that separate opt-in,
valid sender configuration and a restart/recreation. Never enable it on a restored
test database with copied production jobs. Test fixtures inject a fake sender.

## Schedule and contents

The existing worker wakes the email processor approximately once per minute,
independently of push delivery. Each Monday, after the configured **Time for
date-only items** (09:00 by default), it queues the last completed Monday–Sunday
week in the saved dashboard timezone. If first enabled or restarted later in the
week, it catches up only the most recent completed week, not every past week.

`WEEKLY_REPORT_EMAIL_ENABLED` independently controls report email. The inbox's
Weekly report ready checkbox controls inbox/push reminders, not this email flag.
Setting `EMAIL_ENABLED=false` prevents all outgoing email; turning the weekly
flag off prevents new report jobs and retires pending report sends when processed.

The attachment is one A4 page with the same headline statistics as the report:
work totals, Knowledge totals, practice counts/time/result bars/impact, and CAD
finance totals using all data. No individual task names, notes, vocabulary lists,
receipts or pay stubs are attached. A failed report section postpones preparation
rather than substituting zero totals. Missing historical practice measurements
remain labelled Not recorded/partial.

The PDF is generated with `pdf-lib` in memory. Its text body links to the selected
week. The attached report reflects data when prepared; opening the live report
later can reflect subsequent corrections.

## Shared APIs and extension points

| Endpoint | Authorization | Purpose |
| --- | --- | --- |
| `GET /api/email` | GitHub owner | Last 30 delivery status rows, without recipient/body/PDF/payload |
| `POST /api/email` | GitHub owner, existing origin checks | Queue an approved template with validated data |
| `POST /api/email/process` | Separate worker bearer secret | Schedule due features and process the shared queue |
| `GET /api/weekly-report/pdf?week=YYYY-MM-DD` | GitHub owner | Download a current one-page PDF without enabling or sending email |

The public email API is template based. For example, from the signed-in
dashboard's browser console:

```js
await fetch("/api/email", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "weekly-report", data: { week: "2026-11-16" } }),
}).then((response) => response.json());
```

Choose a completed week. Repeating that request reuses the same job, including
one already accepted by Resend; it is not a force-resend command. Sending remains
disabled until explicitly configured. Arbitrary recipients, HTML, attachment URLs
and filesystem paths are not accepted from this endpoint.

To add another email feature:

1. Register its input validator and message builder in the `templates` registry in
   `src/lib/email/server.ts`.
2. Queue it through `enqueueEmail(db, ownerId, { kind, key, payload })` from a trusted
   domain command or a new scheduler. Use a stable key representing one intended
   email. Enqueue in the domain transaction when atomicity is needed.
3. Reuse the existing processor and `sendEmail` transport. Add validation, owner
   scoping, opt-out behavior and tests for that feature.

The Resend transport itself does not know about reports. It takes a prepared
message and idempotency key. The queue does not know how templates are rendered.
Do not turn the owner API into a general send-anything endpoint.

## Reliability, privacy and operations

- `EmailDelivery` is owner-scoped, with a unique owner/deduplication key, atomic
  lease claims, retry scheduling, attempt count and provider acceptance ID.
- The exact sender, recipient, text and base64 PDF are persisted before contacting
  Resend. Retries reuse those bytes and the same provider idempotency key, including
  after a restart; they do not rebuild a changed PDF. API keys and worker secrets
  are never stored in the outbox.
- A changed recipient/sender affects newly prepared jobs. A message already
  prepared keeps its saved destination for safe idempotency. Stop processing and
  inspect outstanding jobs before changing recipients if that matters.
- Resend keeps idempotency keys for [24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys).
  Automatic retries stop conservatively after 20 hours from the first attempt,
  or after eight unsuccessful attempts. Potentially accepted but unresolved jobs
  become `UNKNOWN`; check Resend before any deliberate resend. The app does not
  promise exactly-once delivery across an arbitrary provider outage.
- `SENT` means accepted by Resend, not verified arrival/read status. Bounces and
  spam filtering remain visible in Resend. No webhook or open tracking is added.
- Transport errors are reduced to safe codes. Logs and status responses never
  contain keys, recipients, message bodies or financial values.
- Prepared messages/PDFs in non-pending jobs are cleared after 30 days. Compact
  status/deduplication rows remain to avoid regenerating old mail. Whole-database
  backups include the outbox; it does not use uploaded-document volumes.
- Restore rehearsals must force email off. After an intentional production restore,
  review pending/unknown jobs against Resend before re-enabling delivery, since
  restored delivery state may predate an actual send.

Diagnose missing mail using `GET /api/email`, worker logs, and Resend's dashboard.
Common safe codes include `EMAIL_CONFIGURATION`, `EMAIL_PREPARATION_FAILED`,
`RESEND_HTTP_401`, `RESEND_HTTP_429`, `EMAIL_TEMPLATE_DISABLED`, and
`DELIVERY_UNCERTAIN`. Confirm both services received the same flags/worker secret,
that the worker can reach the application and that the sending domain is verified.

## Verification

Implementation checks are recorded in the weekly-report maintenance guide.
Test commands:

```sh
node --test tests/email.test.mjs
RUN_EMAIL_DB_TEST=1 node --test tests/email.integration.mjs tests/email-server.integration.mjs
RUN_EMAIL_HTTP_TEST=1 node --test tests/email.http.mjs
```

Database tests require the isolated `work-db` host and
`WORK_MANAGEMENT_DISPOSABLE=1`, use rollback-only fixtures and fake senders. The
HTTP test requires the development application and performs read-only PDF/status
requests. Real Resend account credentials, DNS verification and mailbox delivery
cannot be verified until the owner configures them.
