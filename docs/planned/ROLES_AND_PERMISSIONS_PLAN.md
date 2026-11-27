# Configurable roles and access throughout the dashboard

Status: proposal only. No code, migrations, permissions, or user data are changed
by this document. Repository reviewed November 27, 2026. This is an architecture
and implementation plan, not evidence of a completed security audit.

## Recommendation and boundaries

Yes, this is possible and a useful next step for the invited-user dashboard.
Create named roles such as Japanese learner, Reader, or Contributor, assign
permissions to each role, then assign a role to each member. Navigation and
controls reflect those permissions, and the server independently enforces them.

Start with **one configurable access role per member**, no role inheritance, and
no individual permission exceptions. This makes effective access understandable.
You can create as many combinations as needed without building a complicated
allow/deny system. Only you, the protected system owner, manage roles initially.
Do not add a delegatable full-administrator capability in the first release.

There are three separate questions for every operation:

1. **Who is calling?** A current authenticated, active account.
2. **What may they do?** The capabilities of their assigned role.
3. **Which data may they do it to?** Their own records, explicitly published
   material, or a deliberately shared resource.

A View finance checkbox must not expose your finances to another account. Opening
a page and authorizing access to its records are different decisions. The goal
is configurable access across all modules, delivered only after each module's
data boundary is ready.

## Current foundation and limitations

| Area | Current implementation |
| --- | --- |
| Identity | GitHub and optionally Google; permanent provider subjects, invite-only account creation, explicit account linking |
| Sessions | Database sessions in `AuthSession`; active users and expiration are checked server-side |
| System role | `User.role` distinguishes OWNER and MEMBER; owner checks also bind to the existing permanent owner account |
| Permissions | `UserPermission` directly grants one of five Japanese capabilities to a member |
| Access helpers | `src/lib/accounts/access.ts` contains `getActor`, `hasPermission`, and `requirePermission`; owner page/API helpers remain separate |
| Administration | `src/app/api/admin/users/route.ts` is owner-only and supports invitations, direct member permission updates, suspension, and session revocation |
| Account creation | `src/lib/accounts/identity.ts` creates MEMBER accounts with the Japanese preset; permissions are chosen by server code |
| Navigation | `SideMenu` filters a hardcoded owner/member menu; `AppShell` and `MemberShell` mount different providers |
| Japanese data | Vocabulary, forms, categories, practice, and history are user-scoped |
| Other modules | Many APIs/services intentionally remain owner-only; work uses `WORK_USER_ID`, and finance still assumes owner data |
| Readiness gate | `requirePermission` currently requires Japanese initialization for every supported capability |

Relevant sources: `prisma/schema.prisma`, `src/lib/accounts/*`,
`src/lib/require-owner.ts`, `src/components/ProtectedLayout.tsx`,
`src/components/SideMenu.tsx`, `src/components/MemberShell.tsx`,
`src/lib/work-management/server.ts`, and `src/lib/finance/server.ts`.

This requires more than replacing `requireOwner` with a permission check. An
endpoint that still queries user 1 would return the owner's records to anyone
given that capability. Do not enable such a grant until its service and related
records have been adapted and tested.

## Permission catalog and user experience

Keep a **code-defined capability catalog**, grouped into clear modules. The
owner creates roles by selecting supported capabilities; the UI cannot invent
arbitrary capability strings. New capabilities are ungranted by default. Avoid
wildcard grants such as `finance.*` that silently include future features.

| Module | Example capabilities; exact names finalized during route inventory |
| --- | --- |
| Dashboard | Read permitted summary tiles; see only data accessible in the underlying modules |
| Japanese | Vocabulary read/manage, practice, statistics read, history read; preserve current behavior |
| Work | Task read/create/update/delete/archive, notes add, relationships manage, work sessions schedule |
| Projects | Read/create/update/archive; stages and memberships require explicit appropriate actions |
| Calendar | Read/create/update/delete events; recurrence changes use the underlying event/task permissions |
| Knowledge | Published read, private-own read/create/update/archive, publish; owner-only publication initially |
| Finance | Separate income, expenses, transfers, accounts, and category read/write actions; imports, statement matching, exports, and documents separately controlled |
| People | Read/manage within the authorized personal scope or future shared scope |
| Reports | Weekly/statistics views gated by access to the underlying data sections |
| Notifications | Read/update one's inbox and manage one's own delivery preferences |
| Audit logs | Separate access to authorized activity metadata; never implied by general dashboard access |
| Settings | Own profile/timezone versus module settings versus system administration |
| Future AI/portfolio | Explicit usage, authoring, publishing, and spending-related rights when implemented |

