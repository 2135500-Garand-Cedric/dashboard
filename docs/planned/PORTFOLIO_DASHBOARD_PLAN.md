# Public portfolio and private dashboard in one repository

Status: proposal only. No application, infrastructure, DNS, or data changes are
implemented by this document. Dashboard source reviewed November 27, 2026.
The existing PHP portfolio source and its content database were not inspected;
its exact editing features and migration needs must be inventoried before work.

## Opinion and recommendation

Yes, this is possible and a good fit for the way you enjoy developing the
dashboard. You could maintain your portfolio in Next.js, manage its content from
the dashboard, and publish both through the same GitHub repository and CI/CD
process. Normal content edits would not require changing code or rebuilding an
image.

My recommendation is **one repository, two Next.js applications, and two public
addresses**:

- `cedricgarand.com`: the public portfolio, accessible without an account.
- `dashboard.cedricgarand.com`: the existing private dashboard, including an
  owner-only Portfolio administration section.

This gives the WordPress-like experience you described without trying to build
a complete WordPress replacement. The portfolio has its own visual design while
the dashboard provides the editing interface. Sharing a repository does not
require sharing a running application, login cookies, or database permissions.

## What exists today

| Repository area | Current behavior and consequence |
| --- | --- |
| `src/app/page.tsx` | `/` is the private dashboard, with a separate redirect for invited members. Making `/` public would require deliberate routing changes. |
| `src/app/layout.tsx` | Looks up the connected actor and wraps authenticated visitors in the owner or member shell. A portfolio must not acquire this shell just because its visitor is signed in. |
| `src/components/AppShell.tsx` | Contains dashboard navigation, notifications, persistent music, search, settings, and PWA registration. Keep these out of public portfolio pages. |
| `src/lib/auth.ts` | NextAuth with GitHub and optional Google, database sessions, and restricted sign-in. Preserve the existing invitation and ownership rules. |
| `src/lib/require-owner.ts` | Protects owner API operations and rejects cross-origin mutations. Portfolio administration needs the same protection on every read of drafts and every write. |
| `prisma/schema.prisma` | Existing PostgreSQL/Prisma data includes private finance, work, and Japanese records. Portfolio publishing must not expose these records. |
| `Dockerfile.prod`, `docker-compose.prod.yml` | One dashboard image, PostgreSQL, persistent private files, and a notification worker. A second app can join the existing reverse proxy setup. |
| `.github/workflows/` | Builds and publishes the dashboard image to GHCR on `main`; Compose consumes the chosen image. Extend this for a portfolio image rather than assuming the workflow already deploys both. |
| `public/sw.js`, `next.config.ts` | Dashboard-specific service worker, manifest, and response headers. Preserve the dashboard origin and PWA identity. |

Knowledge already supports Markdown editing and private attachments, so some
editor ideas and components may be reusable. Its articles and work files should
remain private; do not turn Knowledge records into publicly accessible pages.

## Domain and application choices

| Option | Advantages | Tradeoffs |
| --- | --- | --- |
| **Two apps, same repo, existing domains — recommended** | Keeps dashboard URLs, OAuth callbacks, and PWA stable; clear public/private boundary; independent releases and credentials | Adds a small portfolio container and another build target |
| One Next.js app serving both domains | Shares dependencies and runtime; can retain current addresses with host-aware routing | Requires explicit host routing, cache separation, and protection against reaching private routes through the public host; shares failures and database privileges |
| One app at `cedricgarand.com` with `/dashboard` | One origin and a familiar public-site/admin pattern | Changes existing private URLs, hardcoded paths, redirects, email/push links, OAuth callbacks, and PWA scope; greater migration work |
| Separate repositories | Maximum project independence | Duplicates maintenance and separates the development workflow you want to share |

