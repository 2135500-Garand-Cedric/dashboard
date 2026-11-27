import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { accountModules } from "./helpers/accounts.mjs";

test(
  "invite-only identities, atomic starter copies, ownership, revocation and practice rewards",
  { skip: process.env.RUN_MULTI_USER_DB_TEST !== "1", timeout: 120000 },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const modules = accountModules(db),
      security = modules.load("src/lib/accounts/security.ts"),
      auth = modules.load("src/lib/accounts/identity.ts"),
      setup = modules.load("src/lib/accounts/onboarding.ts"),
      adapter = modules.load("src/lib/accounts/adapter.ts").dashboardAdapter;
    const tag = randomUUID(),
      ids = [],
      tokens = [],
      cats = [],
      words = [];
    let pack;
    async function invitation() {
      const token = security.newToken();
      tokens.push(token);
      await db.userInvitation.create({
        data: {
          label: tag,
          tokenHash: security.hashToken(token),
          expires: new Date(Date.now() + 86400000),
        },
      });
      return token;
    }
    async function signup(subject, invite, provider = "github") {
      return auth.authorizeIdentity({
        provider,
        subject,
        email: null,
        verified: false,
        name: `Learner ${tag}`,
        invite,
      });
    }
    try {
      for (const id of [1, 5, 99])
        await db.activity.upsert({
          where: { id },
          create: { id, activity: id === 5 ? "Kanji writing" : "English to Japanese" },
          update: {},
        });
      const category = await db.category.create({
        data: { userId: 1, name: tag, normalizedName: tag, kind: "KANJI" },
      });
      cats.push(category.id);
      const word = await db.vocabulary.create({
        data: {
          userId: 1,
          categoryId: category.id,
          english: tag,
          japanese: "学",
          hiragana: "がく",
          readings: ["がく", "まなぶ"],
          starred: true,
        },
      });
      words.push(word.id);
      const link = await db.activityVocab.create({
        data: {
          userId: 1,
          vocabId: word.id,
          activityId: 1,
          status: "PERFECT",
          lastPracticed: new Date(),
        },
      });
      pack = await setup.publishStarter(db);
      const ownerBefore = await db.vocabulary.findUnique({
        where: { id: word.id },
        include: { activityVocab: true },
      });
      await t.test(
        "no invite, consumed/revoked/expired invites and automatic linking are rejected",
        async () => {
          assert.equal(await signup(`no-${tag}`), false);
          const invite = await invitation();
          assert.equal(await signup(`a-${tag}`, invite), true);
          const a = await db.authAccount.findUnique({
            where: {
              provider_providerAccountId: { provider: "github", providerAccountId: `a-${tag}` },
            },
          });
          ids.push(a.userId);
          assert.equal(await signup(`other-${tag}`, invite), false);
          assert.equal(
            await signup(`a-${tag}`, invite),
            true,
            "returning account must not need an invite",
          );
          const expired = await invitation();
          await db.userInvitation.update({
            where: { tokenHash: security.hashToken(expired) },
            data: { expires: new Date(0) },
          });
          assert.equal(await signup(`expired-${tag}`, expired), false);
          const revoked = await invitation();
          await db.userInvitation.update({
            where: { tokenHash: security.hashToken(revoked) },
            data: { revokedAt: new Date() },
          });
          assert.equal(await signup(`revoked-${tag}`, revoked), false);
          const inviteB = await invitation();
          assert.equal(await signup(`b-${tag}`, inviteB), true);
          const b = await db.authAccount.findUnique({
            where: {
              provider_providerAccountId: { provider: "github", providerAccountId: `b-${tag}` },
            },
          });
          ids.push(b.userId);
          const sessionToken = security.newToken();
          await adapter.createSession({
            userId: String(a.userId),
            sessionToken,
            expires: new Date(Date.now() + 3600000),
          });
          assert.equal(
            await auth.authorizeIdentity({
              provider: "google",
              subject: `google-${tag}`,
              email: null,
              verified: false,
              name: null,
              currentSession: sessionToken,
            }),
            false,
          );
          const session = await db.authSession.findUnique({
            where: { tokenHash: security.hashToken(sessionToken) },
          });
          const intent = security.newToken();
          await db.authLinkIntent.create({
            data: {
              tokenHash: security.hashToken(intent),
              userId: a.userId,
              sessionId: session.id,
              provider: "google",
              expires: new Date(Date.now() + 60000),
            },
          });
          assert.equal(
            await auth.authorizeIdentity({
              provider: "google",
              subject: `google-${tag}`,
              email: null,
              verified: false,
              name: null,
              currentSession: sessionToken,
              link: intent,
            }),
            true,
          );
          assert.equal(await db.authAccount.count({ where: { userId: a.userId } }), 2);
          await db.user.update({ where: { id: a.userId }, data: { active: false } });
          assert.equal(await adapter.getSessionAndUser(sessionToken), null);
          assert.equal(await signup(`a-${tag}`), false);
          await db.user.update({ where: { id: a.userId }, data: { active: true } });
          await adapter.deleteSession(sessionToken);
          assert.equal(await adapter.getSessionAndUser(sessionToken), null);
        },
      );
      const [a, b] = ids;
      await t.test(
        "full starter copy is independent, retry safe, and resets statuses/timers/rewards",
        async () => {
          const initial = { choice: "PACK", timeZone: "Asia/Tokyo", name: "Learner A" };
          const started = performance.now();
          await Promise.all([
            setup.initializeJapanese(a, initial),
            setup.initializeJapanese(a, initial),
          ]);
          const again = await setup.initializeJapanese(a, initial);
          assert.equal(again.packVersionId, pack.id);
          assert.equal(await db.vocabulary.count({ where: { userId: a } }), pack.wordCount);
          const copy = await db.vocabulary.findFirst({
            where: { userId: a, english: tag },
            include: { activityVocab: true, category: true },
          });
          assert.notEqual(copy.id, word.id);
          assert.notEqual(copy.categoryId, category.id);
          assert.deepEqual(copy.readings, ["がく", "まなぶ"]);
          assert.equal(copy.starred, false);
          assert.ok(
            copy.activityVocab.every(
              (row) => row.userId === a && row.status === "WEAK" && row.lastPracticed === null,
            ),
          );
          assert.equal((await db.user.findUnique({ where: { id: a } })).totalXp, 0);
          assert.equal(await db.practice.count({ where: { userId: a } }), 0);
          assert.deepEqual(
            await db.vocabulary.findUnique({
              where: { id: word.id },
              include: { activityVocab: true },
            }),
            ownerBefore,
          );
          console.log(
            `Starter copied ${pack.wordCount} words in ${(performance.now() - started).toFixed(0)} ms`,
          );
          const failedCopy = accountModules(db, {
            "@/lib/japanese/kanji-writing": {
              getKnownKanji() {
                throw new Error("Simulated copy failure after vocabulary insert");
              },
            },
          }).load("src/lib/accounts/onboarding.ts");
          await assert.rejects(failedCopy.initializeJapanese(b, initial), /Simulated copy failure/);
          assert.equal(await db.vocabulary.count({ where: { userId: b } }), 0);
          assert.equal(await db.category.count({ where: { userId: b } }), 0);
          assert.equal(await db.verbForm.count({ where: { userId: b } }), 0);
          assert.equal(await db.japaneseInitialization.count({ where: { userId: b } }), 0);
          await setup.initializeJapanese(b, {
            choice: "EMPTY",
            timeZone: "UTC",
            name: "Learner B",
          });
          assert.equal(await db.vocabulary.count({ where: { userId: b } }), 0);
          assert.ok((await db.category.count({ where: { userId: b } })) > 0);
          await assert.rejects(
            db.vocabulary.update({
              where: { id: copy.id, userId: a },
              data: { categoryId: category.id },
            }),
            /Foreign key/,
          );
          await assert.rejects(
            db.activityVocab.update({
              where: { id: copy.activityVocab[0].id },
              data: { userId: b },
            }),
            /Foreign key/,
          );
          await db.vocabulary.update({
            where: { id: copy.id, userId: a },
            data: { english: `edited-${tag}` },
          });
          assert.equal((await db.vocabulary.findUnique({ where: { id: word.id } })).english, tag);
        },
      );
      await t.test(
        "member sessions cannot authorize owner routes or foreign practice results",
        async () => {
          const raw = security.newToken();
          await adapter.createSession({
            userId: String(a),
            sessionToken: raw,
            expires: new Date(Date.now() + 3600000),
          });
          const sessionRow = await db.authSession.findUnique({
            where: { tokenHash: security.hashToken(raw) },
          });
          let current = { authUserId: a, sessionId: sessionRow.id };
          const tools = accountModules(db, {
            "next-auth/next": { getServerSession: async () => current },
            "@/lib/auth": { authOptions: {} },
            "./auth": { authOptions: {} },
          });
          const access = tools.load("src/lib/accounts/access.ts"),
            guard = tools.load("src/lib/require-owner.ts");
          assert.equal((await guard.requireOwner()).status, 403);
          assert.equal(await access.requirePermission("japanese.practice"), null);
          await db.userPermission.deleteMany({
            where: { userId: a, capability: "japanese.practice" },
          });
          assert.equal((await access.requirePermission("japanese.practice")).status, 403);
          await db.userPermission.create({ data: { userId: a, capability: "japanese.practice" } });
          const service = tools.load("src/lib/japanese/practice-sessions.ts");
          const actor = await access.getActor();
          const own = await db.activityVocab.findFirst({
            where: { userId: a, activityId: 1 },
            include: { vocab: true },
          });
          const input = {
            sessionKey: randomUUID(),
            activity: 1,
            categories: [],
            starredOnly: false,
            startedAt: new Date(Date.now() - 10000).toISOString(),
            completedAt: new Date().toISOString(),
            updates: [{ activityVocabId: own.id, status: "PERFECT" }],
          };
          await modules.context.runAsActor(actor, () => service.savePracticeSession(input, a));
          await modules.context.runAsActor(actor, () => service.savePracticeSession(input, a));
          assert.equal(
            await db.practice.count({ where: { userId: a, sessionKey: input.sessionKey } }),
            1,
          );
          assert.equal((await db.user.findUnique({ where: { id: a } })).totalXp, 2);
          assert.equal(
            await db.auditEvent.count({
              where: {
                userId: a,
                eventKey: `practice:${input.sessionKey}`,
                actorKind: "USER",
                actorUserId: a,
              },
            }),
            1,
          );
          await assert.rejects(
            modules.context.runAsActor(actor, () =>
              service.savePracticeSession(
                {
                  ...input,
                  sessionKey: randomUUID(),
                  updates: [{ activityVocabId: link.id, status: "WEAK" }],
                },
                a,
              ),
            ),
            /does not belong|not available|not belong/,
          );
          const route = tools.load("src/app/api/japanese-practice/practices/route.ts");
          const response = await route.GET();
          assert.equal(response.status, 200);
          const json = await response.json();
          assert.equal(json.practices.length, 1);
          const categoryRoute = tools.load("src/app/api/japanese-practice/categories/route.ts");
          const categories = await (await categoryRoute.GET()).json();
          assert.ok(categories.categories.every((row) => row.id !== category.id));
          const uncategorized = await db.vocabulary.create({
            data: { userId: a, english: `Uncategorized ${tag}`, japanese: "あ", hiragana: "あ" },
          });
          const vocabularyRoute = tools.load(
            "src/app/api/japanese-practice/vocabulary/[id]/route.ts",
          );
          const edited = await vocabularyRoute.PATCH(
            new Request("http://localhost/api/japanese-practice/vocabulary/1", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ starred: true, userId: 1 }),
            }),
            { params: Promise.resolve({ id: String(uncategorized.id) }) },
          );
          assert.equal(edited.status, 200, "legacy uncategorized copies remain editable");
          assert.equal(
            (await db.vocabulary.findUnique({ where: { id: uncategorized.id } })).userId,
            a,
          );
          const foreignRead = await vocabularyRoute.GET(new Request("http://localhost/api/test"), {
            params: Promise.resolve({ id: String(word.id) }),
          });
          assert.equal(foreignRead.status, 404);
          await db.user.update({ where: { id: a }, data: { active: false } });
          assert.equal((await access.requirePermission("japanese.practice")).status, 401);
          current = null;
          assert.equal((await access.requirePermission("japanese.practice")).status, 401);
        },
      );
      await t.test(
        "partial practice saves only rated words and prorates rewards exactly once",
        async () => {
          await db.user.update({ where: { id: a }, data: { active: true } });
          const links = await db.activityVocab.findMany({
            where: { userId: a, activityId: 1, lastPracticed: null },
            take: 6,
            orderBy: { id: "asc" },
          });
          assert.equal(links.length, 6);
          const actor = {
            id: a,
            role: "MEMBER",
            timeZone: "UTC",
            permissions: [],
            initialized: true,
          };
          const service = modules.load("src/lib/japanese/practice-sessions.ts");
          const before = await db.user.findUnique({ where: { id: a } });
          const statuses = ["GOOD", "PERFECT", "WEAK", "GOOD", "PERFECT"];
          const input = {
            sessionKey: randomUUID(),
            activity: 1,
            categories: [],
            starredOnly: false,
            startedAt: new Date(Date.now() - 30000).toISOString(),
            completedAt: new Date().toISOString(),
            updates: links
              .slice(0, 5)
              .map((link, i) => ({ activityVocabId: link.id, status: statuses[i] })),
          };
          const review = await modules.context.runAsActor(actor, () =>
            service.savePracticeSession(input, a),
          );
          await modules.context.runAsActor(actor, () => service.savePracticeSession(input, a));
          assert.equal(review.wordCount, 5);
          assert.deepEqual(
            review.words.map((w) => w.activityVocabId),
            input.updates.map((w) => w.activityVocabId),
          );
          assert.equal(review.xpEarned, 6);
          assert.equal(review.goldEarned, 1);
          const after = await db.user.findUnique({ where: { id: a } });
          assert.equal(after.totalXp - before.totalXp, 6);
          assert.equal(after.coins - before.coins, 1);
          assert.deepEqual(
            await db.activityVocab.findUnique({ where: { id: links[5].id } }),
            links[5],
          );
          const saved = await db.activityVocab.findMany({
            where: { id: { in: links.slice(0, 5).map((link) => link.id) } },
            orderBy: { id: "asc" },
          });
          assert.deepEqual(
            saved.map((link) => link.status),
            statuses,
          );
          assert.ok(saved.every((link) => link.lastPracticed.toISOString() === input.completedAt));
        },
      );
      await t.test(
        "protected default categories and dictionary-only practice remain user scoped",
        async () => {
          const token = security.newToken();
          await adapter.createSession({
            userId: String(b),
            sessionToken: token,
            expires: new Date(Date.now() + 3600000),
          });
          const login = await db.authSession.findUnique({
            where: { tokenHash: security.hashToken(token) },
          });
          const tools = accountModules(db, {
            "next-auth/next": {
              getServerSession: async () => ({ authUserId: b, sessionId: login.id }),
            },
            "@/lib/auth": { authOptions: {} },
            "./auth": { authOptions: {} },
          });
          const defaults = await db.category.findMany({ where: { userId: b, isDefault: true } });
          assert.deepEqual(defaults.map((c) => c.name).sort(), ["Kanji", "Verb"]);
          const verb = defaults.find((c) => c.kind === "VERB");
          const categoryRoute = tools.load(
            "src/app/api/japanese-practice/categories/[id]/route.ts",
          );
          const request = (method, body) =>
            new Request("http://localhost/api/test", {
              method,
              ...(body
                ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
                : {}),
            });
          assert.equal(
            (
              await categoryRoute.PATCH(request("PATCH", { name: "Renamed" }), {
                params: Promise.resolve({ id: String(verb.id) }),
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await categoryRoute.DELETE(request("DELETE"), {
                params: Promise.resolve({ id: String(verb.id) }),
              })
            ).status,
            403,
          );
          const add = tools.load("src/app/api/japanese-practice/vocabulary/add/route.ts");
          const added = await add.POST(
            request("POST", {
              english: `Eat ${tag}`,
              japanese: "食べる",
              hiragana: "たべる",
              categoryId: verb.id,
              starred: false,
              verbType: "ru",
            }),
          );
          assert.equal(added.status, 200);
          const route = tools.load("src/app/api/japanese-practice/vocabulary/route.ts");
          const select = async (categories) => {
            const response = await route.POST(
              request("POST", { activity: 1, categories, nbWords: 1000, starredOnly: false }),
            );
            assert.equal(response.status, 200);
            return (await response.json()).words;
          };
          const dictionary = await select([-1]);
          assert.equal(dictionary.length, 1);
          assert.equal(dictionary[0].japanese, "食べる");
          const all = await select([verb.id]);
          const both = await select([-1, verb.id]);
          assert.ok(all.length > 1);
          assert.deepEqual(
            both.map((w) => w.id).sort((a, b) => a - b),
            all.map((w) => w.id).sort((a, b) => a - b),
          );
          assert.equal(new Set(both.map((w) => w.id)).size, both.length);
          const actor = await tools.load("src/lib/accounts/access.ts").getActor();
          const service = tools.load("src/lib/japanese/practice-sessions.ts");
          const input = {
            sessionKey: randomUUID(),
            activity: 1,
            categories: [-1],
            starredOnly: false,
            startedAt: new Date(Date.now() - 5000).toISOString(),
            completedAt: new Date().toISOString(),
            updates: [{ activityVocabId: dictionary[0].id, status: "GOOD" }],
          };
          const saved = await modules.context.runAsActor(actor, () =>
            service.savePracticeSession(input, b),
          );
          assert.equal(saved.selectedCategories[0].name, "Verb (dict only)");
          assert.equal(
            (await modules.context.runAsActor(actor, () => service.savePracticeSession(input, b)))
              .id,
            saved.id,
          );
          const form = all.find((w) => w.id !== dictionary[0].id);
          await assert.rejects(
            () =>
              modules.context.runAsActor(actor, () =>
                service.savePracticeSession(
                  {
                    ...input,
                    sessionKey: randomUUID(),
                    updates: [{ activityVocabId: form.id, status: "PERFECT" }],
                  },
                  b,
                ),
              ),
            /does not belong/,
          );
        },
      );
    } finally {
      await db.auditEvent.deleteMany({ where: { userId: { in: ids } } });
      await db.userInvitation.deleteMany({ where: { label: tag } });
      await db.authLinkIntent.deleteMany({ where: { userId: { in: ids } } });
      await db.vocabulary.deleteMany({ where: { userId: { in: ids } } });
      await db.category.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.vocabulary.deleteMany({ where: { id: { in: words } } });
      await db.category.deleteMany({ where: { id: { in: cats } } });
      if (pack) await db.vocabularyPackVersion.delete({ where: { id: pack.id } });
      await db.$disconnect();
    }
  },
);
