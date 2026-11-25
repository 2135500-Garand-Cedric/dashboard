# Outlook calendar → dashboard: automatic one-way synchronization

Status: proposal only. No calendar connection, credentials, migrations or sync
code are implemented by this document. Repository and Microsoft documentation
reviewed November 24, 2026. The actual Microsoft account, mailbox permissions and
organization policies have not been tested.

## Opinion and recommendation

Yes, this is possible, and I think it is a useful addition. Having meetings,
personal appointments, task deadlines and work sessions in one view would make
the dashboard a more complete place to plan your day. Importing automatically
would remove the need to enter appointments twice.

I recommend **Microsoft Graph with read-only calendar access**, refreshing selected
calendars approximately every five minutes. Start with scheduled synchronization;
add Microsoft change notifications later only if the delay becomes inconvenient.
There is no need for AI, Zapier or a second calendar application inside the page.

### What “source of truth” would mean

The dashboard can become **the main place you consult your schedule**. With a
one-way integration, however, Outlook still owns the imported appointment's title,
time and cancellation state. Changes made there flow into the dashboard.

| Record | Where its main fields are edited | Appears in dashboard |
| --- | --- | --- |
| Outlook appointment/meeting | Outlook | Yes, as a synchronized event |
| Dashboard-created event | Dashboard | Yes; it is not sent to Outlook |
| Task, deadline, follow-up or work session | Dashboard | Yes, under existing rules |
| Local task linked to an Outlook event | Dashboard for the task/link; Outlook for the appointment | Yes |

If the eventual goal is editing every appointment only inside the dashboard,
that would need two-way synchronization or a deliberate migration away from
Outlook. That is a different project. The one-way version is simpler and avoids
accidentally modifying invitations or other people's meetings.

## What the experience would look like

In **Settings → Connected calendars**, press **Connect Outlook**, authorize the
Microsoft account, and select which of its accessible calendars to include.
You could initially select the personal calendar and later add a work calendar.
Do not silently include every shared, holiday or subscribed calendar.

Each connection/calendar tile would show its name, assigned activity type/color,
last successful sync, connection status, and buttons for Sync now, Pause and
Disconnect. Show coverage dates so imported history is not mistaken for a complete
lifetime archive. Reconnection should be straightforward if consent expires.

Imported appointments would appear in the existing desktop calendar, phone day
view, upcoming sidebar and dashboard calendar tile. Use the activity-type palette
plus an **Outlook** badge/calendar label so their source remains clear even when
two events share a color.

Opening one would show the written date/time, location, available details and
**Open in Outlook**. Its source fields would be read-only. You could link a task,
such as “Prepare slides” to an imported meeting, without changing that meeting.
Adding a local activity type or task association is dashboard metadata and does
not write anything back to Microsoft.

Example:

1. A meeting is created in Outlook for Wednesday, 10–11 a.m.
2. The next successful sync adds it to the dashboard.
3. You link a preparation task to it.
4. The organizer moves the meeting to 11 a.m.; synchronization updates the same
   dashboard event while retaining its task link.
5. If the meeting is cancelled, it leaves the active schedule with an appropriate
   retained cancellation state; the preparation task is not silently completed.

## Connection options

### Microsoft Graph — preferred