Use View, Create, Edit, Delete/Archive checkboxes and a few meaningful operation
checkboxes, not a checkbox for every component. A role can allow reading without
creation or editing. Export/download rights must not be hidden inside a broad
view grant when they intentionally differ.

Define dependencies in the catalog, for example Edit task requires Read task.
The role editor can automatically select required prerequisites and explain why;
the server must validate the resulting combination too. Combined operations need
all relevant permissions, not merely the permission for the page where they start.

The Settings user-management area gains **Users**, **Roles**, and **Invitations**:

- Role tiles show name, description, assigned-member count, and grouped rights.
- Create/Edit role uses a clear module matrix, with a summary before saving.
- User details show their assigned role and effective permissions read-only,
  alongside suspension and session controls.
- Invitations specify the role granted on acceptance.
- An **Access preview** shows which navigation/actions a role exposes, without
  impersonating another user's session or reading their data.

Block deletion of an assigned role until users are reassigned. Show the affected
users when changing a role. Role names are display text, never authority: naming
a role Owner or Admin must not give it system-owner privileges; reserve confusing
system names in the editor.

## Data access: own records first, sharing explicitly

For the initial broad rollout, permissions apply to **the member's own data**.
Keep existing owner records and their IDs under the owner. Do not copy the owner's
finance, work, contacts, or private Knowledge library into new accounts.

The [Knowledge publication plan](KNOWLEDGE_MEMBER_PUBLICATION_PLAN.md) is an
explicit exception: a member can read selected owner-published snapshots without
obtaining access to the owner's drafts, work links, or private attachments.

Before opening a module to members, convert services to receive a trusted actor
and resolved data scope. Scope reads, counts, search, aggregates, writes, files,
and foreign-key lookups consistently. Reuse composite ownership constraints where
available, extending them only where necessary. A task must not point to another
user's project, person, attachment, or prerequisite just because its ID exists.

Calendar entries derived from deadlines, follow-ups, project dates, and work
sessions must inherit the source record's accessibility. General calendar access
does not authorize reading hidden task titles or changing a deadline. Financial
transfers require both accounts to be in scope; linking an import, reimbursement,
or document must validate every affected record.

If the actual goal later includes letting others help with **your** projects or
finances, add explicit sharing or workspace membership with resource/action
grants. That needs a distinct design and cannot be inferred from a role label.
Do not introduce an owner-wide "view everything" toggle as a shortcut. Roles
describe capabilities, while resource grants identify whose data is shared.

All existing pages should eventually be supported through this permission system.
Sensitive system administration remains reserved to the owner, and unsupported
module grants stay unavailable until scoped implementations are ready. Report
this as staged delivery, not as completed access support for every module.

## Minimal schema changes

| Change | Purpose |
| --- | --- |
| `AccessRole` | Stable ID, unique normalized name, description, revision, timestamps, and optional built-in marker |
| `AccessRoleCapability` | Composite unique role ID/capability rows using the server catalog |
| `User.accessRoleId` | One role assignment per member; retain existing OWNER/MEMBER system distinction separately |
| `UserInvitation.accessRoleId` | Server-selected role association; protected from invitee changes |
| Authorization versioning | A global role-policy version and/or role/user access revisions for safe cache invalidation and write checks |

Do not convert editable role IDs into `User.role` strings. The existing protected
owner identity is a system trust anchor, not a configurable access role that
anyone can assign through the administration UI. Keep owner recovery controls
and permanent account binding centralized; do not scatter new `userId === 1`
checks throughout the app.

The role catalog is application code, not executable permissions stored as SQL
or JavaScript in a role. Foreign keys and uniqueness protect integrity but do
not replace authorization. The existing application database credential is a
trusted backend credential; never expose direct database writes to users.

## Protecting registration, role changes, and every API

### Invitation and signup must not accept privilege choices

