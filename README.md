This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Backfill conditional verb forms

After deploying an image containing the conditional conjugations and backfill script, preview missing forms in production:

```bash
docker compose -f docker-compose.prod.yml exec -T dashboard npm run backfill:verb-conditionals -- --dry-run
```

Add the missing forms and practice records:

```bash
docker compose -f docker-compose.prod.yml exec -T dashboard npm run backfill:verb-conditionals -- --apply
```

Run the dry run again to verify that no forms or practice records are missing. The command preserves existing conjugations and practice statuses and can be rerun safely. New practice records start at `WEAK`. Verbs without a supported verb type or valid spelling/reading are listed as skipped; correct those entries and rerun. Exit code 2 means some verbs were skipped; exit code 1 means the command failed. Each verb is saved in its own transaction, so rerunning also completes a partially finished backfill.

The command defaults to a dry run. For development, replace `docker-compose.prod.yml` with `docker-compose.dev.yml`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Kanji writing selection and percentages

With no category selected, Kanji writing uses vocabulary from any category. A word must contain at least one known kanji and every remaining character must be another known kanji, hiragana, or katakana (including the long-vowel mark). Known kanji are the individual kanji characters found in the user's Kanji-category vocabulary. Explicit category and starred selections narrow that same eligible pool. Only dictionary forms are included; conjugated forms never enter Kanji writing. Answers show an animation for each kanji separately, with kana alongside it.

Each applicable exercise contributes PERFECT = 1, GOOD = 0.5, or WEAK = 0. Missing exercise records count as WEAK. A vocabulary item's percentage is its total score divided by the number of applicable exercises, multiplied by 100. Eligible base words include Kanji writing (five exercises with the current setup); other base words and all conjugated verb forms exclude it (four exercises). The vocabulary list's verb percentage averages the dictionary-form percentage and every saved conjugated-form percentage equally. The word detail page shows the dictionary-form percentage and each conjugated form separately. Exercise progress averages the eligible entries for that exercise; overall progress averages all applicable word/form/exercise scores. Existing writing statuses on conjugated forms are ignored.

Starting Kanji writing creates any missing writing records at WEAK while preserving existing progress. The development seed includes known characters plus more than ten compound/mixed-kana examples across Vocabulary and Verb categories. Select Kanji writing, leave categories unchecked, and choose ten words to try them.

## Japanese Statistics

The sidebar's Japanese Statistics page has a Month view for the last 30 Toronto calendar days and a Year view for the latest 12 calendar months, including the current month. Year bars sum each month's counts. The average graph uses the closing value on the last day of each completed month, carrying forward the latest recorded snapshot; the current month uses its latest available value. Practice charts count attempts (including repeated words), split into PERFECT, GOOD, and WEAK. Added-word bars count surviving dictionary entries by their addition date and use their current worst status for colors. The category chart counts each dictionary entry once.

Daily average history uses the same calculation as the Vocabulary List's Average. Snapshots update after practice sessions, vocabulary additions/edits/deletions, category renames, and statistics-page visits. The last recorded value carries forward on days without changes; dates before the first snapshot stay blank because earlier averages cannot be reconstructed from current statuses. The new JapaneseProgressSnapshot migration runs through the existing deployment migration command.

Dashboard daily totals and statistics buckets use America/Toronto, including daylight saving transitions, independently of the server timezone.

