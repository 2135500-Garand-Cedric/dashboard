import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { supportModules, samplePng, samplePdf } from "./helpers/work-support.mjs";
const { validation, noteInput, primitives } = supportModules({});
test("notes reject writable timestamps, unsafe links, empty/oversized text and ambiguous dates", () => {
  const base = {
    body: "<script>alert(1)</script>\nPlain text",
    documentationUrls: ["https://example.com/guide"],
    occurredAt: null,
  };
  assert.equal(noteInput.noteInput(base).body, base.body);
  assert.equal(
    noteInput
      .noteInput({ ...base, occurredAt: "2026-11-08T19:20:00-05:00" })
      .occurredAt.toISOString(),
    "2026-11-09T00:20:00.000Z",
  );
  for (const body of [
    { ...base, createdAt: "2000-01-01" },
    { ...base, body: " " },
    { ...base, body: "x".repeat(50001) },
    { ...base, body: "a\0b" },
    { ...base, occurredAt: "2026-11-08T12:00" },
    { ...base, occurredAt: "2026-02-30T12:00:00Z" },
  ])
    assert.throws(() => noteInput.noteInput(body), validation.WorkValidationError);
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "//example.com",
    "https://example.com\n/evil",
  ])
    assert.throws(
      () => noteInput.noteInput({ ...base, documentationUrls: [url] }),
      validation.WorkValidationError,
    );
});
test("private work files validate bytes, image limits, declared MIME, names and bounded multipart independently of headers", async () => {
  const prepared = await primitives.prepareDocument(
    new File([samplePng], "../../camera.png", { type: "image/png" }),
  );
  assert.equal(prepared.originalName, "camera.png");
  assert.equal(prepared.extension, "png");
  assert.equal(
    (
      await primitives.prepareDocument(
        new File([samplePdf()], "scan.pdf", { type: "application/pdf" }),
      )
    ).extension,
    "pdf",
  );
  for (const [content, mime] of [
    [samplePng, "application/pdf"],
    [Buffer.from("<svg><script>alert(1)</script></svg>"), "image/svg+xml"],
    [Buffer.from("%PDF-1.4 fake %%EOF"), "application/pdf"],
    [samplePng.subarray(0, 20), "image/png"],
  ])
    await assert.rejects(
      primitives.prepareDocument(new File([content], "bad", { type: mime })),
      primitives.PrivateFileError,
    );
  await assert.rejects(
    primitives.prepareDocument(
      new File([new Uint8Array(primitives.MAX_DOCUMENT_BYTES + 1)], "big.png"),
    ),
    /15 MB/,
  );
  const form = new FormData();
  form.set("file", new File([samplePng], "camera.png", { type: "image/png" }));
  assert.equal(
    (await primitives.documentForm(new Request("http://localhost", { method: "POST", body: form })))
      .contentHash,
    prepared.contentHash,
  );
  form.set("extra", "unexpected");
  await assert.rejects(
    primitives.documentForm(new Request("http://localhost", { method: "POST", body: form })),
    /exactly one/,
  );
  const oversized = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=x" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(primitives.MAX_DOCUMENT_BYTES + 65537));
        controller.close();
      },
    }),
    duplex: "half",
  });
  await assert.rejects(primitives.documentForm(oversized), (error) => error.status === 413);
});
test("private storage keeps originals and restrictive permissions; rejects traversal, symlinks, public and finance aliases", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-files-unit-")),
    store = primitives.privateDocumentStore(path.join(root, "work"), [
      path.join(root, "public"),
      path.join(root, "finance"),
    ]);
  try {
    await fs.mkdir(path.join(root, "public"));
    await fs.mkdir(path.join(root, "finance"));
    const prepared = await primitives.prepareDocument(
      new File([samplePng], "camera.png", { type: "image/png" }),
    );
    const key = await store.write(prepared);
    assert.deepEqual(await store.read(key), samplePng);
    assert.equal((await fs.stat(store.path(key))).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.dirname(store.path(key)))).mode & 0o777, 0o700);
    assert.throws(() => store.path("../../.env"));
    assert.throws(() => store.path(`${randomUUID()}.csv`));
    const linked = `${randomUUID()}.png`;
    await fs.symlink(store.path(key), store.path(linked));
    await assert.rejects(store.read(linked), (error) => error.status === 404);
    await fs.symlink(path.join(root, "finance"), path.join(root, "finance-alias"));
    await assert.rejects(
      primitives
        .privateDocumentStore(path.join(root, "finance-alias"), [path.join(root, "finance")])
        .write(prepared),
      (error) => error.status === 503,
    );
    await assert.rejects(
      primitives
        .privateDocumentStore(path.join(root, "public", "hidden"), [path.join(root, "public")])
        .write(prepared),
      (error) => error.status === 503,
    );
    await store.remove(key);
    await assert.rejects(store.read(key), (error) => error.status === 404);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Phase 04 migration comparison retains existing activity and refuses fabricated note backfill", async () => {
  const { compareInventories } = await import("../scripts/work-management-inventory.mjs");
  const before = {
    format: 2,
    tables: { WorkActivity: { count: 1, hash: "old", rows: ['{"id":1,"action":"COMPLETED"}'] } },
    columns: [
      { table_name: "WorkActivity", column_name: "id" },
      { table_name: "WorkActivity", column_name: "action" },
    ],
    enums: [],
    indexes: [],
    foreignKeys: [],
  };
  const after = {
    ...before,
    tables: {
      WorkActivity: {
        count: 1,
        hash: "new",
        rows: ['{"id":1,"action":"COMPLETED","noteRevisionId":null}'],
      },
      WorkNote: { count: 0 },
      WorkNoteRevision: { count: 0 },
      WorkAttachment: { count: 0 },
    },
    columns: [...before.columns, { table_name: "WorkActivity", column_name: "noteRevisionId" }],
  };
  assert.deepEqual(compareInventories(before, after, "04"), []);
  assert.ok(
    compareInventories(
      before,
      { ...after, tables: { ...after.tables, WorkNote: { count: 1 } } },
      "04",
    ).some((value) => value.includes("backfill")),
  );
});
test("combined backup verification rejects missing work originals before accessing Docker", async () => {
  const { verify } = await import("../scripts/finance-backup.mjs"),
    { createHash } = await import("node:crypto");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-backup-unit-"));
  try {
    const data = Buffer.from("test archive"),
      key = `${randomUUID()}.png`;
    await fs.writeFile(path.join(root, "database.dump"), data);
    await fs.mkdir(path.join(root, "documents"));
    await fs.mkdir(path.join(root, "work-documents"));
    await fs.writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify({
        version: 2,
        postgresMajor: 15,
        databaseHash: createHash("sha256").update(data).digest("hex"),
        databaseSnapshot: {},
        documents: [],
        files: [],
        workDocuments: [{ key, size: 2, hash: "missing" }],
        workFiles: [],
      }),
    );
    await assert.rejects(verify(root), /missing/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("activity formatting preserves script-like and invalid date-like text without executing or crashing", async () => {
  const { loadWorkModule } = await import("./helpers/work-support.mjs");
  const types = loadWorkModule("src/lib/work-management/types.ts");
  const preview = loadWorkModule("src/components/todos/TaskActivityPreview.tsx", {
    "@/lib/work-management/types": types,
    "@/lib/work-management/client": {},
    "@/context/SettingsContext": {},
  });
  assert.equal(preview.valueLabel("2026-99-99Task details"), "2026-99-99Task details");
  assert.equal(preview.valueLabel("<script>alert(1)</script>"), "<script>alert(1)</script>");
});
test("valid compressed images above the decoded pixel limit are rejected", async () => {
  const { default: sharp } = await import("sharp");
  const large = await sharp({
    create: { width: 8000, height: 5001, channels: 3, background: "white" },
  })
    .jpeg({ quality: 1 })
    .toBuffer();
  assert.ok(large.length < primitives.MAX_DOCUMENT_BYTES);
  await assert.rejects(
    primitives.prepareDocument(new File([large], "large-dimensions.jpg", { type: "image/jpeg" })),
    (error) =>
      error instanceof primitives.PrivateFileError && error.message.includes("40 megapixels"),
  );
});