The owner creates a hashed, expiring, single-use invitation with an access role.
Acceptance resolves that role **from the invitation row on the server** and uses
an atomic consume/create transaction. The submitted profile can contain only
allowed fields such as display name, timezone, and vocabulary starter choice.

Reject unexpected fields such as `role`, `roleId`, `accessRoleId`, `permissions`,
`active`, `userId`, `isAdmin`, or nested permission/role updates. Never spread
request JSON into Prisma create/update data. An OAuth profile, callback parameter,
URL query, browser storage value, or modified request body cannot choose access.

At acceptance, require the associated role to remain valid. Show administrators
that role edits affect pending invitations; grant the current server-side role
definition, not a stale client copy. Revoked/deleted roles must not trigger a
fallback to a more powerful role. Replaying an accepted invitation cannot create
another account or change the accepted user's role.

Keep provider-subject identity checks, account-link intent validation, and the
current no-automatic-email-merging policy. A verified email address does not
authorize promotion or account takeover.

### Role management is a separate privileged boundary

Role CRUD, assignment, invitation role selection, and security settings remain
owner-only on the server. Members cannot change their own role, another user's
role, role capabilities, or the owner identity through profile updates, bulk
endpoints, alternate HTTP methods, nested objects, or account linking.

Require recent authentication for access-control changes, reusing the existing
recent-login foundation where suitable. Apply origin/CSRF checks, input limits,
expected revisions, and atomic audit writes. Log actor, affected role/user,
old/new grants, and operation outcome without recording tokens or credentials.

If delegated user administration is introduced later, explicitly limit which
roles/capabilities it can grant and which users it may manage. A general Edit
users permission must never implicitly allow editing the role that grants its
own privileges. Avoid that delegation in the initial implementation.

### Authorization follows the operation, not the browser UI

Build a reusable policy interface that resolves the authenticated actor, current
role, requested capability, data scope, and resource. Deny absent/unknown grants
by default. Guards belong in HTTP handlers and authorized domain entry points,
including server actions, file/download routes, exports, and background jobs.

The navigation and buttons consume the same capability catalog for consistency,
but their visibility is only a convenience. Checking a page layout or middleware
does not protect APIs invoked directly. Include GET, POST, PATCH, PUT, DELETE,
bulk routes, preview routes, signed-file alternatives, and any supported HEAD or
range behavior in the route inventory. Document intentionally public endpoints
such as authentication callbacks explicitly rather than applying a blanket guard
that breaks sign-in or the proposed public portfolio.

Use per-operation input schemas and explicitly allowed writable fields. Row IDs,
body owner IDs, and linked-resource IDs are untrusted. Reject requests that attempt
to modify properties beyond the granted operation. For example, permission to add
a note does not authorize its optional task-status change without task-edit access.

