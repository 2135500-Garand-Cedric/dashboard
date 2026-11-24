import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { unzipSync, strFromU8 } from "fflate";
test(
  "Knowledge folders preserve articles while browsing, moving, archiving and restoring",
  { skip: process.env.RUN_KNOWLEDGE_FOLDERS_DB_TEST !== "1", timeout: 120000 },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient({ log: [] }),
      {
        knowledge: articles,
        knowledgeFolders: folders,
        knowledgeExport,
        server,
      } = loadWorkServices(db);
    const cmd = (revision) => ({ requestKey: randomUUID(), ...(revision ? { revision } : {}) }),
      prefix = `Folder ${randomUUID().slice(0, 8)}`;
    const create = (name, parentId = null) =>
      folders.saveFolder(null, { name: `${prefix} ${name}`, parentId }, cmd());
    try {
      await db.user.upsert({
        where: { id: 1 },
        create: { id: 1, email: "folders-owner@example.test" },
        update: {},
      });
      const work = await create("Work"),
        network = await create("Network", work.id),
        vpn = await create("VPN", network.id),
        school = await create("School");
      const task = await server.createTodo({ title: `${prefix} incident` }, cmd());
      let guide = await articles.saveArticle(
        null,
        {
          title: `${prefix} guide`,
          folderId: vpn.id,
          body: "Reusable reference",
          pinned: true,
          taskId: task.id,
        },
        cmd(),
      );
      const root = await articles.saveArticle(
        null,
        { title: `${prefix} root`, folderId: work.id, body: `[Guide](/knowledge/${guide.id})` },
        cmd(),
      );
      const loose = await articles.saveArticle(null, { title: `${prefix} loose` }, cmd());
      const list = (extra = {}) =>
        articles.listArticles(new URLSearchParams({ q: prefix, ...extra }));
      await t.test("folders, subfolder searches and Unfiled use actual assignments", async () => {
        const direct = await articles.listArticles(
          new URLSearchParams({ folder: String(work.id) }),
        );
        assert.deepEqual(
          direct.items.map((row) => row.id),
          [root.id],
        );
        assert.equal((await list({ folder: String(work.id) })).total, 2);
        assert.equal((await list({ folder: String(work.id), searchAll: "1" })).total, 3);
        assert.deepEqual(
          (await list({ folder: "unfiled" })).items.map((row) => row.id),
          [loose.id],
        );
        assert.deepEqual(
          (await list({ collection: "pinned" })).items.map((row) => row.id),
          [guide.id],
        );
        assert.equal((await list({ collection: "recent" })).items[0].id, loose.id);
        await assert.rejects(() => create("work"), /already exists/);
        await assert.rejects(
          () =>
            folders.saveFolder(
              work.id,
              { name: work.name, parentId: network.id },
              cmd(work.revision),
            ),
          /itself or a subfolder/,
        );
        await assert.rejects(() =>
          db.knowledgeFolder.update({ where: { id: work.id }, data: { parentId: network.id } }),
        );
      });
      await t.test("folder moves preserve article IDs, backlinks and task links", async () => {
        const moved = await folders.saveFolder(
          vpn.id,
          { name: vpn.name, parentId: school.id, color: "#ff0000", icon: "server" },
          cmd(vpn.revision),
        );
        assert.equal(moved.revision, 2);
        await assert.rejects(
          () =>
            folders.saveFolder(vpn.id, { name: vpn.name, parentId: school.id }, cmd(vpn.revision)),
          /changed/,
        );
        const detail = await articles.articleDetail(guide.id);
        assert.equal(detail.folderId, vpn.id);
        assert.equal(detail.backlinks[0].id, root.id);
        assert.equal(detail.tasks[0].id, task.id);
        assert.equal((await list({ folder: String(work.id) })).total, 1);
        assert.equal((await list({ folder: String(school.id) })).total, 1);
      });
      await t.test(
        "archived parents hide contents without changing article archive flags",
        async () => {
          await folders.saveFolder(
            school.id,
            { name: school.name, archived: true },
            cmd(school.revision),
          );
          assert.equal((await list()).total, 2);
          assert.equal((await list({ archived: "1" })).total, 1);
          assert.equal((await articles.articleDetail(guide.id)).folderArchived, true);
          assert.equal(
            (await db.knowledgeArticle.findUnique({ where: { id: guide.id } })).archivedAt,
            null,
          );
          await assert.rejects(
            () =>
              articles.saveArticle(null, { title: `${prefix} invalid`, folderId: vpn.id }, cmd()),
            /active folder/,
          );
          await articles.saveArticle(
            guide.id,
            { title: guide.title, body: "Updated while in an archived folder" },
            cmd(guide.revision),
          );
          guide = await articles.articleDetail(guide.id);
          assert.equal(guide.folderId, vpn.id);
          let leaf = await db.knowledgeFolder.findUnique({ where: { id: vpn.id } });
          leaf = await folders.saveFolder(
            vpn.id,
            { name: leaf.name, archived: true },
            cmd(leaf.revision),
          );
          assert.equal(leaf.parentId, school.id);
          assert.equal(leaf.icon, "server");
          assert.equal(leaf.color, "#ff0000");
          await folders.saveFolder(school.id, { name: school.name, archived: false }, cmd(2));
          assert.equal((await articles.articleDetail(guide.id)).folderArchived, true);
          await folders.saveFolder(
            vpn.id,
            { name: leaf.name, parentId: school.id, archived: false },
            cmd(leaf.revision),
          );
          assert.equal((await articles.articleDetail(guide.id)).folderArchived, false);
          assert.equal((await list()).total, 3);
        },
      );
      await t.test(
        "article moves and restores retain work links and current organization",
        async () => {
          guide = await articles.articleDetail(guide.id);
          await articles.saveArticle(
            guide.id,
            { title: guide.title, body: guide.body, folderId: work.id },
            cmd(guide.revision),
          );
          guide = await articles.articleDetail(guide.id);
          await articles.saveArticle(guide.id, { restoreRevision: 1 }, cmd(guide.revision));
          guide = await articles.articleDetail(guide.id);
          assert.equal(guide.folderId, work.id);
          assert.equal(guide.tasks[0].id, task.id);
          assert.equal(guide.body, "Reusable reference");
          const zip = unzipSync(await knowledgeExport.exportKnowledge(guide.id)),
            manifest = JSON.parse(strFromU8(zip["manifest.json"]));
          assert.equal(manifest.articles[0].folderId, work.id);
          assert.deepEqual(manifest.articles[0].folderPath, [work.name]);
          assert.ok(manifest.folders.some((row) => row.id === work.id));
        },
      );
      await t.test("ownership is enforced in both commands and foreign keys", async () => {
        const foreign = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
        const folder = await db.knowledgeFolder.create({
          data: { userId: foreign.id, name: "Foreign", normalizedName: "foreign" },
        });
        await assert.rejects(
          () => folders.saveFolder(folder.id, { name: "No" }, cmd(1)),
          /not found/,
        );
        await assert.rejects(
          () => articles.saveArticle(null, { title: "No", folderId: folder.id }, cmd()),
          /not found/,
        );
        await assert.rejects(() =>
          db.knowledgeArticle.update({ where: { id: guide.id }, data: { folderId: folder.id } }),
        );
        await assert.rejects(() =>
          db.knowledgeFolder.update({ where: { id: work.id }, data: { parentId: folder.id } }),
        );
        await db.knowledgeFolder.delete({ where: { id: folder.id } });
        await db.user.delete({ where: { id: foreign.id } });
      });
    } finally {
      await db.$disconnect();
    }
  },
);
