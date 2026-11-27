# Multiple users, Japanese sharing and account management

Status: implemented for an invite-only Japanese pilot. This document retains the
original architecture proposal and historical inventory below; they describe the
starting system, not the current authentication implementation. Current operational
guidance is in [Multi-user maintenance](MULTI_USER_MAINTENANCE.md).

## Selected scope and implementation

- Invite-only registration; single-use invitations expire after seven days.
- GitHub and optional Google. Apple, open signup and other module access are deferred.
- The owner confirmed redistribution rights and selected **all owner vocabulary** for
  the initial immutable starter version. Publishing creates a new version for future
  learners; it never changes existing copies.
- Members may edit and delete their copies. Each has isolated categories, readings,
  verb forms, practice results, timers, statistics and rewards.
- Owner user 1 and permanent GitHub identity are preserved, with access to everything.
  The administration page cannot demote/suspend this account.
- Database sessions, explicit linking, supported Japanese capabilities, suspension,
  session revocation, account privacy information and owner-only security logs are implemented.
- No new container or identity subscription is required. Google credentials must be
  configured before its button appears. Live provider consent and NAS capacity remain
  deployment verification tasks.
- Migration was rehearsed on a restored development database, comparing preserved
  owner/domain records before and after. No production database was changed.
- Basic account/privacy information is published at `/privacy`. Deletion/export requests
  are handled by the host administrator; there is no automated account deletion tool.

## Recommendation

Yes, this is possible within the existing Next.js, Prisma and PostgreSQL app.
I recommend starting with Google and the existing GitHub login, giving new members
only their own Japanese learning area, and keeping your other modules owner-only.
Add Apple later if its setup and membership requirements are worthwhile.

The substantial work is separating data and enforcing access on the server.
OAuth proves who signed in; the dashboard must decide what that person can do
and which records they own. Removing the current GitHub restriction before that
work is finished would expose assumptions that are safe only in the current
single-owner app.

The first version should have independent personal workspaces, not shared records
or teams. Someone receiving Finance access later would receive their own financial
workspace, not access to your accounts, receipts or income.

## What exists today

