import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { samplePng } from "./helpers/work-support.mjs";
import { unzipSync, strFromU8 } from "fflate";

test(
  "Knowledge articles preserve work history, enforce ownership, export privately and survive retries",
  { skip: process.env.RUN_KNOWLEDGE_DB_TEST !== "1", timeout: 120000 },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient(),
      services = loadWorkServices(db),
      api = services.knowledge;
    const cmd = (revision) => ({ requestKey: randomUUID(), ...(revision ? { revision } : {}) });
    const title = `Knowledge test ${randomUUID()}`;
    let article, other, task, project, secondProject, file;
    try {
      await db.user.upsert({
        where: { id: 1 },
        create: { id: 1, email: "knowledge-owner@example.test" },
        update: {},
      });
      const foreign = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
      project = await services.projects.createProject({ name: title }, cmd());
      secondProject = await services.projects.createProject({ name: `${title} other` }, cmd());
      task = await services.server.createTodo({ title, projectId: project.id }, cmd());
      await services.supporting.createNote(
        task.id,
        { body: "Incident timeline remains unchanged." },
        cmd(),
      );
      other = await api.saveArticle(
        null,
        { title: `${title} reference`, body: "A reusable guide." },
        cmd(),
      );
      const content = {
        title,
        summary: "VPN troubleshooting",
        body: `## Solution\n\nResolve ERR_VPN-0x800.\n\n[Guide](/knowledge/${other.id})\n\n\`[not a link](/knowledge/999999)\`\n\n\`\`\`sh\n[not a link](/knowledge/999998)\n\`\`\``,
        type: "TROUBLESHOOTING",
        tags: ["VPN", "vpn", "Network"],
        taskId: task.id,
        projectId: project.id,
      };
      const create = cmd();
      article = await api.saveArticle(null, content, create);
      await t.test(
        "atomic create is retry-safe, tags dedupe and work is linked both ways",
        async () => {
          assert.equal((await api.saveArticle(null, content, create)).id, article.id);
          const detail = await api.articleDetail(article.id);
          assert.equal(detail.tasks[0].id, task.id);
          assert.equal(detail.projects[0].id, project.id);
          assert.equal(detail.tags.length, 2);
          assert.equal(detail.outgoing.length, 1);
          assert.equal((await api.articleDetail(other.id)).backlinks[0].id, article.id);
          assert.equal((await api.workArticles("task", task.id)).items[0].id, article.id);
          const initial = await services.taskDetails.readTaskDetails(task.id);
          assert.equal(
            initial.initial[`/api/knowledge/work?kind=task&id=${task.id}&page=1`].data.total,
            1,
          );
          assert.equal(await db.workNote.count({ where: { todoId: task.id } }), 1);
          assert.equal((await db.todo.findUnique({ where: { id: task.id } })).status, "NEW");
        },
      );
      await t.test(
        "error-message, body and tag searches find the article and paginate",
        async () => {
          for (const q of ["ERR_VPN-0x800", "Network", "Resolve", title]) {
            assert.ok(
              (await api.listArticles(new URLSearchParams({ q }))).items.some(
                (row) => row.id === article.id,
              ),
            );
          }
          assert.equal(
            (await api.listArticles(new URLSearchParams({ q: title, page: "2" }))).items.length,
            0,
          );
          await assert.rejects(() => api.listArticles(new URLSearchParams({ page: "0" })));
        },
      );
      await t.test(
        "simultaneous edits reject stale versions and restore rebuilds backlinks",
        async () => {
          const edited = {
            ...content,
            taskId: undefined,
            projectId: undefined,
            body: "Changed body",
            tags: ["Edited"],
          };
          const results = await Promise.allSettled([
            api.saveArticle(article.id, edited, cmd(1)),
            api.saveArticle(article.id, edited, cmd(1)),
          ]);
          assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
          assert.equal((await api.articleDetail(other.id)).backlinks.length, 0);
          await api.saveArticle(article.id, { restoreRevision: 1 }, cmd(2));
          const restored = await api.articleDetail(article.id);
          assert.equal(restored.revision, 3);
          assert.equal(restored.body, content.body);
          assert.equal(restored.tasks.length, 1);
          assert.equal((await api.articleDetail(other.id)).backlinks.length, 1);
          await api.saveArticle(
            other.id,
            { title: "Renamed title", body: "Still the same article", archived: true },
            cmd(1),
          );
          assert.equal((await api.articleDetail(article.id)).outgoing[0].title, "Renamed title");
          assert.ok((await api.articleDetail(article.id)).outgoing[0].archivedAt);
        },
      );
      await t.test("linked task capture is atomic and retry-safe", async () => {
        const create = cmd();
        const captured = await services.server.createTodo(
          { title: "Review VPN procedure", knowledgeArticleId: article.id },
          create,
        );
        assert.equal(
          (
            await services.server.createTodo(
              { title: "Review VPN procedure", knowledgeArticleId: article.id },
              create,
            )
          ).id,
          captured.id,
        );
        assert.equal((await api.workArticles("task", captured.id)).items[0].id, article.id);
        await assert.rejects(
          () =>
            services.server.createTodo(
              { title: `Invalid procedure task ${title}`, knowledgeArticleId: 2147483647 },
              cmd(),
            ),
          /not found/,
        );
        assert.equal(
          await db.todo.count({ where: { userId: 1, title: `Invalid procedure task ${title}` } }),
          0,
        );
        assert.equal(
          (await api.listArticles(new URLSearchParams({ q: `' OR 1=1 -- ${randomUUID()}` }))).total,
          0,
        );
      });
      await t.test(
        "missing/wrong-owner links roll back and database FKs enforce owners",
        async () => {
          const privateArticle = await db.knowledgeArticle.create({
            data: { userId: foreign.id, title: "Foreign" },
          });
          await assert.rejects(() => api.articleDetail(privateArticle.id), /not found/);
          await assert.rejects(
            () =>
              api.saveArticle(
                null,
                { title: "Bad link", body: `[no](/knowledge/${privateArticle.id})` },
                cmd(),
              ),
            /missing or unavailable/,
          );
          await assert.rejects(
            () => api.saveArticle(null, { title: "Bad task", taskId: 2147483647 }, cmd()),
            /not found/,
          );
          assert.equal(
            await db.knowledgeArticle.count({ where: { title: "Bad task", userId: 1 } }),
            0,
          );
          await assert.rejects(() =>
            db.knowledgeArticleLink.create({
              data: { sourceId: article.id, targetId: privateArticle.id, userId: 1 },
            }),
          );
          await db.knowledgeArticle.delete({ where: { id: privateArticle.id } });
        },
      );
      await t.test(
        "indirect project articles follow task membership without copied links",
        async () => {
          await api.changeWorkLink(
            article.id,
            { kind: "project", id: project.id, linked: false },
            cmd(),
          );
          assert.equal(
            (await api.workArticles("project", project.id, new URLSearchParams({ indirect: "1" })))
              .items[0].id,
            article.id,
          );
          const current = await services.server.getTodo(task.id);
          await services.projects.taskMembership(
            task.id,
            { projectId: secondProject.id, stageId: null },
            cmd(current.revision),
          );
          assert.equal(
            (await api.workArticles("project", project.id, new URLSearchParams({ indirect: "1" })))
              .total,
            0,
          );
          assert.equal(
            (
              await api.workArticles(
                "project",
                secondProject.id,
                new URLSearchParams({ indirect: "1" }),
              )
            ).total,
            1,
          );
          await api.changeWorkLink(article.id, { kind: "task", id: task.id, linked: true }, cmd());
          assert.equal(
            await db.knowledgeTaskLink.count({ where: { articleId: article.id, todoId: task.id } }),
            1,
          );
        },
      );
      await t.test(
        "private files use existing work storage with integrity, export and cleanup",
        async () => {
          // Services run through the same TypeScript loader as API commands.
          const { supportModules } = await import("./helpers/work-support.mjs");
          const primitives = supportModules(db).primitives;
          const prepared = await primitives.prepareDocument(
            new File([samplePng], "screenshot.png", { type: "image/png" }),
          );
          const upload = cmd();
          file = await services.supporting.uploadAttachment(
            { knowledgeArticleId: article.id },
            prepared,
            upload,
          );
          assert.equal(
            (
              await services.supporting.uploadAttachment(
                { knowledgeArticleId: article.id },
                prepared,
                upload,
              )
            ).id,
            file.id,
          );
          assert.equal(
            (await services.supporting.readAttachment({ knowledgeArticleId: article.id }, file.id))
              .buffer.length,
            samplePng.length,
          );
          await assert.rejects(
            () => services.supporting.readAttachment(task.id, file.id),
            /not found/,
          );
          const storedBefore = await db.workAttachment.findUnique({ where: { id: file.id } });
          const renameCommand = cmd(file.revision);
          const renamed = await services.supporting.renameAttachment(
            { knowledgeArticleId: article.id },
            file.id,
            { name: "VPN troubleshooting.png" },
            renameCommand,
          );
          assert.equal(
            (
              await services.supporting.renameAttachment(
                { knowledgeArticleId: article.id },
                file.id,
                { name: "VPN troubleshooting.png" },
                renameCommand,
              )
            ).revision,
            renamed.revision,
            "rename retry must not create another revision",
          );
          await assert.rejects(
            () =>
              services.supporting.renameAttachment(
                { knowledgeArticleId: article.id },
                file.id,
                { name: "Old version.png" },
                cmd(file.revision),
              ),
            /changed|version|Reload/i,
          );
          file = renamed;
          const storedAfter = await db.workAttachment.findUnique({ where: { id: file.id } });
          assert.equal(storedAfter.storageKey, storedBefore.storageKey);
          assert.equal(storedAfter.contentHash, storedBefore.contentHash);
          assert.equal(file.originalName, "VPN troubleshooting.png");
          assert.deepEqual(
            (await services.supporting.readAttachment({ knowledgeArticleId: article.id }, file.id))
              .buffer,
            samplePng,
          );
          await assert.rejects(
            () =>
              services.supporting.renameAttachment(
                task.id,
                file.id,
                { name: "Wrong parent.png" },
                cmd(file.revision),
              ),
            /not found/,
          );
          await assert.rejects(
            () =>
              services.supporting.renameAttachment(
                { knowledgeArticleId: article.id },
                file.id,
                { name: "../bad.png" },
                cmd(file.revision),
              ),
            /slashes/,
          );
          const bytes = await services.knowledgeExport.exportKnowledge();
          const files = unzipSync(bytes),
            manifest = JSON.parse(strFromU8(files["manifest.json"]));
          assert.ok(
            manifest.articles.some((row) => row.id === article.id && row.attachments.length === 1),
          );
          assert.ok(
            strFromU8(files[`article-${article.id}.md`]).includes(`](article-${other.id}.md)`),
          );
          assert.ok(
            strFromU8(files[`article-${article.id}.md`]).includes(
              "[not a link](/knowledge/999998)",
            ),
          );
          const current = await api.articleDetail(article.id);
          await api.saveArticle(article.id, { restoreRevision: 1 }, cmd(current.revision));
          assert.ok(
            (await services.supporting.readAttachment({ knowledgeArticleId: article.id }, file.id))
              .buffer.length,
          );
          await services.supporting.removeAttachment(
            { knowledgeArticleId: article.id },
            file.id,
            cmd(file.revision),
          );
          await assert.rejects(
            () => services.supporting.readAttachment({ knowledgeArticleId: article.id }, file.id),
            /removed/,
          );
          assert.equal(
            (
              await services.supporting.listAttachments(
                { knowledgeArticleId: article.id },
                new URLSearchParams(),
              )
            ).items[0].cleanupPending,
            false,
          );
        },
      );
      await db.user.delete({ where: { id: foreign.id } });
    } finally {
      // This test is explicitly confined to the disposable database. Keep fixtures
      // for browser testing; they also exercise archive and search with real data.
      await db.$disconnect();
    }
  },
);