Use Microsoft's supported API to read calendar data after you authorize it.
The [Outlook API overview](https://learn.microsoft.com/en-us/outlook/rest/) covers
Microsoft-hosted Outlook.com and Microsoft 365 accounts. Personal and work/school
accounts can have different consent requirements.

The important distinction is the mailbox, not the Outlook app. A Gmail, iCloud or
local calendar merely displayed inside Outlook is not automatically available
through the Microsoft mailbox API. Shared/delegated calendars also need their
actual permissions verified before being included.

Use delegated read permissions, such as `Calendars.Read`, plus `offline_access`
and the required sign-in scopes. `Calendars.ReadBasic` can be sufficient for a
minimal calendar view, but full descriptions or some incremental-sync operations
can require broader read access. Do not request calendar-write, mail-read or
mail-send permissions for this integration.

Microsoft's [calendarView endpoint](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0)
supports personal/work accounts and returns individual events, recurring
occurrences and exceptions within a requested date range. This is a better basis
than copying a list of series masters and trying to reconstruct Outlook recurrence
rules ourselves.

### Published ICS feed — possible fallback

Outlook can also publish a subscribable calendar link, where the account/policy
allows it. The dashboard could periodically download and parse that feed.
[Microsoft's publishing documentation](https://support.microsoft.com/en-us/outlook/share-your-calendar-in-outlook-com)
describes the option. Importing a one-time `.ics` file is a snapshot, not automatic
synchronization.

This can avoid OAuth setup, but freshness, available details and the published
range depend on the feed. Treat its URL as a credential: anyone who obtains a
readable published link may be able to view its contents. Recurrence exceptions,
removals and stable identity still need proper handling, not a repeated
“create event” import. Organizations may disable publishing entirely.

I would use Graph first for reliability and visibility into connection failures.
An ICS fallback should be a deliberate alternative, not a way to bypass a work
account's sharing restrictions.

## How it fits the current application

The repository already has an `Event` model with timed/all-day dates, timezone,
activity type, revision, task links and activity history. It also has calendar
aggregation in `src/lib/work-management/calendar-server.ts`, event commands in
`server.ts`, and shared event UI under `src/components/calendar/`.

Reuse those records and views so Outlook appointments work with the rest of the
dashboard. Avoid an embedded Outlook iframe or a separate disconnected event list.
Existing native task/event IDs, relationships and local recurrence rules stay intact.

A small additive data model would be enough:

| Proposed model | Purpose |
| --- | --- |
| `CalendarConnection` | Dashboard owner, Microsoft account/mailbox identity, encrypted authorization material, connection state and sync scheduling |
| `ConnectedCalendar` | Remote calendar ID/name, selection state, local activity-type mapping, sync coverage and last successful scan/checkpoint |
| `ExternalCalendarItem` | Remote event/occurrence identity, link to one existing `Event`, source version/fingerprint, source URL, active/cancelled/removed state and synchronization metadata |

Owner-scope the connection and all dependent records. Uniqueness should prevent
one Microsoft mailbox item from becoming two local events when it moves between
selected calendars. Store IDs exactly as supplied, with case-sensitive comparison.

Request [Outlook immutable IDs](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
consistently. They remain stable for moves within the same mailbox, but not every
export/reimport or archive-mailbox move. Preserve relevant recurrence/occurrence
identifiers too. Matching solely by title and start time is unsafe: two real
appointments can share both.

No title-based automatic merging with existing local appointments. If the same
meeting is already manually entered, offer review/linking of the duplicate instead
of silently deleting one. Events arriving through different mailboxes can also
need explicit duplicate review.

## Synchronization strategy

### Start with complete, bounded scans

For the first implementation, fetch `calendarView` for each selected calendar
over an explicit window, for example three months back and twelve months ahead.
Fetch every page and stage the result before treating the scan as complete.
Upsert imported events using their stored source identities and update only
source-owned fields when their fingerprint changes.

“All events” needs this qualification: an indefinitely recurring appointment has
no finite set of future occurrences. The application should cover every event in
the configured range and support extending/backfilling coverage when you browse
other dates. If all available past history is wanted, make it a chunked backfill
option. Never show an empty, unsynchronized historical month as proof that nothing
was scheduled.

Use Graph's expanded occurrences for imported series; do not feed them into the
dashboard's `RecurrenceSeries` generator as well. That would risk generating the
same appointments twice. Locally recurring tasks/events retain their own current
behavior and visibility rules.

### Updates, cancellations and removals

Keep the local event ID stable across remote edits. Synchronization must distinguish
an actual cancellation/deletion from an occurrence that moved outside the scanned
range or into another selected calendar. Only reconcile missing items after a
complete successful scan of the relevant coverage, accounting for those moves.

Keep cancelled/removed source state as a tombstone or inactive record, rather than
hard-deleting a locally linked event. Hide it from the active calendar and upcoming
lists, preserve task associations and make its former state understandable when
opened through a task. A failed/partial request is never evidence of deletion.

Source state needs to be checked by calendar readers, the main dashboard and
reminder resolution. Marking a cancelled Outlook meeting as an ordinary completed
local event would blur two different meanings.

### Later optimization: delta queries and webhooks

Microsoft Graph has [event delta queries](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0),
but the documented v1.0 calendar-view delta flow targets the primary calendar and
a fixed date range. Do not assume a per-calendar delta URL works for every selected
calendar. Use it only where supported, storing its opaque checkpoint after all
pages have committed. Non-primary calendars can retain the complete-scan path.

Changing the date window requires new coverage/checkpoints, not reusing a token
for a different range. Expired tokens need a safe rescan that preserves local IDs
and associations.

For more immediate updates, Microsoft can call an HTTPS webhook. This is a signal
to resynchronize, not a replacement for reconciliation. Subscriptions need renewal
and notifications can be repeated or missed. Outlook event subscriptions currently
last less than seven days; rich notifications have shorter limits.
[Microsoft change notification documentation](https://learn.microsoft.com/en-us/graph/change-notifications-overview)
describes these constraints. I would postpone that extra lifecycle management until
five-minute polling has proved insufficient.

## Authentication and operational behavior

Keep **GitHub owner-only dashboard authentication**. Connecting Microsoft is an
integration action performed by the already signed-in owner; it must not introduce
a second way for another person to log into the dashboard.

Use Microsoft's supported authorization library and
[authorization-code flow with PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
Bind the callback to a short-lived, one-use connection state and the initiating
owner session. Validate redirect/issuer/account information, show which account
was connected, and store refreshed credentials server-side with encryption.
Never store a Microsoft password or put refresh tokens in browser storage/logs.

Refresh credentials in the background when permitted; reconnect when consent is
revoked or tenant policy requires it. Permission and network errors should leave
the last known events visible with a stale-sync warning. They must not erase the
calendar. Respect throttling/backoff, serialize scans per connection and retry
without duplicate events.

The existing background worker can schedule synchronization directly or wake a
protected internal Next.js job endpoint, following the existing email worker pattern.
Keep slow sync work bounded so it does not delay reminders. The normal calendar
page reads local records and does not wait on Microsoft for every navigation.
No extra container is required for this first design.

Pause/Disconnect should stop fetching and remove stored access material as
appropriate. Let the owner choose whether to hide or retain the last imported
copies; preserve native tasks and links. A local disconnect does not delete any
Outlook appointment. Backup restore tests must leave external synchronization off
until credentials and desired connection state are deliberately reviewed.

## Local rules, reminders and the future assistant

The server must reject edits/deletes/conversions/recurrence changes to imported
source fields through ordinary dashboard APIs, not merely hide the Edit button.
Local task links, activity-type mapping and optional reminder preferences can be
edited separately. Completing a linked task does not cancel the meeting or archive
the imported event.

Disable dashboard push reminders for imported events by default to avoid doubling
Outlook's own reminders. Offer an explicit local opt-in. When enabled, moved or
cancelled appointments should invalidate old queued reminders through the current
inbox/push reconciliation rules.

Timed events use canonical instants and the saved dashboard display timezone;
all-day events preserve date-only ranges with exclusive end dates. Handle Microsoft's
timezone identifiers through a supported mapping where needed rather than assuming
they are always IANA strings. Keep tentative/free/busy/cancelled states distinct,
and sanitize remote descriptions and links before rendering them.

The [planned assistant](AI_ASSISTANT_PLAN.md) could read this unified calendar and
link preparation tasks to meetings. Its event-edit tools must respect the same
read-only source rules. Outlook descriptions remain external content, not instructions
authorizing the assistant to perform changes.

## Cost and setup

For an eligible existing mailbox, I would expect **approximately $0 additional
monthly API cost** at this personal scale. Standard Microsoft Graph access within
documented limits is included with the applicable user entitlement; Microsoft
distinguishes that from its metered APIs.
[Microsoft Graph pricing overview](https://learn.microsoft.com/en-us/graph/metered-api-overview)
explains that distinction. Existing Microsoft 365 licensing, NAS hosting and
implementation/maintenance effort are not included in that estimate.

No Power Automate/Zapier subscription or AI API usage is needed. The proposed
five-minute interval is an implementation target, not a delivery-time guarantee.
Microsoft availability, throttling and your NAS uptime affect freshness.

Setup would involve an Entra app registration, the supported account type(s),
read permissions, a registered HTTPS callback and server-side credentials. A work
or school tenant may require administrator approval or block the integration.
Personal account/app-registration availability and any shared calendars must be
verified with the actual account before committing to an implementation path.

Possible future environment variables would cover Microsoft client ID/secret,
tenant/account configuration and an integration encryption key. Exact names and
callback paths should be documented during implementation; nothing needs adding
to `.env` for this proposal.

## Suggested implementation order

1. Verify the mailbox type, ability to register/authorize the app, and calendars
   you want included. Start with one owned Microsoft-hosted calendar.
2. Add the owner-only connection flow and minimal source/mapping models, preserving
   existing native events and IDs.
3. Implement complete paginated range scans, stable upserts, recurrence exceptions,
   cancellation handling and connection health.
4. Integrate source badges, colors, read-only event details and local task linking
   across desktop, phone, dashboard and upcoming lists.
5. Add optional reminders and coverage/backfill controls. Verify restart/retry and
   reconnect behavior before enabling automatic scheduling in production.
6. Add supported delta optimization or webhooks only if the initial polling design
   needs improvement.

Tests should cover repeat scans, partial pagination, permission loss, token refresh,
remote edits/deletions, moved events, two identical appointments, recurring exceptions,
cancelled occurrences, multi-day/all-day dates, DST changes, local task links,
duplicate reminders, disconnects and unauthorized connection/edit attempts.

My recommendation is to proceed with the read-only Graph version when you want
this feature: it would make the dashboard a stronger planning hub while keeping
Outlook's meeting management intact.
