# Simple notepad

Status: proposal only. No application code or database changes are implemented
by this document. Based on the repository reviewed November 27, 2026.

## Opinion and purpose

This is a good addition: a small place to capture information before deciding
whether it needs any action. An idea, a phone number someone mentioned, or a
detail you want to remember should be easy to save without creating a task or
writing a full Knowledge article.

Keep it deliberately simple. My recommendation is **one Notepad page containing
multiple short notes**, rather than one endless document. Each note can be
revisited, edited, or deleted independently, and searching stays useful as the
collection grows. A title should never be required.

| Place | What belongs there |
| --- | --- |
| Notepad | Quick information, thoughts, reminders without a commitment to act |
| Tasks | Something you have decided must be completed |
| Knowledge | Reusable documentation, procedures, and troubleshooting references |
| Task/project notes | Updates that already belong to a particular work record |
| Proposed daily journal | Personal memories organized around a day |

The existing Knowledge module already provides folders, Markdown, attachments,
templates, revisions, and work links. Those are valuable for documentation but
would make this capture flow unnecessarily heavy. The journal is still a separate
proposal; Notepad would not require its recording or transcription features.

## Everyday experience

Add **Notepad**, with a note/pencil icon, to the dashboard sidebar at `/notepad`.
Use the existing dark theme, buttons, snackbar, and mobile navigation conventions.

At the top, show a multiline text field with a simple prompt such as “Something
to remember…” and a **Save note** button. No modal, mandatory title, category,
deadline, status, or project selection is necessary to write a note.

Below it, show saved notes, newest updated first. Each card displays the text,
a small readable timestamp, and Edit and Delete actions. Preserve line breaks.
Long notes can have a short preview with an Expand control, so one large note
does not dominate the page. Search should match the full saved text even when
the preview is collapsed.

Examples:

- “Ask Dad which weekend works for the visit.”
- “The printer stopped failing after reconnecting the USB cable.”
- “Idea: try a language exchange at the library.”

Use a responsive two- or three-column card layout on a computer and a single
column on a phone. Let the page scroll normally. Editing replaces the selected
card's text with an editor containing Save and Cancel; deleting uses the existing
centered confirmation modal that closes when clicking outside.

Provide one search input and a useful empty state. Folders, tags, pinning,
archive views, sorting controls, and separate note detail pages can wait until
actual use shows a need for them.

## Saving and reliability

Start with explicit saves rather than autosaving every keystroke. Show a saving
state, disable duplicate submissions, and announce success or failure through
the snackbar. Never clear the editor until the server confirms the save.
Reject blank or whitespace-only notes, with a reasonable initial limit of
10,000 characters per note.

Keep an unsaved draft during internal navigation using the existing persistent
client-provider approach. Warn before discarding edits and when leaving the app
with unsaved changes. Be clear that an in-memory draft does not survive a browser
restart; offline editing and persistent browser storage are outside the first
version. Avoid silently storing private notes in shared-device local storage.

Use a stable client mutation ID for creation retries, so a lost response does
not create the same note twice. Use a version check for edits and deletes; if
another tab changed the note, preserve the local text and offer to reload instead
of overwriting it silently.

## Data model and implementation fit

Add one small Prisma model, `NotepadNote`:

| Field | Purpose |
| --- | --- |
| `id` | Stable note identifier |
| `userId` | Required owning user, related to `User` |
| `body` | Plain text content; no required title |
| `createdAt` / `updatedAt` | UTC instants using `Timestamptz(3)` |
| `version` | Optimistic concurrency control |
| `creationKey` | Stable creation retry key, unique within the user |

Index by owner, update timestamp, and ID for stable paginated listing. Derive
the card preview from the body rather than saving a separate summary. Format
timestamps using the connected user's account timezone.

Use a small server service and `/api/notepad` plus `/api/notepad/[id]` endpoints
for listing, creation, editing, and deletion. Validate input, bound list/search
requests, and render content as escaped plain text, never arbitrary HTML.
No new package, external service, container, file volume, or paid API is needed.

Keep the initial rollout owner-only, consistent with Knowledge and private work
pages today. Protect both the page and every API operation using the existing
authorization and mutation-protection conventions. Scope every database lookup
and write to the authenticated owner; a note ID alone must never grant access.
Store actual user ownership rather than introducing another implicit user-ID-1
assumption. Invited users should not receive Notepad access automatically. If
access is offered later, introduce an explicit permission and keep notes private
to each user, including search results and client draft state.

The existing whole-database backup will include the new table once migrated;
there are no uploaded originals to back up. Verify its restoration in the next
isolated backup rehearsal. Activity logging should follow existing conventions
for mutation metadata, without copying note bodies into logs.

## Links to the rest of the dashboard

The sidebar is enough for the first version. Notes do not create tasks, calendar
events, notifications, or Knowledge articles automatically.

Later, if useful, add a quick-add entry and a permission-scoped global search
adapter. An explicit “Create task from note” or “Create Knowledge article” action
could prefill an existing creation form. Preserve the original note until the
new record is saved and the user chooses whether to remove it. These integrations
are optional follow-ups, not prerequisites for a usable notepad.

## Suggested implementation order and acceptance

1. Add the additive note table and migration, preserving existing records.
2. Implement authorized CRUD, validation, retry protection, and version checks.
3. Build the responsive capture/list/edit page and sidebar entry.
4. Add bounded search, loading/empty/error states, and draft protection.
5. Verify creation, editing, deletion, search, duplicate retries, conflicting tabs,
   failed saves, mobile layout, anonymous rejection, and member/cross-user denial.

The result should let you open a page, type a thought, save it, and find it later
with very little ceremony. Keep richer organization and integrations out of the
initial implementation.
