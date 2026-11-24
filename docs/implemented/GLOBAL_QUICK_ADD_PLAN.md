# Dashboard quick add implementation plan

Status: implemented. No database migration, new dependency, or additional container is required.

The **Quick add** button beside **My Dashboard** lets you start recording a
task, event, expense, Knowledge article, or vocabulary from the main dashboard
without first opening its module. It appears only on the main dashboard page
(`/`), on both desktop and phone.

This develops proposal 3 in [Dashboard improvement ideas](../planned/DASHBOARD_IMPROVEMENT_IDEAS.md),
with the requested dashboard-only placement replacing the original global button.
Reuse the existing creation forms and return to the main dashboard afterward.

## User experience

Pressing **Quick add** opens a small dialog with five choices:

| Action                | What opens                                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| New task              | The existing task creation page.                                           |
| New event             | The existing event form in a centered modal above the main dashboard.      |
| New expense           | The existing expense creation page, including its receipt upload controls. |
| New Knowledge article | The existing article editor.                                               |
| New vocabulary        | The existing vocabulary creation page.                                     |

Each choice has an icon, a short label, and a generous tap target. Use subtle
colored borders consistent with the current buttons. Five choices fit in a simple
list; no search box, tabs, or nested menus are needed.

Opening or closing this menu creates nothing. A record is created only when its
normal form is submitted successfully. Existing New and Add buttons within each
module remain available.

For example, while checking the main dashboard, choose New expense, enter a
purchase and optionally its receipt, then save and return to the dashboard.

## Placement on desktop and phone

Place the button directly next to the **My Dashboard** title in the header rendered
by `src/components/Dashboard.tsx`. Keep the title and button together as one group,
with the existing level/XP/gold information alongside on wider screens.

Keep the proposed **44-pixel minimum height and width** for the tap target. On
desktop, display **+ Quick add** with enough width for the label. On phones, use a
compact plus-only button of at least **44 × 44 pixels**, with the accessible name
**Quick add**, directly beside the title. The progress information can wrap onto
a separate line using the header's responsive layout.

Do not put a trigger in the sidebar, beside the notification bell, in the shared
mobile toolbar, or on any other page. Do not add a floating button. The existing
hamburger and notification bell keep their current positions.

The header must remain compact enough to preserve the desktop dashboard's bounded
tile layout. Fit the title/button group at narrow widths without horizontal
scrolling, covering another control, or making desktop tiles overflow the viewport.
Respect the development banner and existing page spacing.

Use the same centered dialog pattern as other dashboard modals. On a phone it
can occupy most of the available width, with internal scrolling only if needed.
Escape, the close button, and clicking outside close the action menu. Opening it
moves keyboard focus into it; closing it restores focus to the trigger. Do not
add a global keyboard shortcut that would make Quick add accessible on other pages.

## Reuse the existing creation flows

- `src/components/Dashboard.tsx` renders the main dashboard title, progress, and
  tiles. Add one dashboard-local Quick add component beside the title, owning
  the action menu and event modal.
- `src/app/page.tsx` already renders the dashboard inside `ProtectedLayout`.
  Keep that protection. The feature does not need a provider in
  `src/components/AppShell.tsx` or triggers in `src/components/SideMenu.tsx`.
- `src/components/shared/TaskModal.tsx` provides centered dialogs, outside click,
  Escape, and busy-state protection. Reuse it for the menu and event editor.
- `src/app/todos/new/page.tsx` accepts `project`, `stage`, `activityType`,
  `deadline`, `knowledgeArticleId`, and a restricted `returnTo`. Reuse its form
  and extend its return-path allowlist to accept the main dashboard `/`.
- `src/components/calendar/EventForm.tsx` is shared with the calendar modal.
  Host the same editor on the dashboard with the saved timezone, normal loading/errors,
  and a successful-save callback.
- `src/app/finance/expenses/new/page.tsx` uses `NewActivity` and `ExpenseEditor`,
  with statement-specific prefill. Add independent return-path handling while
  retaining statement-import behavior.
- `src/components/knowledge/ArticleEditor.tsx` supports `taskId`, `projectId`,
  and `folder` when creating articles. Reuse these associations, images, and
  templates, and add an explicit return path.
- `src/app/japanese/add-vocabulary/page.tsx` already handles categories, multiple
  readings, verb endings, and automatic conjugation. Add return navigation and
  unsaved-change protection without replacing that workflow.

The vocabulary destination is `/japanese/add-vocabulary`, not a new vocabulary
route. Ordinary event creation currently has no standalone `/events/new` page;
this plan uses the existing form in a dashboard-local modal instead of inventing an unused
link or loading the entire calendar just to open its editor.

