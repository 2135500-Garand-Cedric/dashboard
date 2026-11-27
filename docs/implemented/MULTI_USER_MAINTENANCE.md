# Invited Japanese learners: maintenance

Implemented for a small invite-only group. This is one application and database,
with private Japanese workspaces. The existing owner retains every module. No
additional container, OAuth package or paid identity service was added.

## Inviting someone

Open **User management** in the owner's Settings. Create a labelled
invitation, copy its link when shown, and send it yourself. The app does not send
an invitation email. Tokens are stored hashed; links cannot be retrieved afterward.
Invitations expire after seven days, work once, and can be revoked. Up to 50 unused,
unexpired invitations may exist. Labels help the owner recognize invitations;
they do not bind a link to a recipient's email. Anyone holding an unused link can
claim it, so revoke a forwarded/lost link and create another.

The recipient opens the link and signs in with GitHub or configured Google. First
setup asks for a display name, timezone and starter/empty choice. Setup is atomic
and retry-safe, including concurrent tabs; failed copies roll back. Existing
members sign in without another invitation. There is no public signup switch.

The Japanese learner preset permits vocabulary reading/managing, practice,
statistics and history. The owner can adjust those five permissions, suspend a
member, or revoke their sessions. Practice/managing require vocabulary read access.
Other modules cannot be granted yet: their data and services still intentionally
belong to the owner. Suspension preserves data and blocks access; it is not deletion.
Owner access cannot be demoted or suspended from this interface.

## Starter content and independent data

The migration publishes all vocabulary belonging to owner user 1, as requested and
with the owner's confirmation of redistribution rights. The snapshot contains
categories, all readings, verb-ending types and existing conjugated form content.
It contains no practice history, progress, stars, rewards or personal settings.

**Publish starter vocabulary** makes a new immutable version from the owner's
current list, for future registrations. It never synchronizes or overwrites existing
members. Members may edit/delete their independent copies. New progress links start
WEAK, their per-activity practice timers are unset, stars are off and new users have
zero XP/gold. Applicable kanji-writing links use that member's known-kanji list;
conjugated forms are excluded from kanji writing. Empty setup creates only the
minimal Verb, Kanji and Vocabulary categories.

Categories have owner-specific names and a stable semantic kind. Renaming a Kanji
or Verb category does not change its behavior. Composite foreign keys prevent
cross-user category/form/progress references. Shared Activity and VerbFormType
rows remain read-only definitions.

## Google and GitHub setup

GitHub retains `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. To enable Google add:

```dotenv
GOOGLE_CLIENT_ID=your-google-web-client-id
GOOGLE_CLIENT_SECRET=your-google-web-client-secret
```

Create a Google OAuth web client and configure the exact authorized redirect URI:

```text
https://YOUR_DASHBOARD_DOMAIN/api/auth/callback/google
```

Use `http://localhost:3000/api/auth/callback/google` for a separate local development
client. Configure the provider's consent screen/audience and invited test users if
the client is in testing mode. Google is absent from sign-in/link choices until
both environment values exist. Keep secrets out of source control, and recreate
the application container after changing its environment. Both Compose variants
already load `.env`. Set `NEXTAUTH_URL` to the canonical HTTPS origin and keep
`NEXTAUTH_SECRET` stable. No build-time secret or new container is needed.

Accounts are identified by provider + permanent subject, never by display name or
email. Verified email collisions fail closed rather than merging accounts. A user
who wants both providers signs in first and explicitly connects the other through
**My account**. Linking/unlinking requires authentication within ten minutes. The
last sign-in method cannot be removed, and the owner's original GitHub recovery
method cannot be disconnected. Unlinking revokes all sessions and device
registrations; sign in again with a remaining method.

Live Google/GitHub consent and callbacks require deployment credentials and a real
provider account; automated tests exercise the verified identity boundary and
local session lifecycle without impersonating those external services.

## Migration and deployment

Deploy application code and migrations together through the existing pipeline.
`20261128120000_invited_japanese_users` preserves existing integer user IDs and
owner/domain records; it binds GitHub subject **89470930** to existing User **1**.
It does not promote the first registering account or match an owner by email.

The migration adds revocable sessions, identities, invitations, permissions and
starter versions. It backfills verified child ownership, clones/remaps categories
for any other existing owner references, repairs lagging legacy integer sequences
before inserting, and adds ownership constraints. The existing owner is marked
initialized without resetting their words, forms, timers, statuses or history.

**After cutover everyone must sign in again.** Old JWT cookies are no longer valid.
Old push devices lacked a session binding and are deliberately disabled; the owner
must enable notifications again from the device. Sign-out, unlinking, suspension
and explicit session revocation disable associated subscriptions/pending sends.
The worker also rejects expired/missing session bindings. A push already accepted
by a browser vendor cannot be recalled.

Back up the complete database before deployment. The migration was rehearsed on a
restored local development backup: before/after hashes matched for retained owner
user/category/vocabulary/form/progress/practice/snapshot and financial/task/event
records, excluding newly added technical columns. Production was not changed.
Rolling back this authentication cutover requires compatible code and database;
restore the backup and closed owner-only version together rather than running old
owner-scoped Japanese code with member access enabled.

Owner recovery uses the backed-up User 1/AuthAccount mapping and authenticated
host maintenance. There is no public bootstrap/recovery endpoint. A fresh empty
database needs that explicit mapping; running an example seed is not owner identity
provisioning. Never delete/recreate the owner to repair sign-in.

## Structure and security boundaries

- `src/lib/accounts/`: identity policy, adapter, actor context, capabilities,
  invitations, token handling and first-time initialization.
