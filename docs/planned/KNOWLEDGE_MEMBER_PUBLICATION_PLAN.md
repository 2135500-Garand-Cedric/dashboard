# Publishing Knowledge articles for dashboard members

Status: proposal only. No code, database, access rights, or existing articles are
changed by this document. Based on the repository reviewed November 27, 2026.

## Recommendation

Use the **existing Knowledge module** as both your private documentation library
and the place where you write help articles and dashboard news. Add an explicit
publishing action so selected articles become readable by authorized signed-in
members. Everything remains private until you publish it.

This is a good fit: you already have the editor, Markdown rendering, images,
attachments, search, and article links. A second documentation system would
duplicate those features. The important addition is a controlled member view,
not giving members general access to your current private library.

Here, **published means shared with dashboard members who have permission**.
It does not mean public on the internet or published to the proposed portfolio.
No AI integration is required.

## What exists and what must change

| Existing area | Reuse and required change |
| --- | --- |
| `src/app/knowledge` | Keep the existing URLs and owner editing pages; allow a restricted member list/reader at the same entry point. |
| `src/app/knowledge/layout.tsx` | Currently exports the owner-only `ProtectedLayout`. Replace this Knowledge-specific gate with the appropriate owner/member access check; do not loosen `ProtectedLayout` globally. |
| `src/components/knowledge` | Reuse the editor and constrained Markdown renderer; render member-safe article data with a smaller read-only toolbar. |
| `src/lib/knowledge/server.ts` | Current readers query the owner's private articles. Add publication readers rather than exposing these functions unchanged to members. |
| `src/app/api/knowledge` | Current endpoints use `requireOwner`. Preserve write/history/export protections and add explicitly guarded member read endpoints. |
| `KnowledgeArticle` and revisions | Preserve IDs, private ownership, editing, revisions, folder assignments, and work links. |
| `WorkAttachment` and inline images | Reuse secure storage, but introduce publication-specific authorization and an explicit asset allowlist. |
| `src/lib/accounts/capabilities.ts` | Currently supports Japanese capabilities only. Extend the access catalog and validation/UI for the new Knowledge read permission. |
| `SideMenu`, `MemberShell` | Show the existing Knowledge link only to members with the new permission, retaining the current mobile navigation. |

The root layout already selects an owner or member shell. Keep that behavior;
members should get the normal dashboard navigation with only their allowed links.

## Permissions and audience

Add a capability such as `knowledge.published.read`, manageable from the existing
owner user-management page and invitation permission selection. Make it possible
to grant/revoke it for an existing member. Start with explicit grants rather than
silently enabling it for all existing invitations and accounts.

| Visitor | What they can do |
| --- | --- |
| Owner | Manage all existing private Knowledge content; publish, update publication, and unpublish |
| Active, initialized member with permission | List, search, and read current publications; open explicitly included images/files |
| Member without permission | No Knowledge access, including direct URLs and file requests |
| Anonymous, disabled, or expired-session user | No article, search, preview, or asset access |

There is one shared member audience initially. Per-person article sharing,
public access, collaborative editing, comments, and member-authored articles
are outside this proposal. A shared article stays yours; it is not copied into
every member's account or editable by them.

## Owner publishing workflow

Keep normal Save for private edits. Add **Publish to members**, **Update published
version**, and **Unpublish** actions in article details/editor as appropriate.
Show clear states: Private, Published, and Published with unpublished changes.

Before publishing, show a preview of exactly what members will see, including
the images and attachments being shared. Warn about links or assets that will
not be available. You choose whether to include supporting attachments; inline
images referenced by the published body must be reviewed too.

Saving edits to a published article must not expose half-written changes.
Members keep seeing the last published version until you explicitly publish
the update. Unpublishing immediately removes it from new member reads and search.
Archiving the article or any ancestor folder should also unpublish affected
articles atomically; restoring them must not republish automatically. Folder moves
into an archived branch follow the same rule.

News articles can use a small additional **News** type or member-facing label
within the existing article-type system. Help articles can continue using the
existing reference/procedure types. This does not need a separate news module.

## Member reading experience

The Knowledge page shows only published titles, summaries, types, and publication
dates. Use the existing visual conventions, search, and a simple All / Guides /
News filter if useful. Open an article in the existing reader layout with a
Back to Knowledge button and a readable body.

Do not show Create, Edit, Templates, Restore revision, Archive, Publish, work-link
management, or library export controls. Do not return their underlying private
data to the browser and merely hide the controls.

Use initial publish date and latest published update date, formatted in the
reader's account timezone. Private draft edit timestamps are not member updates.
An empty state should say that no articles have been published yet.