Development statistics vocabulary uses 56 distinct noun entries checked against [JLPT Sensei's N5 list](https://jlptsensei.com/jlpt-n5-nouns-vocabulary-list/) and [N4 list](https://jlptsensei.com/jlpt-n4-nouns-vocabulary-list/). Readings, meanings, study levels, and source URLs are stored in `prisma/statistics-vocabulary.json`. The seed matches Japanese spelling plus reading, preserves existing progress, and removes the old dated statistics-demo clones. Practice totals and past average snapshots remain illustrative development data.

## Practice reviews and history

Rating the final word opens a practice overview. **Okay** commits the ratings, practice session, and progress snapshot in one transaction. The overview includes the activity, status groups with word spellings/readings, total words, selected categories (or no category filter), starred filter, and elapsed time from pressing Start Practice to rating the final word. Reading the overview and time spent reviewing it do not extend that duration. Failed saves retain the overview for retry; a unique session key prevents duplicate sessions if the response is lost.

The average uses the same full vocabulary-list calculation described above, including verb-form averages and Kanji writing eligibility. The review previews the effect without changing saved ratings. On Okay, before/after averages are computed against the current database state inside the save transaction and stored permanently. Average change is shown in percentage points: for example, 40% to 42% is +2 percentage points.

Click a Vocabulary practice or Kanji writing practice bar in Japanese Statistics to browse its sessions. Month view opens the selected Toronto calendar day; Year view opens the selected month, grouped by day. Accessible date links are available under each practice chart. Selecting a session opens the same overview using saved word/category/activity snapshots, so later edits or vocabulary deletion do not rewrite its history. Opening old results does not save them again.

The `20261105150000_add_practice_session_details` migration adds these details to Practice while preserving older records. Older practices display their existing totals with missing details marked as not recorded; their original words, durations, and average changes cannot be recovered. Apply the migration through the normal production deployment (`prisma migrate deploy`); production Compose already runs it on startup. Unit coverage: `node --test tests/practice-sessions.test.mjs`. Database coverage: `RUN_PRACTICE_SESSION_DB_TEST=1 node tests/practice-sessions.integration.mjs` inside the development container; fixtures are rolled back.

Optional browser layout coverage: `RUN_PRACTICE_BROWSER_TEST=1 node tests/practice-overview.browser.mjs` with the development app running and Playwright/Chromium available. `NODE_PATH` can point to a separate temporary Playwright installation. It checks independent status-list scrolling on desktop, whole-page scrolling with stacked Weak/Good/Perfect sections below 1024px, and access to all seven Good words using browser-only fixtures; it does not change database records.

## Personal finance — Phases 1–4

The sidebar's **Finance** section provides an overview, financial accounts, and customizable Income/Expense categories. Accounts support chequing, savings, credit card, cash, and other types; each has an explicit currency, optional masked identifier, and active/inactive status. Names are trimmed and normalized for duplicate detection. Account names are unique for the owner; category names are unique within Income or Expense. Identifiers accept only the last four characters with optional masking symbols. Full account/card numbers, CVVs, and banking credentials have no fields or supported workflow.

Accounts can be edited, deactivated, and reactivated. Categories can also be deleted when unused. Foreign keys retain referenced categories and accounts; deactivation preserves history. Once financial records reference an account, its currency cannot be changed. A category's Income/Expense type likewise cannot change after use. New categories/accounts should be created for those changes instead.

All Finance pages use `ProtectedLayout`; all Finance API handlers call `requireOwner` before processing requests. Queries are scoped to database user 1, following the existing single-owner policy. Finance responses are private/non-cacheable, inputs reject client-supplied ownership, and API errors do not expose ORM payloads or log account/category values. The module uses the existing database and authentication. Sharp validates image bytes; PDF.js renders previews locally in the browser.

The additive `20261105180000_finance_foundation` migration creates the two management tables and minimal future financial record tables:

- `FinancialTransaction` is the canonical money movement, with signed `Decimal(19,4)` amounts (positive inflow, negative outflow), explicit currency, account, optional category, transaction type, and source. Transfers and adjustments are distinct from income/expenses.
- `FinancialReceipt` and `FinancialIncomeRecord` may exist unmatched, or link to a transaction as supporting purchase/earnings details. Gross/net income remain separate; receipts and income details must not be counted again as independent ledger movements.
- `FinancialDocument` holds private storage metadata and optional record links. Receipt originals are served only by owner-protected endpoints; other document workflows remain unimplemented.
- `FinancialImport` has an account-scoped unique fingerprint. `FinancialImportEntry` retains original JSON separately from editable ledger fields, has a unique row key within its import, and can match an existing transaction. Multiple imported entries can reference the same transaction without requiring duplicate ledger entries.

Phase 2 adds manual entry and transaction history at `/finance/transactions`, with search, date/account/category/type/currency filters, pagination, editing and confirmed deletion. Date, description, amount, currency and account are required; expenses/income/refunds also require a compatible category. Merchant/counterparty and notes are optional; receipts and documents are never required. Cash, debit and credit card purchases are expenses against their respective accounts. Record Interac e-Transfers to other people as expenses or income, according to their purpose. A refund is a positive movement against an expense category, separate from income. Adjustments allow either direction without categorization.

The additive `20261105210000_manual_financial_transactions` migration adds notes, refund type, retry/duplicate fingerprints, and `FinancialTransfer` groups. A transfer saves two linked ledger entries atomically: a negative movement from the source and a positive movement into the destination. History displays the group once, and editing/deleting updates both sides together. Credit card bill payments and cash withdrawals into tracked cash accounts are transfers, never new expenses. Both accounts must belong to the owner. Same-currency transfers require equal amounts; cross-currency transfers explicitly capture both amounts in the respective account currencies. Record fees as separate expenses.

Money crosses HTTP boundaries as decimal strings and uses Prisma Decimal arithmetic, never JavaScript floating-point arithmetic. The stored scale is four decimal places with 15 integer digits. Transaction amounts are nonzero, transaction currencies must match accounts, and category types must match transaction types. Dates are calendar dates, avoiding timezone shifts. Inactive accounts/categories remain visible in history and existing entries; new entries require active references.

Each new form has an idempotency key: retrying the same request returns the original result. A different request with matching normalized date, account(s), type, amount(s), description and counterparty returns a duplicate warning with an existing-entry link. The user can explicitly confirm a separate legitimate entry. Similar entries with different dates/descriptions are not automatically merged. Edits check the saved version to avoid overwriting concurrent changes. Serializable writes protect transfer and duplicate operations.

Stable transaction IDs and the existing import-entry links let future statement rows reference these manual ledger entries rather than create another expense. Transfer edits preserve both entry IDs. Entries already linked to imports cannot be edited/deleted through manual management. Original imported JSON stays separate and untouched. Statement imports, reconciliation, AI and reports still have no application workflows; their foundation tables remain minimal.

Phase 3 adds `/finance/receipts`: searchable receipt history with account/date/linked-status filters, detail/edit pages, photo-library and camera selection, local image/PDF previews, and original-file download, replacement and deletion. All receipt fields are entered manually. Merchant, purchase date, account, currency, expense category, subtotal, tax and total are required; tip defaults to zero and notes are optional. Zero-tax, zero-tip and zero-total receipts are supported. Amounts are nonnegative decimal strings; subtotal + tax + tip is checked exactly using integer arithmetic. A difference is allowed only after explicit confirmation. A foreign-currency original may remain unmatched even when its currency differs from the payment account.

Receipts default to **unmatched**, creating no money movement. **Link an existing expense** requires an owner-owned expense with the same account, currency and total; purchase and posting dates may differ. Search and an optional transaction-date filter help locate older expenses. **Create an expense** explicitly creates one normal manual expense and links it in the same serializable database transaction. The account must use the receipt currency. An existing expense with the same account/date/currency/amount blocks creation and offers linking, even when merchant descriptions differ. Creation retries use receipt idempotency keys, and re-uploading the same original is detected by a unique owner/file SHA-256 hash. Duplicate detection does not infer that differently dated or differently valued expenses represent the same purchase: review candidates before creating a new expense. Separate receipts may reference a single expense without adding ledger movements.

Editing a receipt never changes its transaction. Keeping a link requires compatible account/currency/total; unlink it first to change those independently. Later transaction changes are flagged when viewing the receipt. Deleting a receipt or document retains the linked transaction and does not reverse an expense. Deleting just the document retains all receipt details; a replacement is applied when saving. Records may be saved without a file and gain one later.

The additive `20261106120000_receipt_management` migration extends the existing receipt/document tables with subtotal/tax/tip, notes, version timestamps, retry keys and file hashes. Legacy receipts receive subtotal equal to their previous total, with zero tax/tip. Originals are limited to **15 MB**: verified JPEG, PNG, WebP, single-frame GIF, or PDF bytes. Images must decode successfully and remain within the 40-megapixel limit. SVG/HTML and mismatched declared types are rejected. HEIC photos must be exported as JPEG. Upload streams are size-bounded before multipart parsing. Files have random storage keys and restrictive permissions; file names never determine filesystem paths. Owner authorization and cross-site mutation checks run before parsing uploads or accessing private files. File responses are private/non-cacheable, use MIME sniffing protection and a sandbox policy. PDF previews have page controls and run locally without OCR, AI or external document services; password-protected/unsupported PDFs can be opened or downloaded as originals.

Phase 4 adds **Finance → Income** at `/finance/income`, with searchable history, pay-date/source/deposit-status filters, editable records, optional pay stubs, and **Sources & deductions** settings. Sources cover employment, freelance work, interest, gifts, reimbursements and other income. Multiple employers/sources can be created, renamed, deactivated and reactivated. A source's kind cannot change after it has income history; create a new source for a different kind. Income categories reuse the existing Income category list. Configurable deduction types start with Income tax, QPP/CPP, EI, QPIP and Other deductions; create additional labels such as separate federal/provincial tax, insurance or union dues. Renaming/deactivating settings preserves their historical references. The migration installs defaults for the existing owner, and development seeding initializes them only when no deduction types exist, preserving customization.

Income records store description, source, pay date, optional pay-period start/end, optional gross amount, required net amount, deduction lines, currency, category and notes. The deposit account and pay stub are optional for unmatched records. When a pay period is entered, both dates are required in order. Amounts are nonnegative decimal strings with four-place precision; zero net is valid for unmatched records. Gross may remain unknown rather than being inferred from net. When gross is entered, gross minus deductions is compared exactly with net and a mismatch requires explicit confirmation. Each deduction type appears at most once per record. Payroll amounts describe earnings and withholding; **actual cash flow is recorded only by financial transactions**, never by counting an income record or its pay stub again.

Income records default to **unmatched**. **Link an existing income deposit** requires an owner-owned INCOME transaction with the same account, currency and net amount; pay date and bank posting date may differ. Search and an optional deposit-date filter locate older deposits. **Create a deposit for the net amount** explicitly creates one manual INCOME transaction and links it in the same serializable database transaction. An existing deposit with the same account/date/currency/net amount blocks creation and offers linking, regardless of source description or manual/imported origin. Gross pay and deductions are not separate ledger transactions. Creation retries return the original income record/deposit. Review search results before creating a deposit: differently dated or differently valued transactions are not automatically identified as the same paycheque. Split deposits are not implemented; the linked deposit must match the full net amount.

Stable income-record/transaction links and `FinancialImportEntry.transactionId` support later bank imports matching the original deposit without a second money movement. Original imported data stays on import entries, separate from editable earnings fields. Tests simulate multiple import rows referencing one manual deposit and also linking an already-imported deposit; ledger counts remain unchanged. **Statement parsing/import/reconciliation itself is not implemented in Phase 4.** Future import code must match these existing transaction IDs rather than insert a second deposit. Transaction details now link back to their income records/pay stubs. Editing or deleting income details/documents leaves the bank transaction unchanged; discrepancies from later transaction edits are flagged on the income record. Unlink a deposit before independently changing account/currency/net.

The additive `20261106180000_income_management` migration extends `FinancialIncomeRecord` and creates minimal `FinancialIncomeSource`, `FinancialDeductionType` and `FinancialIncomeDeduction` tables. Existing income amounts and document links are preserved. Pay stubs reuse the same private storage volume, file validation, upload limits, owner checks and local PDF/image previews as receipts. Originals can be replaced, downloaded or deleted; deleting only a pay stub retains all income details. File hashes prevent duplicate uploads across income records and receipts. There is no OCR, AI, automatic deduction calculation or pay-stub extraction.

**Persistent private storage:** both Compose files mount `/app/private/finance` and set `FINANCE_UPLOAD_DIR`. Development uses `finance_files_dev`; production uses `finance_files` (Compose prefixes volume names with the project). These volumes are separate from PostgreSQL and persist across image rebuilds. Back up and restore the database **and** financial document volume together; `docker compose down -v` removes named volumes. Outside Compose, `FINANCE_UPLOAD_DIR` defaults to `private/finance` under the app directory, excluded from Git and Docker build context. Never configure it under `public`. Deployment must retain the mounted volume and a writable directory. If a reverse proxy has a smaller upload limit, allow at least 16 MB requests. Replacement writes a new private file before committing metadata and removes the old file afterward; failed saves clean up their new files. A process crash can leave an unreferenced private file, so database metadata is authoritative when restoring or cleaning storage.

Deploy through the existing production Compose workflow, which runs `prisma migrate deploy` automatically; generate Prisma Client when building. No finance demo data is seeded. Verification:

- `node --test tests/*.test.mjs`
- In the development container: `RUN_FINANCE_DB_TEST=1 node tests/finance.integration.mjs` and `RUN_FINANCE_TRANSACTION_DB_TEST=1 node tests/finance-transactions.integration.mjs` (all fixtures roll back).
- With Playwright/Chromium available and the development app running: `RUN_FINANCE_BROWSER_TEST=1 node tests/finance.browser.mjs` (`NODE_PATH` may point to a temporary Playwright installation). All finance writes use browser-only fixtures.
- Income API/database checks: `RUN_FINANCE_INCOME_DB_TEST=1 node tests/finance-income.integration.mjs` in the development container (database fixtures roll back; test documents use a temporary directory that is removed).
- Income browser checks: `RUN_FINANCE_INCOME_BROWSER_TEST=1 node tests/finance-income.browser.mjs` with Playwright/Chromium and the app running; all financial writes are browser-only fixtures. Set `FINANCE_INCOME_BROWSER_BASE_URL` to check a local production preview on another port.
- Receipt API/database checks: `RUN_FINANCE_RECEIPT_DB_TEST=1 node tests/finance-receipts.integration.mjs` in the development container (database fixtures roll back; private test files use a temporary directory that is removed).
- Receipt browser checks: `RUN_FINANCE_RECEIPT_BROWSER_TEST=1 node tests/finance-receipts.browser.mjs` with Playwright/Chromium and the app running; all mutations use browser-only fixtures. Set `FINANCE_RECEIPT_BROWSER_BASE_URL` to test a local production preview on another port.
- Transaction browser checks: `RUN_FINANCE_TRANSACTION_BROWSER_TEST=1 node tests/finance-transactions.browser.mjs`, with Playwright/Chromium and the app available; financial writes use browser-only fixtures.
- `RUN_AUTH_HTTP_TEST=1 node tests/auth-security.integration.mjs` inside the development container checks all protected endpoints and Finance page redirects without creating finance records.

## Owner-only authentication

The app is restricted to the permanent GitHub account ID `89470930` (`2135500-Garand-Cedric`). The allowlist is in `src/lib/owner-policy.ts`; matching an email address or username does not grant access. Other GitHub accounts are redirected to `/access-denied` and do not receive an authorized app session.

Each private page branch uses `ProtectedLayout`, and all data API handlers call `requireOwner` before reading input, querying the database, or using external services. Anonymous API calls return 401; authenticated non-owners return 403. Mutation requests from other origins are rejected. The owner continues to use the existing database records under user ID 1; this is deliberately a single-owner app, not a multi-user application.

Deploy the updated image to apply these protections in production. Existing sessions need a fresh GitHub sign-in because older tokens lack the owner authorization claims. Keep `NEXTAUTH_SECRET` private and set `NEXTAUTH_URL` to the canonical HTTPS production URL.

Authentication coverage: `node --test tests/auth-security.test.mjs`. Live checks run in the development container with `RUN_AUTH_HTTP_TEST=1 node tests/auth-security.integration.mjs`; they use short-lived locally signed test cookies, never print credentials, and perform no data mutations.