| Existing code/model                                        | Consequence for this change                                                                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/auth.ts`                                          | NextAuth v4, GitHub only, JWT sessions and an explicit permanent GitHub owner allowlist. There is no database authentication adapter today.                       |
| `src/lib/require-owner.ts`, `ProtectedLayout.tsx`          | APIs and pages reject every non-owner. Preserve these protections for private modules during the transition.                                                      |
| `src/app/layout.tsx`, `AppShell.tsx`, `SideMenu.tsx`       | The shell is owner-only and mounts inbox/search/music providers globally; navigation and providers need an authorized member variant.                             |
| `User`                                                     | Integer IDs, required unique email, existing owner data under ID 1. No OAuth `Account`, persistent `Session`, role, suspension or permission models.              |
| Japanese routes and helpers                                | Many use `userId = 1`, including vocabulary creation/editing, statistics, history, progress snapshots and practice defaults.                                      |
| `api/japanese-practice/practices/route.ts`                 | Today's practice query filters by date without a user predicate. The owner guard currently protects it; it cannot be opened to all authenticated users unchanged. |
| `Vocabulary`, `VerbForm`, `ActivityVocab`                  | Vocabulary has ownership, but child form/progress ownership must be validated through its parent; mutable IDs must never authorize themselves.                    |
| `Category`                                                 | Globally editable, globally unique names, no owner. Member edits/deletions would affect other users unless redesigned.                                            |
| `Practice`, `JapaneseProgressSnapshot`                     | Have user IDs, but lack a Prisma User relation; Practice defaults to user 1 and its session key is globally unique.                                               |
| `Activity`, `VerbFormType`                                 | Useful shared activity/conjugation definitions; keep them read-only to ordinary members.                                                                          |
| `src/lib/user-settings.ts`                                 | Reads the owner's timezone, not a current signed-in user's timezone.                                                                                              |
| Search, Quick add, weekly reports, email and notifications | Several entry points explicitly use the owner ID. They must not be mounted/enabled for members by merely changing the shell guard.                                |
| `src/lib/audit/`                                           | Owner-centric actor/subject mapping, GitHub-specific attribution and owner-scoped readers/retention. These need deliberate multi-user changes.                    |
| `public/sw.js`                                             | Does not cache authenticated pages or API responses. Preserve this behavior and address device/account switching.                                                 |

The shared `WorkContact` People directory is not an account directory. A person
who requested a task or reimburses an expense must not become a login account.

## The experience for a new user

1. Open the dashboard and select **Create account** or **Sign in**.
2. Authenticate with a supported provider. The app creates or finds an internal
   user using the provider's stable identity, not the submitted display name.
3. On first access, show a short setup page with display name, timezone and:
   **Start with the published starter vocabulary** or **Start with an empty list**.
   Explain that starter words are an independent copy and all progress starts fresh.
4. Save setup once, showing a loading state and a safe retry if copying fails.
5. Open Japanese Practice. Navigation shows Japanese Practice, Japanese Statistics
   and minimal account controls such as sign-out and the user's own timezone/login
   methods. Vocabulary creation/editing and practice history remain accessible as
   supporting routes within the Japanese area.
6. Other dashboard modules are unavailable. Guessing their URLs or API endpoints
   does not grant access.

A user returning through the same provider resumes the same account. Setup does
not run again on refresh, session renewal, another device or a repeated callback.
An account awaiting setup can access only setup/account/sign-out operations.

Recommend an **invite-only pilot**, where invited people still create their own
accounts without you creating passwords. Keep registration modes separate from
permissions: closed, invite-only and open. Open self-registration can be enabled
later with the same Japanese-only defaults after abuse/isolation tests pass.
Do not make manual approval mandatory unless you choose that policy.

## Login methods and identity

### Proposed order

| Method            | Recommendation and setup                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google            | First addition: convenient for non-technical users. Register a Google OAuth client and consent configuration; configure production/development callback URLs and minimal identity scopes. |
| GitHub            | Keep it, including your current permanent owner identity. Friends can use their own accounts after safe registration is enabled.                                                          |
| Apple             | Later option, especially useful for iPhone users, with additional developer-account configuration and credential maintenance.                                                             |
| Microsoft         | A reasonable later addition if intended users prefer personal Microsoft or work/school accounts; choose supported tenant/account types explicitly.                                        |
| Email magic link  | Optional later fallback. Requires short-lived, single-use verification tokens and an authentication-mail policy distinct from report-email preferences.                                   |
| Username/password | Defer. It adds password storage, reset/recovery, credential-stuffing defenses and support obligations that OAuth avoids for this first release.                                           |

The installed library is `next-auth` v4.24.x, not Auth.js v5. Choose an adapter
compatible with the installed version, or plan/test a separate framework upgrade;
do not mix version-specific examples into this security migration.
NextAuth supports multiple providers and persistent account/session adapters.
See [v4 provider configuration](https://next-auth.js.org/configuration/providers/oauth)
and [session/adapter configuration](https://next-auth.js.org/configuration/options).

Google needs exact callback URLs, for example
`https://your-domain/api/auth/callback/google`; request only basic identity data,
not Gmail, Calendar or other product access. Publishing the consent configuration,
allowed domains/test users and provider requirements need checking before public
registration. See [Google setup](https://next-auth.js.org/providers/google) and
[Google's OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

Apple's documented web setup uses a Services ID associated with a primary App ID,
plus registered domains/return URLs. Validate eligibility for this web/PWA project
before committing to it; installing a PWA is not a native App Store release.
Plan for its signing key and expiring client-secret lifecycle, first-login profile
handling and private-relay addresses. Apple currently lists standard Developer
Program membership at **US$99/year**, with regional pricing and some fee waivers;
this is a developer membership, not a charge to each dashboard user.
Sources: [Apple web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/),
[NextAuth Apple integration](https://next-auth.js.org/providers/apple),
[Apple membership pricing](https://developer.apple.com/help/account/membership/program-enrollment/).

### Linking multiple sign-in methods

One dashboard user can have multiple provider accounts. Enforce uniqueness on
`provider + providerAccountId`, and map those identities to one internal user ID.
Email is contact/profile data, not proof that two accounts should be merged.
Google/GitHub email differences and Apple relay emails must be supported.

Keep automatic cross-provider email linking disabled. Provide an explicit
**Account → Sign-in methods → Link another provider** flow, requiring a valid
current session and recent authentication. Bind a short-lived linking intent to
that user/session/provider and validate it at callback/adapter boundaries. Reject
identities already linked to another user; do not silently merge accounts.
Ordinary registration/login while already authenticated must not accidentally
become an owner-account linking operation. NextAuth's existing signed-in linking
behavior needs to be handled explicitly, not assumed safe for every entry point.
See [NextAuth account-linking behavior](https://next-auth.js.org/configuration/providers/oauth#allowdangerousemailaccountlinking-option).

Do not let someone unlink their last usable sign-in method. Owner recovery should
be a documented, authenticated maintenance operation; never a public “claim owner”
endpoint or automatic promotion by matching an email address.

## Permissions and your management page

Use two initial roles: **Owner** and **Member**. Only your account can administer
users or grant/revoke rights. Do not add multiple administrator tiers initially.

Add an owner-only **User management** page, proposed at `/admin/users`, linked from
your settings/navigation. It should show account name, contact email if present,
creation date, last successful sign-in, linked provider names, setup status,
active/suspended status and effective access. No OAuth tokens or session secrets.

An account detail view should support permission presets, individual capability
toggles, suspension/reactivation and revoking sessions. Protect owner access from
accidental self-suspension/demotion. Use confirmations and audit entries for these
actions. Viewing the management page does not need to display people's vocabulary
or practice history. Technical access to the database/backups still exists for the
host administrator; do not promise end-to-end privacy from the server operator.

Suggested first-release capabilities:

| Capability                   | What it permits                                                              |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `japanese.vocabulary.read`   | Read the user's own words, categories and readings.                          |
| `japanese.vocabulary.manage` | Add/edit/delete their own vocabulary, forms, categories and starred state.   |
| `japanese.practice`          | Start/review/save their own practices and receive server-calculated rewards. |
| `japanese.statistics.read`   | Read their own graphs and aggregate progress.                                |
| `japanese.history.read`      | Read their own saved session/word breakdowns.                                |

The default **Japanese learner** preset includes these capabilities. Define
prerequisites centrally: managing/practicing needs vocabulary read access; history
drill-down is separately guarded even when aggregate statistics are available.
Existing sessions/history remain stored if access is revoked; suspension is not
account deletion.

Use one server capability registry for API/page policy and navigation. Hiding a
button is only UI behavior. Every read/write, helper endpoint, export, document
route and background operation needs its own server policy and ownership check.
Never accept a role, permission or authoritative user ID from a request body.

For later modules, show **Not available for members yet** until their services are
actually converted and tested. A module permission must not unlock code still
using owner ID 1. Finance, Work, Projects, Calendar, Knowledge, global search,
notifications, Logs and weekly reports remain owner-only at launch. In particular,
“grant Finance” must never mean “let this person browse the owner's finances.”

## Proposed data-model changes

Keep the existing `User` integer IDs and all domain records. Suggested additions
and extensions, with final names chosen during implementation:

| Entity                   | Purpose                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User` extensions        | Role, active/suspended status, email verification data and last sign-in; retain timezone, XP/gold and all existing IDs. Allow absent provider email rather than inventing a fake address. |
| Authentication account   | Provider identity and internal user relation; unique provider/subject. Keep it distinct from `FinancialAccount`.                                                                          |
| Authentication session   | Revocable opaque session token, user relation and expiry. Use the chosen adapter's required fields/types.                                                                                 |
| `UserPermission`         | Unique user/capability grants, grantor and timestamps; supported capabilities only. Missing grant means denied for members.                                                               |
| `VocabularyPackVersion`  | Immutable, owner-published starter content with version/size/status; no learner progress or private owner history.                                                                        |
| `JapaneseInitialization` | Unique per-user first-setup record: empty/pack/existing-owner choice, selected pack version, request identity, completion state/time. Authoritative source for onboarding completion.     |

A verification-token model is needed only if email sign-in/verification is added.
An invitation model is useful if invite-only registration is chosen; use hashed,
expiring, bounded-use tokens. Do not add teams, organizations, sharing ACLs or a
separate database per person for this first version.

**Adapter compatibility matters:** typical NextAuth adapter schemas expose string
user IDs, while this app uses integers. Do not change every existing ID to fit an
example schema. Plan a narrowly scoped, tested adapter compatibility layer using
the documented adapter contract: the auth boundary can expose string IDs while
all database relations preserve validated integer IDs. Verify every adapter method,
not just initial login. Authentication session/account foreign keys use the actual
User key type; arbitrary client strings cannot become database IDs.

### Japanese ownership and constraints

- Make `Category` user-owned, with uniqueness per owner and a normalized name.
  Preserve the owner's existing category IDs. Add a stable semantic kind for
  Kanji/Verb/Other behavior: eligibility/conjugation currently depends on names
  such as “kanji” and “verb”, so renaming a personal category must not change that
  behavior accidentally.
- Require a valid User relation for vocabulary, practice sessions and progress
  snapshots. Remove the `Practice.userId` default of 1 and implicit user-1 defaults
  from exposed Japanese helpers. Pass a required server actor/user context.
- Give mutable child records explicit ownership where useful: `VerbForm.userId`
  backed by its base vocabulary's owner, and `ActivityVocab.userId` backed by its
  vocabulary or verb-form owner. Add composite owner-aware foreign keys and
  parent uniqueness needed to enforce this in PostgreSQL.
- Enforce that an ActivityVocab references exactly one base word or verb form.
  Validate legacy rows before adding constraints. Keep per-activity status and
  the two-week `lastPracticed` review timer independent for each user's links.
- Use owner-aware vocabulary/category references so a member cannot assign a
  foreign category. Keep shared Activity and VerbFormType definitions read-only;
  ordinary users do not need to create global activity/conjugation definitions.
- Prefer `(userId, sessionKey)` practice replay uniqueness, with owned lookups,
  rather than allowing another account's request key to affect a learner.
  Session JSON snapshots must originate from validated owned words/categories.
- Keep statistics, known-kanji eligibility, averages, snapshots and XP/gold scoped
  to the current user. Calculate rewards on the server, never from submitted totals.

Page access and row ownership are separate checks. A member permitted to practice
cannot read, rate, delete or attach another user's records by changing an ID.

## Starter vocabulary: independent copies

Recommend a versioned snapshot of vocabulary you deliberately publish, not live
access to your personal list. The first pack can contain all the words you approve
from your current list; preview it before publishing to exclude test words or
anything personal. No shared editing, automatic synchronization or later ownership
transfer is implied.

Copy only learning content: English/Japanese text, all readings, read-hiragana
preference, verb-ending type, applicable form content and category mappings.
Preserve valid custom/irregular forms in the published version; validate compatibility
with the current form definitions. Remap every copied ID to new user-owned rows.

New ActivityVocab statuses are **WEAK**, all practice timers are unset, starred
state starts off, and XP/gold starts at zero. Do not copy your practice history,
percentages, progress snapshots, rewards, notes, personal settings or audit trail.
Build only applicable writing links using that new user's known-kanji vocabulary;
verb conjugations remain excluded from kanji writing as they are today.

Publish pack versions immutably so one onboarding cannot mix old and new content.
Changes to your personal list do not change an already-published pack or another
person's copy. Existing learners can edit/delete their own words. Later pack
updates would be a separate optional import with deduplication, not an overwrite.

Initialization must lock/check the user, validate their setup state, and atomically
save the choice, copied rows and completion. Batch inserts inside a bounded
transaction and test the real pack size on the NAS; do not copy it inside an OAuth
callback or one database call per word. Repeated submissions/concurrent tabs must
return the completed result instead of duplicating the list. Failed setup must
roll back and be retryable. If measured pack size exceeds safe request/transaction
limits, constrain the initial pack or design a resumable initialization job before
releasing that size; do not expose partial lists as finished accounts.

“Empty” still gets the minimal personal category setup required by the UI, with no
words, no practice sessions and no borrowed history. Record a genuine zero baseline
at setup if needed by statistics; do not backdate progress. Mark your existing
account initialized without resetting or importing any of its current data.

## Server enforcement, sessions and indirect data leaks

Use database sessions for straightforward per-account/session revocation. Database
sessions still require an active-user/capability lookup at protected server entry
points; authentication alone does not establish current rights. Memoize within a
request if helpful, not across users or with a long-lived permissions cache.
Revocation applies on subsequent authorization checks; already-running operations
need a defined policy, with a transactional recheck/serialization for sensitive
mutations where immediate exclusion is required.

Keep owner-only guards for unconverted modules. Introduce explicit authenticated
actor and permission helpers for converted routes rather than changing
`requireOwner()` globally to mean “anyone signed in.” Redirect members from the
private `/` dashboard to their first allowed page; validate callback URLs against
the app origin and allowed destinations.

The shell must mount only permitted providers. A Japanese-only member must not
start owner inbox polls, owner search requests, finance tiles, global Quick add or
weekly-report fetches in the background. Either omit search initially or build a
separately permission-filtered Japanese-only search later.

Key client memory/filter/query state by authenticated user/session. Abort old
requests and clear stores on logout/account changes so a late response from user A
cannot populate user B's screen. Preserve private/no-store HTTP behavior; do not
introduce authenticated-page caching through the PWA or shared Next.js caches.

Handle existing push devices on shared phones: a previous owner's subscription
can leak notification text even if the next user cannot open its destination.
Bind devices to the correct account/session, disable applicable registrations and
queued deliveries on sign-out/account switching, and require deliberate enrollment
for a new owner. Do not silently reassign an endpoint between users. Already
accepted push delivery cannot be recalled. Keep new members' push/inbox/email
features disabled until their full permission and delivery path is ready.

Existing workers can remain explicitly owner-scoped initially; do not change them
to iterate all users automatically. Future sends must recheck account status,
module permission, recipient/device ownership and consent. Report-email preferences
must not suppress necessary authentication emails or turn on marketing/report mail
just because somebody creates an account.

### Audit changes

Retain historical owner entries. Add a provider-neutral authenticated actor/user
reference and subject ownership to new events, extending the current actor check
constraints without relabeling old records. A member's practice must not create
an audit entry attributed to your GitHub account/user 1.

Administrative events identify both the acting owner and affected member. Your
management/security view can show registration, suspension and permission changes;
ordinary members cannot use the Logs API to browse other users. Define retention
for all users rather than retaining only the current owner stream. Continue
redacting tokens, email bodies, private contact values and practiced word lists.

## Safe migration and release sequence

| Phase                              | Deliverable and release condition                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Ownership inventory             | Map every route, action, query, child reference, worker and cache; back up and rehearse restoration. Identify orphan/ambiguous ownership before any constraint is enabled. Registration stays closed.                       |
| 2. Identity foundation             | Add auth account/session models and user state/permissions. Map your verified permanent GitHub subject to the existing User 1. Test adapter integer compatibility and owner login/recovery. Keep private routes owner-only. |
| 3. Japanese isolation              | Scope every Japanese endpoint/helper, categories, forms, progress, history, rewards and timezone; migrate child ownership/constraints and audit attribution. Test two independent users in a disposable database.           |
| 4. Member shell and administration | Build `/admin/users`, presets/revocation, authorized navigation/providers, own-account settings and safe landing redirects. Unsupported modules cannot be granted.                                                          |
| 5. Setup and starter packs         | Add reviewed/versioned content, empty/copy choice, atomic initialization and replay/concurrency protection. Preserve all existing owner content/IDs/timers.                                                                 |
| 6. Providers and pilot             | Enable Google plus GitHub for a small invited group; verify real redirects, sign-out and phone/PWA account switching. Add Apple only after its requirements and lifecycle are confirmed.                                    |
| 7. Public registration, if desired | Enable open signup only after abuse limits, privacy/deletion policy, backups and isolation tests are ready. Retain a registration kill switch and suspension tools.                                                         |
| 8. Additional modules later        | Convert and verify one complete module at a time, then make its permission grantable. Reuse the same actor/ownership architecture.                                                                                          |

Migrations must preserve owner IDs, task/calendar/financial records, current word
IDs, verb forms, ratings, timers, practices and historical statistics. Backfill
only verified ownership. If categories are already referenced by multiple real
owners, clone/remap for the other owners while preserving the original owner's IDs;
do not assign everything to user 1 by default.

Before adapter login can create new users, explicitly attach the verified GitHub
identity to the existing owner row. Never accidentally create a second “owner” by
email, sign-up order or the first registered account. Reauthenticate existing
sessions during cutover. Rehearse migration/rollback on a restored database and
keep registrations disabled until the owner mapping and isolation checks pass.
Rollback must restore a closed safe login mode, not leave new users authorized
against old owner-scoped code.

## Tests required before inviting anyone

- Test owner, members A/B, signed-out and suspended users. API checks run before
  parsing sensitive input/accessing records; hidden navigation cannot bypass them.
- Forge vocabulary, category, form, ActivityVocab, practice/history IDs and submitted
  user IDs. Reject cross-owner reads, nested writes, deletes and rewards.
- Verify the currently unscoped “today's practice” query and every statistics graph
  return only the authenticated user's records and timezone boundaries.
- Rename/delete member categories without affecting the owner. Verify stable
  Kanji/Verb semantics, all readings, irregular forms and independent review timers.
- Retry/concurrently submit practice and onboarding requests. No duplicate words,
  sessions, XP/gold, baseline snapshots or successful audit entries.
- Ensure copies preserve content while clearing all source progress/history.
  Owner edits/deletes and new published pack versions do not change existing copies.
- Forge role/permission fields; revoke access with an old session still open.
  Test direct APIs, supporting routes, source links and account-link callbacks.
- Test duplicate provider callbacks, absent/private-relay email, same email across
  providers, login versus linking intent, linked-identity conflicts and owner mapping.
- Confirm no member shell requests private-module data. Test logout/account switching
  with late requests, multiple tabs, back navigation and installed PWA behavior.
- Test shared-device push cleanup, worker recipient isolation, subject/actor audit
  attribution and prevention of ordinary-user access to administration/global logs.
- Exercise limits with a realistic pack/user count, failure/retry and a full backup
  restore. No production seed/reset during rehearsal.

## Cost, operations and decisions to make

No separate application container, paid identity platform or database per user is
inherently necessary for a small first release. An adapter/library addition and
provider credentials will be needed; third-party identity services are optional.
Google/GitHub direct OAuth can avoid adding a managed-auth subscription, but this
is not a guarantee that all future provider/hosting/email usage is free. Verify
current provider terms/limits before launch. Apple has the membership cost noted
above; email login adds delivery usage and abuse exposure.

Your NAS must support more sessions, copied word/form/progress rows, database
connections and concurrent practice writes. Set registration and per-user quotas,
rate limits at auth/signup/copy/practice endpoints, pagination and monitoring before
unrestricted signup. OAuth does not prevent someone creating many valid accounts.
Use trusted proxy handling for throttling; do not mistake a browser header for a
verified client address. Add challenges only if abuse makes them worthwhile.

Decide before implementation:

1. Invite-only pilot followed by open registration, or open registration from day one?
2. Google + GitHub first, with Apple/Microsoft later?
3. Which words belong in the first published starter version, and do you have rights
   to redistribute any accompanying kanji images, definitions or other assets?
4. Should members be able to edit/delete their copies? Recommendation: yes.
5. What profile/contact information is retained, and what is the account deletion,
   data-export and backup-retention policy? Explain that restored backups can revive
   deleted accounts unless deletion records are reapplied; test that procedure.
6. How many users and words can the NAS reasonably support, and when should signup
   pause? No capacity promise should be made without measurement.

Publish understandable privacy/support information before sharing publicly. Identify
what provider data is stored and the host administrator's access. Obtain verified
contact details if email delivery is offered; do not treat an OAuth relay or a
client-entered address as permission to send arbitrary messages. Review applicable
privacy obligations for the intended audience before a broad public launch.

The feature is a sensible way to share your Japanese practice. The safe first
milestone is a few people with their own isolated Japanese data and a small owner
management page. Opening your entire personal dashboard is a separate decision,
made module by module after that foundation is proven.