Follow the principles in [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
and [OWASP mass-assignment guidance](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html):
default denial, checks on every request, resource-aware decisions, and explicit
input allowlists. These are design requirements, not claims that current code
has already passed a complete review.

## Sessions, revocation, summaries, and background work

Resolve effective role rights from trusted database state on each request,
initially with request-local reuse to avoid duplicate queries. Do not trust old
capability arrays in client session data as the authority. Shared caches, if
introduced later, must bind user/role/policy revisions and invalidate on changes.

A demotion, suspension, or grant removal must affect subsequent requests without
waiting for a long-lived session to expire. Access-control mutations and sensitive
domain writes should revalidate authorization inside a transaction and serialize
against policy changes where necessary; otherwise a write authorized before a
revocation can still commit afterward. Define and test the boundary deliberately.
Do not claim the system can retract data already returned or cancel all external
requests already dispatched before revocation.

Queued imports, reports, AI actions, emails, and push notifications need explicit
requester and data-owner context. Recheck permission when executing/delivering,
not just when queued. System maintenance jobs use narrowly defined service
operations instead of impersonating the owner for arbitrary writes.

Dashboard tiles, quick add, global search, weekly reports, notifications, and
related-record counts must aggregate only permitted data. Missing access means
the section is omitted or marked unavailable, not calculated from the owner's
records or returned privately then hidden. Avoid misleading combined totals.

Expand the member shell only with providers needed for allowed features. Clear
protected client data on sign-out, account switch, or revocation and avoid shared
HTTP/PWA caching of private responses. Every download still checks access even
if its URL was obtained before demotion.

Separate general account readiness from Japanese setup: a future finance-only
member should not need to initialize vocabulary first. Keep Japanese initialization
checks for Japanese operations; migrate existing readiness without creating an
onboarding bypass or reopening public registration.

## Safe migration and rollout

1. Inventory all page/API/service entry points and record their required action,
   data scope, input schema, dependent resources, and tests. Include indirect
   loaders, files, search, exports, reports, workers, and future plan integrations.
2. Add roles and assignments without removing current permission storage or
   altering domain record ownership. Keep old guards during this preparatory step.
3. Create the Japanese learner role and distinct compatibility roles for existing
   effective permission combinations. Preserve suspended users, owner access,
   sessions/identities, pending invitations, and unfinished onboarding states.
4. Backfill each member to an equivalent role and pending invitations to their
   existing Japanese preset; compare effective access before and after. No
   migration step may silently add access.
5. Switch effective authorization atomically to role grants, with verified
   compatibility adapters for existing Japanese names. Avoid indefinitely
   unioning old direct grants with roles, which would defeat later revocations.
6. Deliver role administration and tests while other modules remain owner-only.
7. Convert modules in small batches: published Knowledge, own work/projects and
   calendar, own finance, then cross-module summaries/settings/search. For each,
   complete ownership/schema checks and deny-by-default endpoint tests before
   enabling its grants in the role editor.
8. Remove direct permission compatibility code/table only after all callers and
   jobs use the new authority. Preserve all user IDs, domain IDs, and relationships.

Rehearse on an isolated full restore and compare owner records and foreign keys.
Back up before deployment, use additive migrations initially, and document a
compatible rollback image/schema boundary. Restoring an old database backup can
restore old grants; review access and invalidate sessions before reopening it.
No production data edits are authorized by this planning document.

## Verification and completion criteria

Automate the permission matrix across owner, allowed member, read-only member,
member without grants, suspended user, expired session, and anonymous caller.
Use at least two members plus the owner to test horizontal data separation.

Include tests for:

- Forged role/permission/owner fields during signup, onboarding, profile updates,
  OAuth flows, nested/bulk requests, and invitation replay/concurrent acceptance.
- Self-promotion, role-name spoofing, owner demotion, deleted roles, invalid
  capability names, missing prerequisites, and stale role-editor submissions.
- Direct URL/API access when menus are hidden; forbidden methods and alternate
  exports, previews, originals, images, and download paths.
- Cross-user reads/writes and foreign-key linkage, search snippets, autocomplete,
  aggregates, calendar projections, notifications, and logs.
- Immediate next-request demotion, active sessions, concurrent in-flight writes,
  queued jobs, client account switching, and missing policy/database failures.
- Read versus create/edit/delete/archive, composite operations, and protection
  of system settings and all role-management endpoints.
- Equivalent migrated access, unchanged owner records, backup restore, and the
  existing Japanese, finance, work, and session regression suites.

Run these in CI before publishing images, with database-dependent security tests
on disposable services. A route inventory/coverage check should fail when a new
endpoint is added without an explicit public or protected policy declaration;
behavioral tests still prove that the declared guard and data scope actually work.

Keep a coverage ledger per module. The project is complete only when every
in-scope operation has an explicit policy, actual resource checks, and executed
tests; a permission matrix in the UI alone is not completion. No new tests or
security probes were executed for this proposal.

## Fit with the other plans

This extends [MULTI_USER_ACCESS_PLAN.md](../implemented/MULTI_USER_ACCESS_PLAN.md)
and becomes the common authorization foundation for
[member Knowledge publications](KNOWLEDGE_MEMBER_PUBLICATION_PLAN.md),
[AI actions](AI_ASSISTANT_PLAN.md), and future modules. Preserve their narrower
defaults: an AI role still needs explicit tool/data rights and spending limits;
portfolio editing remains separate from anonymous published-site reads.

No paid identity service, extra container, or separate permission server is
needed. The substantial work is auditing and adapting every domain's data scope,
not storing a few role rows. Implement this progressively with a single policy
catalog and small, verified module releases.
