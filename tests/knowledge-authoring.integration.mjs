import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { supportModules, samplePng } from "./helpers/work-support.mjs";
test(
  "Knowledge creation supports templates, work links and private inline image drafts atomically",
  { skip: process.env.RUN_KNOWLEDGE_AUTHORING_DB_TEST !== "1", timeout: 120000 },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js"),
      db = new PrismaClient({ log: [] });
    const {
      knowledge: articles,
      knowledgeImages: images,
      knowledgeTemplates: templates,
      knowledgeExport,
      server,
      projects,
      supporting,
    } = loadWorkServices(db);
    const primitives = supportModules(db).primitives,
      prepared = await primitives.prepareDocument(
        new File([samplePng], "diagram.png", { type: "image/png" }),
      );
    const cmd = (revision) => ({ requestKey: randomUUID(), ...(revision ? { revision } : {}) }),
      prefix = `Author ${randomUUID().slice(0, 8)}`;
    let draft, image, article;
    try {
      await db.user.upsert({
        where: { id: 1 },
        create: { id: 1, email: "authoring-owner@example.test" },
        update: {},
      });
      const task = await server.createTodo({ title: `${prefix} task` }, cmd()),
        project = await projects.createProject({ name: `${prefix} project` }, cmd());
      await t.test(
        "custom templates are editable, version checked and independent of articles",
        async () => {
          const request = cmd(),
            body = { name: `${prefix} procedure`, body: "## Steps\n\n- ", type: "PROCEDURE" };
          const row = await templates.saveTemplate(null, body, request);
          assert.equal((await templates.saveTemplate(null, body, request)).id, row.id);
          await assert.rejects(
            () => templates.saveTemplate(null, { ...body, name: body.name.toUpperCase() }, cmd()),
            /already exists/,
          );
          await templates.saveTemplate(
            row.id,
            { ...body, body: "## Updated\n", archived: true },
            cmd(1),
          );
          await assert.rejects(() => templates.saveTemplate(row.id, body, cmd(1)), /changed/);
          assert.equal(
            (await templates.listTemplates(new URLSearchParams({ q: prefix }))).total,
            0,
          );
          assert.equal(
            (await templates.listTemplates(new URLSearchParams({ q: prefix, archived: "1" })))
              .items[0].id,
            row.id,
          );
          await templates.saveTemplate(row.id, body, cmd(2));
          assert.equal((await templates.readTemplate(row.id)).body, body.body);
        },
      );
      await t.test(
        "images preview privately before any article is created and uploads retry safely",
        async () => {
          const before = await db.knowledgeArticle.count();
          const request = cmd();
          draft = await images.createImageDraft({ id: randomUUID() }, request);
          const upload = cmd();
          image = await images.uploadInlineImage({ knowledgeDraftId: draft.id }, prepared, upload);
          assert.equal(
            (await images.uploadInlineImage({ knowledgeDraftId: draft.id }, prepared, upload)).id,
            image.id,
          );
          assert.equal(await db.knowledgeArticle.count(), before);
          assert.equal((await images.readInlineImage(image.id)).buffer.length, samplePng.length);
          assert.equal((await images.listInlineImages({ knowledgeDraftId: draft.id })).length, 1);
          await assert.rejects(
            () =>
              images.uploadInlineImage(
                { knowledgeDraftId: draft.id },
                { ...prepared, mimeType: "application/pdf" },
                cmd(),
              ),
            /Choose a/,
          );
          const body = `![diagram](/api/knowledge/images/${image.id}/file)`;
          await assert.rejects(
            () =>
              templates.saveTemplate(
                null,
                { name: `${prefix} unfinished`, body, type: "REFERENCE" },
                cmd(),
              ),
            /image/,
          );
        },
      );
      await t.test(
        "article, task/project links and draft image claiming save in one retry-safe transaction",
        async () => {
          const body = {
            title: `${prefix} guide`,
            body: `## Diagram\n\n![diagram](/api/knowledge/images/${image.id}/file)`,
            draftId: draft.id,
            taskIds: [task.id, task.id],
            projectIds: [project.id],
          };
          await assert.rejects(
            () => articles.saveArticle(null, { ...body, projectIds: [2147483647] }, cmd()),
            /not found/,
          );
          assert.equal(await db.knowledgeArticle.count({ where: { title: body.title } }), 0);
          assert.equal(
            (await db.workAttachment.findUnique({ where: { id: image.id } })).knowledgeDraftId,
            draft.id,
          );
          const request = cmd();
          article = await articles.saveArticle(null, body, request);
          assert.equal((await articles.saveArticle(null, body, request)).id, article.id);
          await assert.rejects(() => articles.saveArticle(null, body, cmd()), /already been saved/);
          const detail = await articles.articleDetail(article.id);
          assert.equal(detail.tasks.length, 1);
          assert.equal(detail.projects.length, 1);
          const stored = await db.workAttachment.findUnique({ where: { id: image.id } });
          assert.equal(stored.knowledgeArticleId, article.id);
          assert.equal(stored.knowledgeDraftId, null);
          assert.equal(stored.inlineImage, true);
          assert.equal(
            (
              await supporting.listAttachments(
                { knowledgeArticleId: article.id },
                new URLSearchParams(),
              )
            ).total,
            0,
          );
          await images.discardImageDraft(draft.id);
          assert.equal((await images.readInlineImage(image.id)).buffer.length, samplePng.length);
          await templates.saveTemplate(
            null,
            { name: `${prefix} with diagram`, body: detail.body, type: "REFERENCE" },
            cmd(),
          );
        },
      );
      await t.test(
        "image mutations respect parent revisions and export embedded originals",
        async () => {
          const current = await articles.articleDetail(article.id);
          await articles.saveArticle(
            article.id,
            { title: current.title, body: current.body + "\nOther edit" },
            cmd(current.revision),
          );
          await assert.rejects(
            () =>
              images.uploadInlineImage(
                { knowledgeArticleId: article.id },
                prepared,
                cmd(current.revision),
              ),
            /changed/,
          );
          const fresh = await articles.articleDetail(article.id),
            upload = cmd(fresh.revision);
          const second = await images.uploadInlineImage(
            { knowledgeArticleId: article.id },
            prepared,
            upload,
          );
          assert.equal(second.articleRevision, fresh.revision + 1);
          assert.equal(
            (await images.uploadInlineImage({ knowledgeArticleId: article.id }, prepared, upload))
              .id,
            second.id,
          );
          const text = fresh.body + `\n![second](/api/knowledge/images/${second.id}/file)`;
          await articles.saveArticle(
            article.id,
            { title: fresh.title, body: text },
            cmd(second.articleRevision),
          );
          const zip = unzipSync(await knowledgeExport.exportKnowledge(article.id)),
            manifest = JSON.parse(strFromU8(zip["manifest.json"]));
          assert.equal(manifest.articles[0].attachments.filter((row) => row.inlineImage).length, 2);
          const markdown = strFromU8(zip[`article-${article.id}.md`]);
          assert.ok(!markdown.includes(`/api/knowledge/images/${second.id}/file`));
          assert.ok(markdown.includes("attachments/"));
          let detail = await articles.articleDetail(article.id);
          await articles.saveArticle(
            article.id,
            { title: detail.title, body: fresh.body },
            cmd(detail.revision),
          );
          detail = await articles.articleDetail(article.id);
          await assert.rejects(
            () => images.removeInlineImage(second.id, cmd(second.revision), detail.revision - 1),
            /changed/,
          );
          const removed = await images.removeInlineImage(
            second.id,
            cmd(second.revision),
            detail.revision,
          );
          assert.equal(removed.articleRevision, detail.revision + 1);
          await assert.rejects(() => images.readInlineImage(second.id), /not found/);
        },
      );
      await t.test(
        "expired and discarded drafts clean original files without touching published images",
        async () => {
          const pending = await images.createImageDraft({ id: randomUUID() }, cmd());
          const photo = await images.uploadInlineImage(
            { knowledgeDraftId: pending.id },
            prepared,
            cmd(),
          );
          const key = (await db.workAttachment.findUnique({ where: { id: photo.id } })).storageKey;
          await images.discardImageDraft(pending.id);
          await images.discardImageDraft(pending.id);
          assert.equal(await db.knowledgeDraft.count({ where: { id: pending.id } }), 0);
          await assert.rejects(() => images.readInlineImage(photo.id), /not found/);
          await assert.rejects(() => supportModules(db).files.workFileStore().read(key));
          const expired = await images.createImageDraft({ id: randomUUID() }, cmd());
          const old = await images.uploadInlineImage(
            { knowledgeDraftId: expired.id },
            prepared,
            cmd(),
          );
          await db.knowledgeDraft.update({
            where: { id: expired.id },
            data: { updatedAt: new Date(Date.now() - 26 * 3600000) },
          });
          await images.cleanupImageDrafts();
          await assert.rejects(() => images.readInlineImage(old.id), /not found/);
          assert.equal((await images.readInlineImage(image.id)).buffer.length, samplePng.length);
        },
      );
      await t.test("ownership and draft boundaries are enforced", async () => {
        const one = await images.createImageDraft({ id: randomUUID() }, cmd()),
          two = await images.createImageDraft({ id: randomUUID() }, cmd());
        const photo = await images.uploadInlineImage({ knowledgeDraftId: one.id }, prepared, cmd());
        await assert.rejects(
          () =>
            articles.saveArticle(
              null,
              {
                title: "Wrong draft",
                draftId: two.id,
                body: `![image](/api/knowledge/images/${photo.id}/file)`,
              },
              cmd(),
            ),
          /another unfinished draft/,
        );
        const foreign = await db.user.create({ data: { email: `${randomUUID()}@example.test` } }),
          foreignDraft = await db.knowledgeDraft.create({
            data: { id: randomUUID(), userId: foreign.id },
          });
        await assert.rejects(
          () => images.listInlineImages({ knowledgeDraftId: foreignDraft.id }),
          /unavailable/,
        );
        await assert.rejects(
          () => images.uploadInlineImage({ knowledgeDraftId: foreignDraft.id }, prepared, cmd()),
          /unavailable/,
        );
        await assert.rejects(() =>
          db.workAttachment.create({
            data: {
              userId: 1,
              knowledgeDraftId: foreignDraft.id,
              inlineImage: true,
              originalName: "no.png",
              mimeType: "image/png",
              byteSize: 10,
              contentHash: "a".repeat(64),
              storageKey: `${randomUUID()}.png`,
            },
          }),
        );
        await db.knowledgeDraft.delete({ where: { id: foreignDraft.id } });
        await db.user.delete({ where: { id: foreign.id } });
        await images.discardImageDraft(one.id);
        await images.discardImageDraft(two.id);
      });
    } finally {
      await db.$disconnect();
    }
  },
);
