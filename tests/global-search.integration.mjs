import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { searchModules } from "./helpers/search.mjs";

test(
  "global search covers canonical records, ownership, notes, recurrence, archives, finance and Japanese without writes",
  {
    skip: process.env.RUN_GLOBAL_SEARCH_DB_TEST !== "1",
    timeout: 120000,
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const ids = new Map();
    async function create(model, data) {
      const row = await db[model].create({ data });
      ids.set(model, [...(ids.get(model) ?? []), row.id]);
      return row;
    }
    const prefix = `GlobalSearch${randomUUID().replaceAll("-", "")}`;
    const now = new Date("2026-11-25T12:00:00Z");
    const modules = searchModules(db),
      { searchDashboard } = modules.server;
    const find = (query, extra = {}) =>
      searchDashboard(modules.types.searchInput({ query, ...extra }), db, now, "America/Toronto");
    const allItems = (result) => result.groups.flatMap((group) => group.items);
    const group = (result, kind) => result.groups.find((group) => group.kind === kind);
    try {
      await db.user.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, email: "owner@invalid.test" },
      });
      const foreign = await create("user", { email: `${prefix}@invalid.test` });
      const person = await create("workContact", {
        userId: 1,
        name: `${prefix} DadCurrent`,
        notes: `${prefix} person notes`,
      });
      const inactive = await create("workContact", {
        userId: 1,
        name: `${prefix} inactive`,
        active: false,
      });
      const secret = `SecretContact${prefix}`;
      const foreignPerson = await create("workContact", { userId: foreign.id, name: secret });
      const project = await create("workProject", {
        userId: 1,
        name: `${prefix} VPN project`,
        objective: "Repair connectivity",
      });
      await create("workProjectStage", { projectId: project.id, name: `${prefix} stage match` });
      const milestone = await create("workKeyDate", {
        projectId: project.id,
        label: `${prefix} milestone`,
        date: "2026-12-01",
      });
      assert.ok(milestone.id);
      const task = await create("todo", {
        userId: 1,
        title: `${prefix} VPN task`,
        projectId: project.id,
        requesterId: person.id,
        status: "DONE",
        completedAt: now,
        deadlineAt: now,
        deadlineTimeZone: "UTC",
      });
      await create("todo", { userId: 1, title: `${prefix} extra one` });
      await create("todo", { userId: 1, title: `${prefix} extra two` });
      const archived = await create("todo", {
        userId: 1,
        title: `${prefix} archived`,
        archivedAt: now,
      });
      await create("todo", { userId: foreign.id, title: `${prefix} foreign task` });
      await create("todo", {
        userId: 1,
        title: "Owned task with a foreign requester",
        requesterId: foreignPerson.id,
      });
      const noteWord = `NoteOnly${prefix}`;
      await create("workNote", {
        userId: 1,
        todoId: task.id,
        actorGithubId: "89470930",
        body: noteWord,
      });
      const directWord = `ProjectNote${prefix}`;
      await create("workNote", {
        userId: 1,
        projectId: project.id,
        actorGithubId: "89470930",
        body: directWord,
      });
      await create("workNote", {
        userId: 1,
        todoId: task.id,
        actorGithubId: "89470930",
        body: `Removed${prefix}`,
        removedAt: now,
      });
      await create("workNote", {
        userId: foreign.id,
        todoId: task.id,
        actorGithubId: "other",
        body: secret,
      });
      const recurrence = await create("recurrenceSeries", {
        userId: 1,
        kind: "TASK",
        frequency: "WEEKLY",
        anchor: "2026-11-26",
        timeZone: "America/Toronto",
        template: { title: "Payroll" },
        generatedThrough: "2026-12-31",
      });
      const payroll = [];
      for (const date of ["2026-11-19", "2026-11-26", "2026-12-03", "2026-12-10"])
        payroll.push(
          await create("todo", {
            userId: 1,
            title: `${prefix} payroll`,
            recurrenceId: recurrence.id,
            recurrenceDate: date,
          }),
        );
      const folder = await create("knowledgeFolder", {
        userId: 1,
        name: prefix,
        normalizedName: prefix.toLowerCase(),
        archivedAt: now,
      });
      const child = await create("knowledgeFolder", {
        userId: 1,
        name: "Child",
        normalizedName: `${prefix}child`.toLowerCase(),
        parentId: folder.id,
      });
      const archivedArticle = await create("knowledgeArticle", {
        userId: 1,
        title: `${prefix} archived article`,
        folderId: child.id,
      });
      const article = await create("knowledgeArticle", {
        userId: 1,
        title: `${prefix} VPN procedure`,
        summary: "Troubleshooting",
        body: `Code: ${prefix} body-only 100% _ underscore <script>not executable</script>`,
      });
      const tag = await create("knowledgeTag", {
        userId: 1,
        name: `${prefix}tag`,
        normalizedName: `${prefix}tag`.toLowerCase(),
      });
      await db.knowledgeArticleTag.create({
        data: { userId: 1, articleId: article.id, tagId: tag.id },
      });
      await create("knowledgeArticle", { userId: foreign.id, title: `${prefix} foreign article` });
      const event = await db.$transaction(async (tx) => {
        const event = await tx.event.create({
          data: {
            userId: 1,
            title: `${prefix} session`,
            kind: "WORK_SESSION",
            timeZone: "UTC",
            date: new Date("2026-11-25T01:00:00Z"),
            endDate: new Date("2026-11-25T02:00:00Z"),
          },
        });
        await tx.eventTaskLink.create({
          data: { eventId: event.id, todoId: task.id, role: "SESSION_TARGET" },
        });
        return event;
      });
      ids.set("event", [event.id]);
      const birthday = await create("calendarBirthday", {
        userId: 1,
        name: `${prefix} birthday`,
        month: 2,
        day: 29,
      });
      const holiday = await create("calendarHoliday", {
        userId: 1,
        key: prefix,
        country: "CA",
        name: `${prefix} Easter Monday`,
        type: "bank",
        rule: "easter 1",
        options: { name: "Easter Monday", type: "optional" },
        location: "National",
      });
      const category = await create("category", { name: prefix });
      const vocab = await create("vocabulary", {
        userId: 1,
        english: `${prefix} school`,
        japanese: "学校",
        hiragana: "がっこう",
        readings: ["がっこう", "がく"],
        categoryId: category.id,
      });
      await create("vocabulary", {
        userId: foreign.id,
        english: `${prefix} foreign school`,
        japanese: "学校",
        hiragana: "がっこう",
      });
      const bank = await create("financialAccount", {
        userId: 1,
        name: prefix,
        normalizedName: prefix.toLowerCase(),
        type: "CHEQUING",
        currency: "CAD",
      });
      const savings = await create("financialAccount", {
        userId: 1,
        name: `${prefix}savings`,
        normalizedName: `${prefix}savings`.toLowerCase(),
        type: "SAVINGS",
        currency: "CAD",
      });
      const financeCategory = await create("financeCategory", {
        userId: 1,
        name: prefix,
        normalizedName: prefix.toLowerCase(),
        type: "EXPENSE",
      });
      const movement = (type, amount, description, extra = {}) =>
        create("financialTransaction", {
          userId: 1,
          accountId: bank.id,
          categoryId: type === "TRANSFER" || type === "INCOME" ? null : financeCategory.id,
          type,
          amount,
          description,
          currency: "CAD",
          occurredOn: new Date("2026-11-24"),
          ...extra,
        });
      const expense = await movement("EXPENSE", "-1000", `${prefix} rent`);
      const refund = await movement("REFUND", "1000", `${prefix} repayment`);
      const income = await movement("INCOME", "500", `${prefix} income`);
      const hidden = await movement("EXPENSE", "-10", `${prefix} excluded`, {
        excludedAmount: "10",
      });
      const transfer = await create("financialTransfer", { userId: 1 });
      const outgoing = await movement("TRANSFER", "-200", `${prefix} transfer`, {
        transferId: transfer.id,
      });
      const incoming = await movement("TRANSFER", "200", `${prefix} transfer`, {
        transferId: transfer.id,
        accountId: savings.id,
      });
      await create("financialReceipt", {
        userId: 1,
        accountId: bank.id,
        transactionId: expense.id,
        purchasedOn: new Date("2026-11-24"),
        merchant: `${prefix} merchant`,
        subtotal: "1000",
        tax: "0",
        tip: "0",
        total: "1000",
        currency: "CAD",
      });
      const retained = await movement("EXPENSE", "-10", `${prefix} retained`);
      await create("financialReceipt", {
        userId: 1,
        accountId: bank.id,
        transactionId: hidden.id,
        purchasedOn: new Date("2026-11-24"),
        merchant: `DuplicateMerchant${prefix}`,
        subtotal: "10",
        tax: "0",
        tip: "0",
        total: "10",
        currency: "CAD",
      });
      await create("financialMatch", {
        userId: 1,
        kind: "DUPLICATE",
        status: "CONFIRMED",
        pairKey: prefix,
        sourceTransactionId: hidden.id,
        transactionId: retained.id,
        amount: "10",
        currency: "CAD",
        sourceSnapshot: {},
      });
      const source = await create("financialIncomeSource", {
        userId: 1,
        name: `${prefix} employer`,
        normalizedName: `${prefix}employer`.toLowerCase(),
        kind: "EMPLOYMENT",
      });
      await create("financialIncomeRecord", {
        userId: 1,
        accountId: bank.id,
        sourceId: source.id,
        transactionId: income.id,
        paidOn: new Date("2026-11-24"),
        description: `${prefix} salary metadata`,
        grossAmount: "600",
        netAmount: "500",
        currency: "CAD",
      });
      const plan = await create("financialReimbursementPlan", {
        userId: 1,
        expenseId: expense.id,
        contactId: person.id,
        person: `${prefix} DadSnapshot`,
        expectedAmount: "1000",
      });
      await create("financialReimbursement", {
        userId: 1,
        expenseId: expense.id,
        paymentId: refund.id,
        planId: plan.id,
        amount: "1000",
      });
      const statement = await create("financialImport", {
        userId: 1,
        accountId: bank.id,
        status: "COMPLETED",
        originalName: `${prefix}.csv`,
        fingerprint: prefix,
        periodStart: new Date("2026-11-01"),
        periodEnd: new Date("2026-11-30"),
      });
      await db.financialImportEntry.create({
        data: {
          importId: statement.id,
          rowKey: "1",
          sourceIdentifier: `BankRef${prefix}`,
          transactionId: expense.id,
          action: "MATCH",
          originalData: { description: "original description" },
        },
      });

      await db.financialImportEntry.create({
        data: {
          importId: statement.id,
          rowKey: "2",
          sourceIdentifier: `TransferRef${prefix}`,
          transactionId: incoming.id,
          action: "MATCH",
          originalData: {},
        },
      });
      const tracked = [
        "todo",
        "event",
        "recurrenceSeries",
        "financialTransaction",
        "financialReimbursement",
        "financialMatch",
        "workNote",
        "vocabulary",
        "activityVocab",
        "knowledgeArticle",
        "workContact",
      ];
      const snapshot = async () =>
        Object.fromEntries(
          await Promise.all(
            tracked.map(async (model) => [
              model,
              await db[model].findMany({ orderBy: { id: "asc" } }),
            ]),
          ),
        );
      const before = JSON.stringify(await snapshot());
      const start = performance.now();
      const results = await find(prefix);
      const elapsed = performance.now() - start;
      for (const result of results.groups) {
        if (result.error) {
          // Synthetic-data-only diagnostic: surface SQL errors in this isolated test,
          // never in the production adapter/API or logs containing real searches.
          const names = {
            tasks: "work",
            projects: "work",
            knowledge: "knowledge",
            calendar: "calendar",
            finance: "finance",
            people: "people-vocabulary",
            vocabulary: "people-vocabulary",
          };
          const key = {
            tasks: "tasksSQL",
            projects: "projectsSQL",
            knowledge: "knowledgeSQL",
            calendar: "calendarSQL",
            finance: "financeSQL",
            people: "peopleSQL",
            vocabulary: "vocabularySQL",
          };
          await db.$queryRawUnsafe(
            modules.deps["./adapters/shared"].argumentsSQL +
              modules.deps[`./adapters/${names[result.kind]}`][key[result.kind]] +
              modules.deps["./adapters/shared"].resultsSQL,
            1,
            prefix,
            false,
            4,
            0,
            true,
            "2026-11-25",
            now,
          );
        }
        assert.equal(result.error, undefined, `${result.kind} query succeeds`);
        assert.ok(result.items.length <= 3);
      }
      assert.equal(group(results, "tasks").hasMore, true);
      assert.ok(
        allItems(results).some((item) => item.id === project.id && item.kind === "projects"),
      );
      assert.ok(!allItems(results).some((item) => item.title.includes("foreign")));
      assert.ok(!allItems(await find(secret)).length, "foreign joins and notes never match");
      const exact = group(await find(`task-${task.id}`), "tasks");
      assert.equal(exact.items[0].id, task.id);
      assert.match(exact.items[0].subtitle, /Done/);
      assert.match(exact.items[0].subtitle, /7:00/);
      assert.equal(group(await find(`project-${project.id}`), "projects").items[0].id, project.id);
      assert.ok(!group(results, "tasks").items.some((item) => item.id === archived.id));
      assert.ok(
        group(
          await find(`${prefix} archived`, { kind: "tasks", includeArchived: true }),
          "tasks",
        ).items.some((item) => item.id === archived.id),
      );
      assert.ok(
        !group(await find(`${prefix} archived article`, { kind: "knowledge" }), "knowledge").items
          .length,
      );
      assert.equal(
        group(
          await find(`${prefix} archived article`, { kind: "knowledge", includeArchived: true }),
          "knowledge",
        ).items[0].id,
        archivedArticle.id,
      );
      assert.equal(
        group(await find(`${prefix}tag`, { kind: "knowledge" }), "knowledge").items[0].id,
        article.id,
      );
      assert.equal(
        group(await find("100%", { kind: "knowledge", view: "page" }), "knowledge").items.find(
          (item) => item.id === article.id,
        ).id,
        article.id,
      );
      assert.equal(
        group(await find(`${prefix} inactive`, { kind: "people" }), "people").items.length,
        0,
      );
      assert.equal(
        group(await find(`${prefix} inactive`, { kind: "people", includeArchived: true }), "people")
          .items[0].id,
        inactive.id,
      );
      const noteResults = await find(noteWord);
      assert.equal(group(noteResults, "tasks").items[0].id, task.id);
      assert.equal(
        group(noteResults, "projects").items.length,
        0,
        "task-note rollups are not duplicated as project notes",
      );
      assert.equal(group(await find(directWord), "projects").items[0].id, project.id);
      assert.equal(group(await find(`Removed${prefix}`), "tasks").items.length, 0);
      assert.equal(group(await find(`${prefix} stage match`), "projects").items[0].id, project.id);
      const recurring = group(await find(`${prefix} payroll`), "tasks");
      assert.equal(recurring.items.length, 1);
      assert.equal(recurring.items[0].id, payroll[1].id);
      assert.equal(
        group(await find(`${prefix} payroll`, { kind: "tasks", view: "page" }), "tasks").items
          .length,
        4,
      );
      for (const query of ["学", "がく", `${prefix} school`])
        assert.ok(
          group(await find(query, { kind: "vocabulary", view: "page" }), "vocabulary").items.some(
            (item) => item.id === vocab.id,
          ),
        );
      const calendar = group(
        await find(prefix, { kind: "calendar", view: "page" }),
        "calendar",
      ).items;
      assert.match(
        calendar.find((item) => item.id === event.id && item.entity === "event").subtitle,
        /Nov 24/,
      );
      assert.ok(calendar.find((item) => item.entity === "event").badges.includes("Work session"));
      assert.match(
        calendar.find((item) => item.entity === "birthday" && item.id === birthday.id).href,
        /date=2027-02-28/,
      );
      assert.match(
        calendar.find((item) => item.entity === "holiday" && item.id === holiday.id).href,
        /date=2027-03-29/,
      );
      const finance = group(await find(prefix, { kind: "finance", view: "page" }), "finance").items;
      assert.equal(
        finance.filter((item) => item.entity === "activity" && item.id === expense.id).length,
        1,
      );
      assert.ok(!finance.some((item) => item.id === incoming.id && item.entity === "activity"));
      assert.ok(!finance.some((item) => item.id === hidden.id && item.entity === "activity"));
      assert.ok(finance.some((item) => item.id === outgoing.id && item.entity === "activity"));
      assert.equal(
        finance.find((item) => item.id === income.id && item.entity === "activity").href,
        `/finance/income/deposits/${income.id}`,
      );
      assert.ok(
        finance
          .find((item) => item.id === refund.id && item.entity === "activity")
          .badges.includes("Refund / reimbursement"),
      );
      for (const query of [`${prefix} DadSnapshot`, `${prefix} DadCurrent`]) {
        const items = group(await find(query, { kind: "finance", view: "page" }), "finance").items;
        assert.ok(items.some((item) => item.id === expense.id));
        assert.ok(items.some((item) => item.id === refund.id));
      }
      assert.equal(
        group(await find(`BankRef${prefix}`, { kind: "finance" }), "finance").items[0].id,
        expense.id,
      );
      const duplicateMetadata = group(
        await find(`DuplicateMerchant${prefix}`, { kind: "finance" }),
        "finance",
      );
      assert.deepEqual(
        duplicateMetadata.items.map((item) => item.id),
        [retained.id],
      );
      assert.equal(
        group(await find(`TransferRef${prefix}`, { kind: "finance" }), "finance").items[0].id,
        outgoing.id,
      );
      assert.equal(
        JSON.stringify(await snapshot()),
        before,
        "search changes no rows, statuses, revisions, occurrences or financial amounts",
      );

      const bulk = Array.from({ length: 1000 }, (_, i) => ({
        userId: 1,
        title: `${prefix} benchmark ${i}`,
      }));
      await db.todo.createMany({ data: bulk });
      const bulkIds = (
        await db.todo.findMany({
          where: { userId: 1, title: { startsWith: `${prefix} benchmark` } },
          select: { id: true },
        })
      ).map((row) => row.id);
      ids.set("todo", [...ids.get("todo"), ...bulkIds]);
      await db.knowledgeArticle.createMany({
        data: Array.from({ length: 60 }, (_, i) => ({
          userId: 1,
          title: `${prefix} long article ${i}`,
          type: "PROCEDURE",
          body:
            "Troubleshooting procedure and diagnostic context. ".repeat(170) +
            `BodyNeedle${prefix}`,
        })),
      });
      const articleIds = (
        await db.knowledgeArticle.findMany({
          where: { userId: 1, title: { startsWith: `${prefix} long article` } },
          select: { id: true },
        })
      ).map((row) => row.id);
      ids.set("knowledgeArticle", [...ids.get("knowledgeArticle"), ...articleIds]);
      const knowledgeStart = performance.now();
      const longArticles = group(
        await find(`BodyNeedle${prefix}`, { kind: "knowledge", view: "page" }),
        "knowledge",
      );
      assert.equal(longArticles.error, undefined);
      assert.equal(longArticles.items.length, 25);
      assert.ok(longArticles.items.every((item) => item.snippet.length <= 220));
      const knowledgeMs = Math.round(performance.now() - knowledgeStart);
      const times = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        const run = await find(prefix);
        assert.ok(run.groups.every((group) => !group.error));
        times.push(Math.round(performance.now() - start));
      }
      if (process.env.RUN_SEARCH_PRODUCTION_URL) {
        const url = process.env.RUN_SEARCH_PRODUCTION_URL;
        assert.equal(url, "http://dashboard-search-production-check:3000");
        const { encode } = await import("next-auth/jwt");
        const token = await encode({
          secret: process.env.NEXTAUTH_SECRET,
          maxAge: 900,
          token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
        });
        const request = (query, cookie = token) =>
          fetch(`${url}/api/search`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              cookie: `next-auth.session-token=${cookie}`,
            },
            body: JSON.stringify({ query }),
          });
        const denied = await fetch(`${url}/api/search`, { method: "POST", body: "invalid JSON" });
        assert.equal(denied.status, 401);
        const foreignToken = await encode({
          secret: process.env.NEXTAUTH_SECRET,
          maxAge: 900,
          token: { githubId: "not-the-owner", provider: "github", ownerAuthVersion: 1 },
        });
        assert.equal((await request(prefix, foreignToken)).status, 403);
        await request(prefix); // Warm the route and connection pool.
        const httpTimes = [];
        for (let i = 0; i < 3; i++) {
          const started = performance.now();
          const response = await request(prefix);
          assert.equal(response.status, 200);
          assert.match(response.headers.get("cache-control"), /private, no-store/);
          const data = await response.json();
          assert.equal(data.groups.length, 7);
          assert.ok(data.groups.every((group) => !group.error && group.items.length <= 3));
          httpTimes.push(Math.round(performance.now() - started));
        }
        const bodyResult = await (await request(`BodyNeedle${prefix}`)).json();
        assert.ok(bodyResult.groups.find((group) => group.kind === "knowledge").items.length);
        const page = await fetch(`${url}/search?type=tasks`, {
          headers: { cookie: `next-auth.session-token=${token}` },
        });
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.ok(html.includes("Search dashboard") && !html.includes(prefix));
        console.log(`Production-build warm HTTP all-group timings: ${httpTimes.join(",")}ms.`);
      }
      const first = group(
        await find(`${prefix} benchmark`, { kind: "tasks", view: "page" }),
        "tasks",
      );
      const second = group(
        await find(`${prefix} benchmark`, { kind: "tasks", view: "page", page: 2 }),
        "tasks",
      );
      assert.equal(first.items.length, 25);
      assert.equal(first.hasMore, true);
      assert.ok(second.items.every((item) => !first.items.some((other) => other.id === item.id)));
      const sql =
        modules.deps["./adapters/shared"].argumentsSQL +
        modules.deps["./adapters/work"].tasksSQL +
        modules.deps["./adapters/shared"].resultsSQL;
      const explain = await db.$queryRawUnsafe(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
        1,
        `${prefix} benchmark`,
        false,
        4,
        0,
        true,
        "2026-11-25",
        now,
      );
      const planData = explain[0]["QUERY PLAN"][0];
      console.log(
        `Synthetic search timings: initial=${Math.round(elapsed)}ms; 1,000-task all-group runs=${times.join(",")}ms; task query execution=${planData["Execution Time"]}ms; 60 long Knowledge bodies=${knowledgeMs}ms.`,
      );
    } finally {
      await db.$transaction(async (tx) => {
        await tx.eventTaskLink.deleteMany({ where: { eventId: { in: ids.get("event") ?? [] } } });
        await tx.event.deleteMany({ where: { id: { in: ids.get("event") ?? [] } } });
      });
      ids.set("event", []);
      for (const model of ["financialImportEntry", "eventTaskLink", "knowledgeArticleTag"]) {
        if (model === "financialImportEntry")
          await db[model].deleteMany({
            where: { importId: { in: ids.get("financialImport") ?? [] } },
          });
        else if (model === "eventTaskLink")
          await db[model].deleteMany({ where: { eventId: { in: ids.get("event") ?? [] } } });
        else
          await db[model].deleteMany({
            where: { articleId: { in: ids.get("knowledgeArticle") ?? [] } },
          });
      }
      for (const model of [
        "financialMatch",
        "financialReimbursement",
        "financialReimbursementPlan",
        "financialReceipt",
        "financialIncomeRecord",
        "financialImport",
        "financialTransaction",
        "financialTransfer",
        "financialIncomeSource",
        "financeCategory",
        "financialAccount",
        "workNote",
        "event",
        "todo",
        "recurrenceSeries",
        "workKeyDate",
        "workProjectStage",
        "workProject",
        "knowledgeArticle",
        "knowledgeTag",
      ])
        await db[model].deleteMany({ where: { id: { in: ids.get(model) ?? [] } } });
      const folderIds = ids.get("knowledgeFolder") ?? [];
      for (const id of folderIds.reverse()) await db.knowledgeFolder.delete({ where: { id } });
      for (const model of [
        "vocabulary",
        "category",
        "calendarHoliday",
        "calendarBirthday",
        "workContact",
        "user",
      ])
        await db[model].deleteMany({ where: { id: { in: ids.get(model) ?? [] } } });
      await db.$disconnect();
    }
  },
);