Next.js route groups can give public and private pages different layouts, but
they do not create authentication or hostname boundaries. Multiple root layouts
also introduce full page navigation between those layouts. These features are
useful for a single-app alternative, not a reason to move every existing URL.
See the official [layout documentation](https://nextjs.org/docs/app/api-reference/file-conventions/layout).

Keep `www.cedricgarand.com` as a redirect to the chosen canonical portfolio host,
if you use it. Add a Portfolio link in the dashboard and, optionally, a discreet
Dashboard link on the portfolio. A hidden login link is not a security control.

## Proposed repository and hosting structure

Initially, keep the existing dashboard at the repository root to avoid changing
its Docker build context, scripts, tests, and import paths all at once. Add the
public site under `apps/portfolio`, with its own package manifest, lockfile,
Next.js configuration, public assets, tests, and Dockerfile. The root build should
explicitly exclude this app from its TypeScript scanning and Docker context where
appropriate, so it does not accidentally compile or copy the second application.

This is an incremental shared repository setup. A later move to
`apps/dashboard` and shared workspace packages is optional; it is not necessary
to deliver the portfolio. Reuse small content schemas or components deliberately
rather than coupling the portfolio to dashboard server modules.

```text
Visitors -> HTTPS reverse proxy -> portfolio Next.js container
                                  -> published portfolio data and public media

You      -> HTTPS reverse proxy -> dashboard Next.js container
                                  -> authenticated Portfolio administration
                                  -> private content drafts and publishing
```

Both apps can run on the NAS and use the existing PostgreSQL server. Use a
separate logical portfolio database and restricted database roles. The public
runtime should only read published content and must have no access to finance,
work, account/session tables, content drafts, or private uploaded documents.
The dashboard's server-side CMS connection can write portfolio content using a
separate credential. Keep migrations under a clearly designated portfolio
migration configuration; do not accidentally run the existing dashboard migration
history against the portfolio database.

One additional application container is sufficient for the proposed custom CMS;
there is no need for a second PostgreSQL server, Redis, WordPress, or an external
CMS service. Existing workers continue serving their dashboard responsibilities.
If a separate CMS product is chosen instead, reassess its services and maintenance.

## Editing content without editing code

Add an owner-only **Portfolio** area inside the dashboard. Invited Japanese users
receive no portfolio editing rights by default.

The first version should manage:

- Site identity: display name, introduction, profile image, social links, and SEO defaults.
- Pages: slug, title, description, navigation visibility/order, and ordered sections.
- Portfolio projects: title, summary, description, images, technologies, links,
  display order, and publication state.
- Public media: images and an optional public résumé PDF, with descriptive labels
  and image alternative text.

Use a bounded collection of section types: hero, rich text, image with text,
project grid, skills, and contact links. Each section exposes only its meaningful
fields. You can reorder sections and add projects without touching source code.
Adding a completely new visual section type would still require development.

This is a useful middle ground between hardcoded pages and an unrestricted page
builder. Avoid arbitrary scripts, raw HTML, executable templates, plugin systems,
or custom CSS fields in the first version. Markdown or a constrained rich-text
editor is sufficient for descriptions. Do not promise to reproduce the PHP
editor exactly before reviewing how it works.

Prefer email/social links initially. A public contact form can be considered
separately with spam controls and rate limits; it should not grant anonymous
visitors access to existing dashboard email endpoints.

## Minimal content and publishing model

| Entity | Purpose |
| --- | --- |
| `PortfolioSite` | Editable identity, navigation, and SEO defaults |
| `PortfolioPage` | Stable ID, unique slug, title, draft section content, and timestamps |
| `PortfolioProject` | Editable project content and ordering; distinct from private work projects |
| `PortfolioMedia` | File metadata, intended visibility, alt text, and usage references |
| Published snapshots | Explicit public projections of pages, projects, and site settings |

Validate section JSON against supported section schemas. Use a schema version so
future section changes can migrate content intentionally. A public project must
not implicitly reveal a private work project with the same name.

Use **Save draft**, **Preview**, and **Publish** as distinct actions. Saving a draft
must never alter the live page. Preview should initially render inside the
authenticated dashboard, without granting the public app access to drafts.

Publishing validates referenced assets and links, then atomically writes a public
snapshot. Public queries read only published projections using a restricted role;
an ordinary draft flag on an otherwise publicly readable table is insufficient.
Keep the last published version live while a new draft is being edited. Unpublish
explicitly removes public visibility, and slug changes should preserve a redirect
from the former public URL where appropriate.

For the initial small portfolio, request-time server rendering of published
content avoids complex cache invalidation and does not require image rebuilds
for content updates. If caching is introduced, define the refresh behavior and
test that Publish and Unpublish invalidate all affected pages. No cache may
contain authenticated previews or private responses.

Public images belong in dedicated portfolio storage, separate from
`private/finance` and `private/work`. Only published assets should be served
anonymously. Validate actual file types, size, filenames, and image dimensions;
avoid arbitrary SVG/HTML uploads. A résumé is intentionally public only after
you publish it. Removing a public file cannot retract copies already downloaded.

## Authentication, security, and PWA behavior

- Keep `NEXTAUTH_URL` and GitHub/Google callbacks on the dashboard domain. The
  public portfolio needs no sign-in providers or session secrets.
- Keep dashboard cookies host-only; do not broaden their domain to
  `.cedricgarand.com` merely because both websites share a repository. NextAuth
  supports cookie configuration, but shared sign-in is unnecessary here. See
  [NextAuth options](https://next-auth.js.org/configuration/options).
- Reuse server-side owner authorization, origin checks, validation, and audit
  metadata conventions for CMS writes. Hiding the administration menu is insufficient.
- Treat both subdomains as potentially reachable by attackers. Their being
  different origins does not replace CSRF protections; sibling subdomains can
  still be considered same-site by the browser.
- Give the public container only its read credential and portfolio media access.
  Do not copy the dashboard `.env`, OAuth secrets, email credentials, or private
  file volumes into it. Keep server secrets out of `NEXT_PUBLIC_*` variables.
- Keep the existing dashboard service worker, manifest, notification subscriptions,
  and installed-phone experience on `dashboard.cedricgarand.com`. The portfolio
  does not need a PWA or dashboard client providers.
- Public metadata, sitemap, and structured data must include only published
  portfolio pages. Private pages need authentication and suitable no-index/cache
  behavior; robots directives alone do not protect data.

Separate apps reduce accidental coupling, but a repository or shared host
compromise remains relevant. This is a practical boundary, not complete physical
isolation or a reason to skip the existing dashboard authorization tests.

## CI/CD, availability, and cost

Extend the existing workflow to build/test/publish two named images with commit
tags. A portfolio-only change should eventually avoid rebuilding the dashboard;
shared changes should test and build both. A failed portfolio rollout should not
force a dashboard restart. Keep the NAS's pull/update procedure explicit; pushing
an image alone is not evidence that either site has been deployed.

Run portfolio migrations once with a migration credential before updating its
runtime. Preserve backward compatibility during rollout, add a public health
check, and retain the previous image for application rollback. Back up content,
published snapshots, and portfolio files together. Existing backup scripts must
be extended and restore-tested: adding another database or volume does not
automatically put it in the current backup inventory.

There is no required paid CMS subscription or hosting service for this design.
It can use the NAS and domain you already have. Actual costs are your development
and maintenance time, storage, bandwidth, and additional build/runtime resources;
available NAS capacity has not been measured. Load-test image-heavy pages and
optimize media before assuming public traffic has no effect on dashboard speed.

The main tradeoff is shared infrastructure: a NAS outage affects both sites.
Keeping the portfolio independently deployable makes moving it to separate
hosting later possible if uptime or traffic justifies that decision.

## Safe implementation and PHP migration order

1. Inventory the PHP site's URLs, pages, content, media, metadata, editor features,
   and any forms. Export and back up the current site before replacing anything.
2. Confirm public design, section types, CMS scope, and the two-domain decision.
3. Add the portfolio app and isolated storage/access roles without altering live
   dashboard routes or replacing the PHP site.
4. Add owner-only CMS drafts, preview, media, and publishing inside the dashboard.
5. Recreate/import portfolio content and test a staging hostname. Use no-index
   settings and access restrictions as appropriate while staging is unpublished.
6. Add the second image, tests, health checks, backups, and isolated restore checks.
7. Verify public/private boundaries, then switch the apex reverse-proxy target
   from PHP to Next.js. Prepare an old-to-new URL map and permanent redirects.
8. Check canonical URLs, sitemap, metadata, mobile rendering, and existing external
   links. Keep the PHP backup and a documented proxy rollback until stable.

Test anonymous portfolio access, draft/media rejection, owner editing, member
denial, cross-origin writes, HTML injection handling, publication atomicity,
unpublishing, broken media, and database unavailability. Verify that portfolio
requests cannot retrieve dashboard APIs or private files. Confirm that existing
dashboard OAuth, invitations, persistent music, and iPhone push/PWA still work.

## Decision

Proceed as a **shared-repository portfolio and private CMS**, retaining the two
current hostnames. Start with a small set of attractive, editable sections and
project cards. This meets the goal of publishing content without code changes
while preserving the dashboard's existing URLs and daily workflow.