Income, transfers, projects, account settings, and category management can remain
in their modules initially. They can be added to the menu later if frequently
needed. Keep the initial menu easy to scan.

## Defaults and associations

Quick add starts from the main dashboard, so it should use ordinary creation
form defaults. Do not infer a project, task, article, folder, selected calendar
day, finance account, or vocabulary category from the last page visited or from
an item merely visible in a dashboard tile.

The user can select a project and stage, activity type, account, category, or
related record in the existing form where supported. Existing contextual creation
buttons inside projects, tasks, Knowledge, and the calendar keep their behavior;
this feature does not replace them or add Quick add to those pages.

Task deadlines remain task fields. Creating a task must not automatically create
an event. Creating an ordinary event must not create a work-session target or
complete a linked task. A project remains a container for tasks.

## Returning after creation

For page-based forms launched through Quick add:

1. Open the existing creation form with an explicit dashboard return destination,
   such as `returnTo=/`.
2. Back or Cancel returns to the main dashboard after the form's unsaved-change
   check.
3. A successful save shows the normal snackbar, clears only that form's completed
   draft, and returns to the main dashboard.

Only forms launched with that explicit dashboard return destination adopt this
behavior. Ordinary module entry points retain their current behavior, including
opening the new financial record or Knowledge article after saving. Statement
imports retain their own matching and return flow.

An event created in the dashboard modal simply closes after saving and leaves
the dashboard visible. Refresh affected dashboard tile data without remounting
the shared music player or resetting unrelated view state.

For this feature, validate Quick add's return destination as the exact local root
path `/`. Existing wider return rules used by other entry points can remain, but
must not accept external URLs, protocol-relative URLs, backslashes, or auth/API
destinations. The task form's current return allowlist does not accept `/` and
needs an explicit extension. Browser history alone is insufficient if a creation
URL was opened directly or the PWA resumed without that history.

Do not include descriptions, notes, financial amounts, or uploaded file information
in navigation URLs. No cross-page context registry is needed.

## Protect unfinished creation forms

Quick add is absent from task, Knowledge, finance, and vocabulary editors and
from Japanese practice. It therefore cannot interrupt those screens directly,
and this feature does not need a global navigation-guard registry or special
practice-session controls.

Creation forms still need protection when the user chooses Back or Cancel after
entering data. Task and Knowledge editors already use `useWorkDraftGuard`; reuse
that behavior rather than showing duplicate confirmations. Add equivalent
protection to the expense and vocabulary forms' new dashboard-return actions.
If the user chooses to stay, preserve text and selected files. If they approve
leaving, run the form's own discard/reset behavior without deleting unrelated
records or drafts.

The event modal keeps the dashboard mounted. Closing a dirty event editor must
use its own discard check. Close the action menu before opening the event editor,
and disable the dashboard trigger while an existing modal is open or a save is
running. Do not overlap native dialogs.

In-memory view state is not recoverable storage after a refresh or PWA restart.
Durable draft recovery remains a separate feature. Browser Back cannot be reliably
cancelled in every App Router case, so avoid claiming universal navigation
interception.

## Small local implementation

Introduce a `DashboardQuickAdd` client component in the main dashboard header.
It owns the menu, event-modal state, and pending action, without a second copy
of each module's editable form. A small typed action list defines labels, icons,
and either a creation route or the event-editor action.

Keep menu opening independent of catalog requests. Load accounts, categories,
projects, stages, templates, and vocabulary types only through the selected form's
normal loader. Reuse its loading, retry, validation, duplicate, and success states.

Add no global provider or creation endpoint. Each form uses its existing protected
API, transaction boundaries, duplicate prevention, revision rules, and replay
handling. Do not retry an uncertain financial save with a fresh request key.
Use the saved dashboard timezone for date defaults and existing decimal/currency
rules for finance.

This foundation needs no database migration, background worker, extra container,
or dependency. New records remain in the existing canonical tables. The shared
app shell, sidebar, notification bell, and music player keep their current roles.

## Authentication and privacy

Render Quick add only on the owner-protected main dashboard. All destination pages,
association lookups, and mutation APIs must independently enforce the existing
GitHub-owner rules; the menu is not an authorization boundary.

Treat selected IDs and return paths as untrusted input. Existing API ownership
checks remain mandatory for every association selected in the normal forms.
Do not log entered content, financial details, uploaded filenames, or full creation
URLs. Do not cache private forms in the PWA service worker or promise offline saving.

## Implementation order

### Phase 1 Dashboard button and menu

Add the local component beside **My Dashboard**, with the labeled desktop button,
minimum 44 × 44 pixel phone button, five creation choices, and the existing
`EventForm` in a centered modal. Reuse the existing routes for the other choices.

