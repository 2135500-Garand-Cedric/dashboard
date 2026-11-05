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

## Owner-only authentication

The app is restricted to the permanent GitHub account ID `89470930` (`2135500-Garand-Cedric`). The allowlist is in `src/lib/owner-policy.ts`; matching an email address or username does not grant access. Other GitHub accounts are redirected to `/access-denied` and do not receive an authorized app session.

Each private page branch uses `ProtectedLayout`, and all data API handlers call `requireOwner` before reading input, querying the database, or using external services. Anonymous API calls return 401; authenticated non-owners return 403. Mutation requests from other origins are rejected. The owner continues to use the existing database records under user ID 1; this is deliberately a single-owner app, not a multi-user application.

Deploy the updated image to apply these protections in production. Existing sessions need a fresh GitHub sign-in because older tokens lack the owner authorization claims. Keep `NEXTAUTH_SECRET` private and set `NEXTAUTH_URL` to the canonical HTTPS production URL.

Authentication coverage: `node --test tests/auth-security.test.mjs`. Live checks run in the development container with `RUN_AUTH_HTTP_TEST=1 node tests/auth-security.integration.mjs`; they use short-lived locally signed test cookies, never print credentials, and perform no data mutations.