Keep your folder tree and tags private initially. Search published titles,
summaries, and bodies; add curated shared folders/tags only if needed later.
This prevents private folder names, counts, and tag suggestions from leaking.

## A small publication model

Add a `KnowledgePublication` related to the existing owner article. It stores the
current published snapshot: title, summary, body, type, source revision, first
published timestamp, last published timestamp, and an active/unpublished state.
Keep the source article ID as the stable article identity and link destination.
The existing article remains the editable source; this is not another authoring
system or another database.

Add publication asset associations for only the included private files/images.
Keep published assets stable while draft edits continue: either retain immutable
file references and block deletion while actively published, or deliberately
replace/remove them through an updated publication. The existing explicit file
deletion behavior cannot be assumed safe for a published version without review.

Publishing validates the expected source revision and atomically writes the
snapshot and asset allowlist. Retries use a stable mutation key; concurrent edits
require review instead of publishing an unexpected version. Add uniqueness and
ownership constraints consistent with the existing composite owner relations.

Retain only the current member publication initially. Existing private article
revisions and audit metadata record the publishing decisions; members do not
gain access to historical drafts. Publishing never changes the article owner.
All existing articles start private after the additive migration. No seed script
or startup action should publish your existing library automatically.

## Preventing indirect private-data exposure

Publication authorization must cover more than the main article response:

- **Article links:** resolve titles/previews only for other active publications.
  Show a generic unavailable reference for private targets, without looking up
  or returning their titles. Validate the published prose itself: a manually
  typed private name is still shared text if you choose to publish it.
- **Backlinks:** calculate from published snapshots only; never reveal private
  articles that happen to link to a published one.
- **Task/project links:** omit private work associations, titles, counts, excerpts,
  and previews from member responses. Publishing an article grants no work access.
- **Images and attachments:** each request must check active session, permission,
  active publication, and explicit asset membership. Never relax all existing
  owner file endpoints just because one article is published.
- **Markdown:** keep the existing constrained renderer. Resolve internal dashboard
  references through member-safe rules; block automatic previews or embeds of
  private routes. Continue rejecting arbitrary HTML and unsafe image sources.
- **Search/export/history:** private global search, ZIP exports, revision history,
  editor pickers, and draft/template endpoints stay owner-only. A future member
  global-search adapter must search published snapshots, not owner article rows.
- **Metadata/errors:** avoid private names in page titles, social metadata,
  counts, filenames of unshared files, or error details. Inaccessible IDs should
  use a consistent not-found response without confirming private article existence.

Use dedicated member projections/endpoints, for example
`/api/knowledge/published` and `/api/knowledge/published/[id]`, with separate
publication asset routes. Branch the protected Knowledge page/reader by actor;
owner APIs keep their current guards. Members must not be able to select the
private projection with a query parameter.

Use no-store responses and clear member content from client state when signing
out or losing permission. Recheck access for every fetch, including audio-free
image/file downloads and range requests if supported. Neither the service worker
nor a shared cache should retain authenticated articles. Revocation prevents
future authorized requests; it cannot erase text, screenshots, or files someone
already obtained legitimately.

## Optional notifications and operational fit

Notifications are not required for the first version. Later, an explicit
**Notify members** publishing option could add a generic inbox notification only
for eligible active users. Avoid notifying everyone on every minor edit and
deduplicate retries. Email is separate and must honor existing user settings.
Unpublished links and revoked users still need normal checks when opening one.

No new container, external service, or paid API is required. Publication records
join the existing database backup; the existing work-file backup must retain all
referenced published originals. Extend isolated restore tests and inventory rules
for publication/file associations. Log publish/unpublish metadata through the
existing audit conventions without duplicating full article bodies in logs.

## Implementation order and acceptance

1. Add the explicit permission and additive publication/asset model; keep all
   existing data private and all IDs/relationships unchanged.
2. Add owner Publish, Preview member view, Update publication, and Unpublish.
3. Add member-safe readers, assets, search, and restricted Knowledge navigation.
4. Add guides/news presentation and responsive reader states.
5. Verify publishing, unpublished draft edits, republishing, unpublishing,
   archive/move behavior, and file lifecycle.
6. Test anonymous/member/owner access, disabled accounts, revoked permissions,
   direct private IDs, linked private articles, backlinks, work associations,
   image/file bypasses, export/history endpoints, cache behavior, concurrent
   edits, retry safety, and backup restoration.

The outcome should be one Knowledge editor for you, with an intentionally
published read-only library for members. No feature tests have been run because
this document describes future implementation only.