Acceptance: the trigger appears only on `/`, stays beside the title at desktop
and phone sizes, creates nothing by opening, closes correctly, and preserves the
existing dashboard tile layout and music playback.

### Phase 2 Dashboard return navigation

Integrate the explicit dashboard return destination with task, expense, Knowledge,
and vocabulary creation. Add required Back/Cancel guards, preserve each module's
normal entry behavior, and refresh affected dashboard tiles after event creation.
Do not add cross-page context registration or automatic associations.

Acceptance: all five actions return to the main dashboard after saving or approved
cancellation; unfinished forms can be kept; ordinary module creation and statement
matching behave as before.

### Phase 3 Verification and documentation

Test desktop and phone flows with mocked financial mutations or disposable data.
Document the local action list and supported dashboard return parameter. No
existing records need migration or replacement.

Acceptance checks:

- Trigger visible beside the dashboard title only; absent from sidebar, shared
  mobile controls, all other pages, and any global keyboard action.
- Minimum 44-pixel tap target, narrow-screen title layout, development banner,
  safe areas, and no extra desktop dashboard scrolling.
- Menu opening, Escape, outside click, keyboard access, focus restoration, and
  no overlapping event/modal dialogs.
- All five creation flows retain their normal validation and snackbar feedback;
  financial retries do not create duplicate money movements.
- Dirty creation forms: staying preserves input; approved exit uses that form's
  own discard rules and returns to `/`.
- Valid dashboard returns, direct visits without history, malformed or external
  return URLs, and authentication expiry without private data exposure.
- No stale project, task, article, folder, account, or category inferred from a
  previously visited page or dashboard tile.
- Events use the saved timezone and do not implicitly create tasks, deadlines,
  or work sessions. Relevant tiles refresh without resetting music.
- Anonymous/non-owner access is rejected by underlying pages and APIs.
- No production writes or real financial transactions during automated checks.

## Deferred additions

Keep income, transfers, projects, task notes, receipt-only capture shortcuts,
recent actions, configurable favorites, keyboard shortcuts, global search,
offline creation, and durable cross-device drafts out of the initial feature.
Quick add access from other pages and cross-page context suggestions are also
outside this dashboard-only plan.

## Implementation notes

`src/components/DashboardQuickAdd.tsx` owns the local menu and lazy-loaded event
editor. `src/components/Dashboard.tsx` renders its trigger beside the title. It
is not mounted in the shared shell or navigation. The existing shell and music
player remain mounted when navigating to and from the creation pages.

The four page actions pass `returnTo=%2F`. `dashboardReturn` in
`src/lib/dashboard-quick-add.ts` accepts only the exact `/` destination; unknown
or unsafe values preserve the module's usual behavior. Its `taskReturn` helper
also validates the task form's existing contextual return paths after URL
normalization. Quick add supplies no project, article, task, or finance prefill.

Expense creation receives the validated return as a server-to-client prop.
Knowledge and vocabulary creation read the marker within their existing Suspense
boundaries. The Knowledge dashboard draft has its own in-memory key. Successful
saves clear the active draft and return to `/`; ordinary vocabulary capture still
clears the form and stays on the vocabulary entry page.

Task and Knowledge exits reuse their existing guards. Dashboard expense and
vocabulary exits also use `useWorkDraftGuard`, including selected expense files.
The event modal delegates all close attempts to `EventForm`'s own cancel action,
so Escape and outside click cannot bypass its dirty check. The action menu closes
before the event dialog opens, and the trigger is disabled while another native
dialog is open or an event save is running.

Event saves increment the calendar tile's refresh token. This reloads its data
without resetting other tiles or the music player. Existing protected pages and
mutation APIs remain the authorization boundary; no new API was added.

Verification:

- All 192 unit tests passed, including exact dashboard returns and unsafe task
  return values with traversal, malformed encoding, and external destinations.
- `tests/dashboard-quick-add.browser.mjs` passed at desktop and 390/320-pixel phone
  widths. It covers all five mocked saves, dirty exits, retries, focus restoration,
  outside click, dashboard-only placement, minimum tap dimensions, tile refresh,
  normal module behavior, unsafe return fallbacks, and preserved shell/player DOM.
- The production Docker image build and strict TypeScript validation passed.
  Targeted ESLint found no errors and one
  pre-existing missing-dependency warning in the vocabulary category loader.
- Automated creation requests were mocked; no real financial records or other
  example data were inserted for these checks. No production deployment occurred.

Run the browser check against the development app with Playwright installed:

```bash
RUN_QUICK_ADD_BROWSER_TEST=1 node --test tests/dashboard-quick-add.browser.mjs
```

The browser fixture uses the local development authentication secret and intercepts
all creation requests. Keep that fixture out of production execution.