- `src/lib/auth.ts`: NextAuth v4 database session callbacks and the two providers.
  The custom adapter exposes string IDs only at NextAuth's boundary; application
  foreign keys remain integers. OAuth tokens are not retained.
- `api/admin/users`, `api/account`, `api/onboarding`, `api/registration/invite`:
  administrative, self-service and tightly bounded public invitation APIs.
- `requireOwner`/`requireOwnerPage`: private modules still require the actual owner.
  Converted Japanese routes require supported permissions and owned records.
- `withUserTimeZone` establishes the authenticated actor and timezone for Japanese
  operations. Exposed helpers have no implicit user-1 fallback. Maintenance scripts
  must deliberately supply the appropriate owner/context.
- `MemberShell` mounts only member providers/navigation. It does not poll private
  inbox/search/finance/music services. Client state is keyed by user/session, with
  foreground and back-navigation checks. The service worker does not cache private
  content. Use Sign out before sharing a device; closing a tab is not sign-out.
- Audit events retain subject user ID and actual OWNER/USER actor. The owner can
  read all AUTH security events; ordinary members cannot read global Logs. Retention
  now covers every user's audit stream. Private existing workers remain explicitly
  owner-scoped rather than iterating members automatically.

Every protected request rechecks active session/user/permissions. Revocation applies
to subsequent checks; an ordinary operation already authorized and running may
finish. Identity/session administration is serialized to avoid conflicting linking,
registration and session issuance. There is no cross-user permission cache.

## Privacy and operations

`/privacy` describes stored account/profile data, independent learning records,
host-administrator access and manual export/deletion requests. No passwords or
provider access/refresh tokens are stored. Session/invitation/link tokens are hashed
in the database. Do not log raw cookies, tokens, callback payloads or vocabulary.

The host administrator handles account data requests. There is no automatic
account export/delete UI or promise of immediate erasure from backups. Use verified
identity before an export or deletion, keep an administrative deletion ledger
outside restored application data, and reapply it before exposing a restored backup.
The existing host backup-retention schedule controls backup expiry. Do not offer
public signup until retention, abuse limits and account lifecycle operations are
ready for that audience.

Full database backups include all added tables; document backup requirements for
private owner uploads are unchanged. Restore only into an isolated environment
first, with outgoing push/email disabled and provider callbacks separate. Protect
backups as account and learning data as well as financial data. See the project
README and module maintenance guides for existing backup/restore commands.

Monitor database size, request latency, connections and failed initialization.
Small invite-only use does not need a new queue, but NAS capacity is not guaranteed
by workstation tests. Onboarding batches inserts inside a bounded 60-second
transaction; measure the real published pack on the NAS before broad invitations.
The public invitation claim endpoint has an application-wide attempt budget and
8 KiB body limit. Larger/public use needs further edge throttling and capacity tests.

## Verification

Run unit tests with `node --test tests/*.test.mjs` in the development container.
The opt-in database suite requires the isolated `work-db` host and
`WORK_MANAGEMENT_DISPOSABLE=1`:

```text
RUN_MULTI_USER_DB_TEST=1 node --test tests/multi-user.integration.mjs
RUN_NOTIFICATION_DB_TEST=1 node --test tests/notifications.integration.mjs tests/notification-inbox.integration.mjs
```

The HTTP sweep is local development only:

```text
RUN_AUTH_HTTP_TEST=1 node --test tests/auth-security.integration.mjs
```

It creates temporary member/session fixtures, probes every private API handler and
cleans its records. The Playwright suite `tests/multi-user.browser.mjs` requires
`RUN_MULTI_USER_BROWSER_TEST=1`, local browser tooling and a private fixture JSON
created/cleaned using `tests/helpers/multi-user-browser-fixture.mjs`. Never execute
these fixture or integration tests against production.

The checks cover invitation expiry/revocation/reuse, explicit identity linking,
session revocation, owned/foreign keys, concurrent initialization, independent
starter copies, per-user practice/rewards/replay, private module denial, live
permission changes, member shell traffic and phone-sized setup/logout. TypeScript,
unit tests and production Docker packaging are also checked. The local verification
passed 219 unit tests, 17 database checks (plus a repeat including an injected copy
failure/rollback), a desktop/phone browser workflow and 225 live API handlers.
ESLint found no errors; existing Japanese client hook/image warnings remain.

A schema diff on the restored database found four pre-existing calendar foreign-key
update-action declaration differences (birthdays, holidays, recurrence series and
recurrence skips), with no new authentication/Japanese model differences. Those
unrelated declarations were left unchanged; inspect them before a future schema
baseline or generated migration. Live external OAuth,
installed iPhone account switching/push and NAS concurrency remain deployment pilot
checks; passing local tests does not certify those external environments.

My account is now under `/settings/account`; Settings is shared, with only the
account tile visible to members. Private settings child pages keep owner guards.
The account timezone drives the connected user's entire permitted dashboard; the
separate timezone editor/API were retired. `/account` redirects old bookmarks.

Practices can finish early after at least one rated word. The review, saved history,
activity-specific timers and rewards include only rated words. XP remains 1 per
Good and 2 per Perfect; whole gold is `floor(completed words / 5)`. Okay confirms
the save. Early finish uses the last rating time for duration and timer updates.

Verb and Kanji are protected default categories. Existing accounts receive missing
defaults via migration; empty and starter onboarding both ensure them. Custom
categories remain editable, while the category API rejects editing/deleting defaults.
Verb forms display automatically in vocabulary details, and Cancel discards unsaved
vocabulary edits.

Verb (dict only) is a virtual practice choice (`-1` in the practice category list),
not a Category row. It includes base words from the default Verb category and no
conjugated forms. Selecting Verb as well enables all forms and does not duplicate
activity-word links. The virtual choice is recorded in session history and is
validated during preview/save and safe replay.
