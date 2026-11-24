import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { loadWorkServices } from "./helpers/work-services.mjs";

if (
  process.env.NODE_ENV !== "development" ||
  process.env.ALLOW_WEEKLY_REPORT_EXAMPLES !== "1" ||
  process.env.PUSH_ENABLED === "true"
) {
  throw new Error(
    "Run explicitly in development with ALLOW_WEEKLY_REPORT_EXAMPLES=1 and push disabled.",
  );
}

function stableKey(value) {
  const bytes = createHash("sha256").update(`weekly-report-examples:v1:${value}`).digest();
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const db = new PrismaClient({ log: [] });
const userId = 1,
  actorGithubId = "89470930";
try {
  const { timeZone } = await loadWorkServices(db).settings.readUserSettings();
  const now = new Date();
  const local = DateTime.fromJSDate(now, { zone: timeZone });
  const start = local.startOf("week"),
    week = start.toISODate(),
    today = local.toISODate();
  const requestKey = stableKey(week);
  const available = Math.max(0, now.getTime() - start.toMillis() - 2000);
  const at = (fraction) => new Date(start.toMillis() + available * fraction);
  const day = (fraction) => DateTime.fromJSDate(at(fraction), { zone: timeZone }).toISODate();
  const dayInstant = (value) => new Date(`${value}T00:00:00Z`);
  const result = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(94724, ${userId}::integer)`;
      const previous = await tx.workMutationReceipt.findUnique({
        where: { userId_requestKey: { userId, requestKey } },
      });
      if (previous) return { ...previous.result, reused: true };
      if (!(await tx.user.findUnique({ where: { id: userId } })))
        throw new Error("Initialize the development owner first.");
      const activity = await tx.activityType.findFirst({ where: { active: true } });
      const project = await tx.workProject.create({
        data: {
          userId,
          name: `[Example] Weekly review ${week}`,
          summary: "Fictional sample history for the weekly report. No real work was performed.",
          activityTypeId: activity?.id,
          targetDate: local.plus({ days: 3 }).toISODate(),
        },
      });
      const projects = [project.id];
      projects.push(
        (
          await tx.workProject.create({
            data: {
              userId,
              name: `[Example] Review documentation ${week}`,
              summary: "Fictional overdue project target for report previews.",
              targetDate: local.minus({ days: 1 }).toISODate(),
            },
          })
        ).id,
      );
      const tasks = [];
      async function task(title, data = {}) {
        const row = await tx.todo.create({
          data: {
            userId,
            projectId: project.id,
            activityTypeId: activity?.id,
            title: `[Example] ${title}`,
            description: "Fictional task for the weekly report preview.",
            createdAt: at(0.05),
            ...data,
          },
        });
        tasks.push(row.id);
        return row;
      }
      async function audit(row, action, before, after, fraction) {
        return tx.workActivity.create({
          data: {
            userId,
            actorGithubId,
            todoId: row.id,
            todoReference: `TASK-${String(row.id).padStart(4, "0")}`,
            action,
            changes: { status: { before, after }, title: { before: null, after: row.title } },
            createdAt: at(fraction),
          },
        });
      }
      for (const [index, title] of [
        "Test the database backup",
        "Update the laptop setup procedure",
        "Review calendar reminders",
        "Resolve the printer connection issue",
      ].entries()) {
        const row = await task(title, { status: "DONE", completedAt: at(0.25 + index * 0.08) });
        await audit(row, "COMPLETED", "TODO", "DONE", 0.25 + index * 0.08);
      }
      const reopened = await task("Investigate an intermittent VPN connection", {
        status: "IN_PROGRESS",
      });
      await audit(reopened, "COMPLETED", "IN_PROGRESS", "DONE", 0.45);
      await audit(reopened, "REOPENED", "DONE", "IN_PROGRESS", 0.7);
      const cancelled = await task("Replace the old keyboard", {
        status: "CANCELLED",
        cancelledAt: at(0.55),
      });
      await audit(cancelled, "CANCELLED", "TODO", "CANCELLED", 0.55);
      const due = await task("Send the follow-up email to the supplier", {
        status: "WAITING",
        deadlineAt: new Date(now.getTime() - 3600000),
        deadlineTimeZone: timeZone,
      });
      await tx.workFollowUp.create({
        data: {
          todoId: due.id,
          at: new Date(now.getTime() - 1800000),
          timeZone,
          reason: "Example supplier response is due.",
        },
      });
      await task("Prepare the next payroll checklist", {
        status: "TODO",
        deadlineDate: local.plus({ days: 2 }).toISODate(),
      });

      // Save illustrative session history only: never alter vocabulary statuses,
      // review timers, progress snapshots, user XP, or gold for these examples.
      const practices = [];
      for (const [index, activityId] of [1, 3, 1, 5, 5].entries()) {
        const activityRow = await tx.activity.findUnique({ where: { id: activityId } });
        if (!activityRow) throw new Error(`Practice activity ${activityId} is missing.`);
        const entries = await tx.activityVocab.findMany({
          where: {
            activityId,
            verbFormId: null,
            vocab: { userId, ...(activityId === 5 ? { category: { name: "Kanji" } } : {}) },
          },
          include: { vocab: { include: { category: true } } },
          orderBy: { id: "asc" },
          take: 10,
        });
        if (entries.length < 10)
          throw new Error(`Activity ${activityId} needs ten vocabulary entries for the examples.`);
        const weak = index % 2 ? 1 : 2,
          good = index % 2 ? 4 : 3;
        const completedAt = at(0.3 + index * 0.1),
          durationSeconds = 240 + index * 75;
        const words = entries.map((entry, i) => ({
          activityVocabId: entry.id,
          vocabId: entry.vocab.id,
          english: entry.vocab.english,
          japanese: entry.vocab.japanese ?? "",
          hiragana: entry.vocab.hiragana,
          readings: entry.vocab.readings,
          categoryName: entry.vocab.category?.name ?? null,
          previousStatus: entry.status,
          status: i < weak ? "WEAK" : i < weak + good ? "GOOD" : "PERFECT",
        }));
        const row = await tx.practice.create({
          data: {
            userId,
            activityId,
            sessionKey: stableKey(`${week}:practice:${index}`),
            activityName: `[Example] ${activityRow.activity}`,
            date: completedAt,
            startedAt: new Date(completedAt.getTime() - durationSeconds * 1000),
            completedAt,
            durationSeconds,
            wordCount: 10,
            weakCount: weak,
            goodCount: good,
            perfectCount: 10 - weak - good,
            averageBefore: 60 + index * 0.25,
            averageAfter: 60 + (index + 1) * 0.25,
            selectedCategories: [],
            starredOnly: false,
            xpEarned: 0,
            goldEarned: 0,
            words,
          },
        });
        practices.push(row.id);
      }

      const folder = await tx.knowledgeFolder.create({
        data: {
          userId,
          name: `[Example] Weekly review ${week}`,
          normalizedName: `[example] weekly review ${week}`,
          color: "#a78bfa",
        },
      });
      const articles = [];
      async function article(title, index, edited = false) {
        const createdAt = edited ? start.minus({ days: 2 }).toJSDate() : at(0.2 + index * 0.1);
        const body = `# ${title}\n\nExample documentation for the weekly report. This is a fictional scenario.\n\n## Procedure\n\n1. Identify the affected system.\n2. Check the relevant settings and logs.\n3. Verify the result and record the outcome.\n`;
        const row = await tx.knowledgeArticle.create({
          data: {
            userId,
            folderId: folder.id,
            title: `[Example] ${title}`,
            summary: "Fictional documentation used to preview weekly activity.",
            body,
            type: index % 2 ? "TROUBLESHOOTING" : "PROCEDURE",
            revision: edited ? 2 : 1,
            createdAt,
            updatedAt: edited ? at(0.8 + index * 0.02) : createdAt,
          },
        });
        await tx.knowledgeArticleRevision.create({
          data: {
            articleId: row.id,
            userId,
            revision: 1,
            title: row.title,
            summary: row.summary,
            body,
            type: row.type,
            tags: [],
            action: "CREATED",
            actorGithubId,
            recordedAt: createdAt,
          },
        });
        if (edited)
          await tx.knowledgeArticleRevision.create({
            data: {
              articleId: row.id,
              userId,
              revision: 2,
              title: row.title,
              summary: row.summary,
              body,
              type: row.type,
              tags: [],
              action: "EDITED",
              actorGithubId,
              recordedAt: at(0.8 + index * 0.02),
            },
          });
        await tx.knowledgeProjectLink.create({
          data: { articleId: row.id, projectId: project.id, userId, actorGithubId },
        });
        articles.push(row.id);
      }
      await article("Check a database backup", 0);
      await article("Investigate a printer connection issue", 1);
      await article("Configure an employee laptop", 2);
      await article("Review the VPN troubleshooting guide", 0, true);
      await article("Update the Docker restart procedure", 1, true);

      // Merge into the existing Examples manifest so none of this fictional money
      // appears in Personal reporting and existing example IDs remain intact.
      const oldDataset = await tx.financialExampleDataset.findUnique({ where: { userId } });
      const manifest = { ...(oldDataset?.manifest ?? {}) };
      function track(key, row) {
        manifest[key] = [
          ...new Set([...(Array.isArray(manifest[key]) ? manifest[key] : []), row.id]),
        ];
        return row;
      }
      async function account(name, type) {
        return track(
          "accountIds",
          await tx.financialAccount.create({
            data: {
              userId,
              name: `[Example] Weekly ${name} ${week}`,
              normalizedName: `[example] weekly ${name} ${week}`.toLowerCase(),
              type,
              currency: "CAD",
              maskedIdentifier: "•••• 0000",
            },
          }),
        );
      }
      const chequing = await account("chequing", "CHEQUING"),
        savings = await account("savings", "SAVINGS"),
        card = await account("credit card", "CREDIT_CARD");
      async function category(name) {
        return track(
          "categoryIds",
          await tx.financeCategory.create({
            data: {
              userId,
              name: `[Example] ${name} ${week}`,
              normalizedName: `[example] ${name} ${week}`.toLowerCase(),
              type: "EXPENSE",
            },
          }),
        );
      }
      const food = await category("Weekly food"),
        books = await category("Weekly books"),
        software = await category("Weekly software");
      async function movement(type, amount, accountId, description, fraction, extra = {}) {
        return track(
          "transactionIds",
          await tx.financialTransaction.create({
            data: {
              userId,
              type,
              amount,
              accountId,
              description: `[Example] ${description}`,
              currency: "CAD",
              occurredOn: dayInstant(day(fraction)),
              notes: "Fictional weekly report example; not a real financial record.",
              ...extra,
            },
          }),
        );
      }
      const deposit = await movement(
        "INCOME",
        "1600",
        chequing.id,
        "Weekly employment deposit",
        0.2,
      );
      const source = track(
        "sourceIds",
        await tx.financialIncomeSource.create({
          data: {
            userId,
            name: `[Example] Cedar IT ${week}`,
            normalizedName: `[example] cedar it ${week}`,
            kind: "EMPLOYMENT",
          },
        }),
      );
      const income = track(
        "incomeIds",
        await tx.financialIncomeRecord.create({
          data: {
            userId,
            sourceId: source.id,
            accountId: chequing.id,
            transactionId: deposit.id,
            description: "[Example] Weekly employment income",
            paidOn: deposit.occurredOn,
            grossAmount: "2000",
            netAmount: "1600",
            currency: "CAD",
            notes: "Fictional pay: 2,000 gross minus 400 deductions equals 1,600 deposited.",
          },
        }),
      );
      for (const [name, amount] of [
        ["Income tax", "250"],
        ["QPP", "110"],
        ["EI", "40"],
      ]) {
        const type = track(
          "deductionTypeIds",
          await tx.financialDeductionType.create({
            data: {
              userId,
              name: `[Example] ${name} ${week}`,
              normalizedName: `[example] ${name} ${week}`.toLowerCase(),
            },
          }),
        );
        await tx.financialIncomeDeduction.create({
          data: { incomeRecordId: income.id, typeId: type.id, amount },
        });
      }
      const expenses = [];
      for (const [description, subtotal, tax, tip, total, payment, cat, fraction] of [
        ["Weekly groceries", "45.50", "0", "0", "45.50", chequing, food, 0.3],
        ["Lunch after work", "15", "2.25", "1.50", "18.75", chequing, food, 0.4],
        ["Japanese study books", "89", "0", "0", "89", card, books, 0.5],
        ["Software subscription", "24.99", "0", "0", "24.99", card, software, 0.6],
      ]) {
        const negative = total.startsWith("-") ? total : `-${total}`;
        const row = await movement("EXPENSE", negative, payment.id, description, fraction, {
          categoryId: cat.id,
          counterparty: `[Example] ${description}`,
        });
        track(
          "receiptIds",
          await tx.financialReceipt.create({
            data: {
              userId,
              accountId: payment.id,
              categoryId: cat.id,
              transactionId: row.id,
              merchant: `[Example] ${description}`,
              purchasedOn: row.occurredOn,
              subtotal,
              tax,
              tip,
              total,
              currency: "CAD",
              notes: "Fictional receipt details; no original document was uploaded.",
            },
          }),
        );
        expenses.push(row);
      }
      await movement("REFUND", "12", chequing.id, "Returned grocery item", 0.7, {
        categoryId: food.id,
      });
      const transfer = await tx.financialTransfer.create({ data: { userId } });
      await movement("TRANSFER", "-100", chequing.id, "Move money to savings", 0.8, {
        transferId: transfer.id,
      });
      await movement("TRANSFER", "100", savings.id, "Move money to savings", 0.8, {
        transferId: transfer.id,
      });
      const statement = track(
        "importIds",
        await tx.financialImport.create({
          data: {
            userId,
            accountId: chequing.id,
            originalName: `[Example] Weekly statement ${week}.csv`,
            fingerprint: createHash("sha256").update(`weekly-statement:${week}`).digest("hex"),
            status: "COMPLETED",
            matchingOnly: true,
            periodStart: dayInstant(week),
            periodEnd: dayInstant(today),
            completedAt: now,
            headers: ["date", "ref #", "description", "amount"],
          },
        }),
      );
      for (const [index, row] of [deposit, expenses[0]].entries()) {
        const normalized = {
          date: row.occurredOn.toISOString().slice(0, 10),
          reference: `WEEKLY-${index + 1}`,
          description: row.description,
          amount: row.amount.toFixed(4),
          currency: "CAD",
          type: row.type,
        };
        await tx.financialImportEntry.create({
          data: {
            importId: statement.id,
            rowKey: `row-${index + 1}`,
            rowNumber: index + 1,
            sourceIdentifier: normalized.reference,
            action: "MATCH",
            transactionId: row.id,
            originalData: {
              date: normalized.date,
              "ref #": normalized.reference,
              description: normalized.description,
              amount: normalized.amount,
            },
            normalized,
          },
        });
      }
      await tx.financialExampleDataset.upsert({
        where: { userId },
        create: { userId, version: 1, manifest: { asOf: today, ...manifest } },
        update: { manifest },
      });
      const summary = {
        week,
        tasks: tasks.length,
        projects: projects.length,
        practices: practices.length,
        articles: articles.length,
        financeTransactions:
          manifest.transactionIds.length -
          (Array.isArray(oldDataset?.manifest?.transactionIds)
            ? oldDataset.manifest.transactionIds.length
            : 0),
        financeDataset: "examples",
        reportUrl: `/weekly-report?week=${week}&dataset=examples`,
      };
      await tx.workMutationReceipt.create({
        data: {
          userId,
          requestKey,
          fingerprint: createHash("sha256").update(`weekly-report-examples:${week}`).digest("hex"),
          operation: "seed:weekly-report-examples",
          result: summary,
        },
      });
      return summary;
    },
    { timeout: 30000 },
  );
  console.log(JSON.stringify(result));
} catch (error) {
  const message =
    error instanceof Error && !error.name.startsWith("Prisma")
      ? error.message
      : "Unable to save the weekly examples. The transaction was rolled back; check the schema and catalogs before retrying.";
  console.error(message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
