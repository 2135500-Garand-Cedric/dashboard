import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadWorkModule } from "./helpers/work-support.mjs";
const validation = loadWorkModule("src/lib/work-management/validation.ts", {
  "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
});
const markdown = loadWorkModule("src/lib/knowledge/markdown.ts");
const input = loadWorkModule("src/lib/knowledge/input.ts", {
  "@/lib/work-management/validation": validation,
});
const renderer = loadWorkModule("src/components/knowledge/Markdown.tsx", {
  "@/lib/knowledge/markdown": markdown,
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
}).default;
const exporter = loadWorkModule("src/lib/knowledge/export.ts", {
  "@/lib/prisma": {},
  "@/lib/owner-policy": {},
  "@/lib/work-management/files": {},
  "@/lib/work-management/validation": validation,
  "./markdown": markdown,
  "./folders": { folderRows: async () => [] },
  "./folder-tree": loadWorkModule("src/lib/knowledge/folder-tree.ts"),
});

test("Knowledge validation rejects invalid fields and preserves plain Markdown", () => {
  assert.equal(
    input.articleInput({ title: " Guide ", body: "<script>text</script>" }).title,
    "Guide",
  );
  assert.deepEqual(input.articleInput({ title: "Guide", tags: ["VPN", "vpn", "Server"] }).tags, [
    "vpn",
    "Server",
  ]);
  for (const value of [
    { title: " " },
    { title: "Guide", userId: 1 },
    { title: "Guide", body: "x".repeat(200001) },
    { title: "Guide", type: "TASK" },
    { title: "Guide", pinned: "true" },
    { title: "Guide", tags: [""] },
    { title: "Guide", body: "a\0b" },
  ])
    assert.throws(() => input.articleInput(value));
});
test("Knowledge backlinks use actual Markdown links and stable IDs", () => {
  assert.deepEqual(
    markdown.articleLinks(
      "[a](/knowledge/12) [b](/knowledge/12#step) `[/](/knowledge/13)`\n\n```\n[/](/knowledge/14)\n```\n\n[ref][x]\n\n[x]: /knowledge/15\n\n![image](/knowledge/16)",
    ),
    [12, 15],
  );
  assert.equal(markdown.articleIdFromHref("/knowledge/2147483648"), null);
});
test("Knowledge renderer never runs HTML, embeds or remote images", () => {
  const body =
    "# Guide\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![tracking](https://evil.example/pixel.png)\n\n![local](/api/knowledge/1/attachments/2/file)\n\n- [x] Done\n\n```sh\nrm --example\n```";
  const html = renderToStaticMarkup(React.createElement(renderer, { body }));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('src="https://evil.example'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('src="/api/knowledge/1/attachments/2/file"'));
  assert.ok(!html.includes('type="checkbox"'));
  assert.ok(html.includes("Done"));
  assert.ok(html.includes("Copy"));
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//evil.example",
    "https://user:pass@example.com",
    "/\\evil.example",
  ])
    assert.equal(markdown.safeHref(href), null);
});
test("Knowledge export rewrites real destinations while preserving inline and fenced code", () => {
  const source =
    "[Guide](/knowledge/12#steps) and `[Guide](/knowledge/12)`\n\n```md\n[Guide](/knowledge/12)\n```\n\n> [Guide](/knowledge/12)\n\n[Reference][ref]\n\n[ref]: /knowledge/12\n\n![screenshot](/api/knowledge/1/attachments/2/file)";
  const text = exporter.exportMarkdown(
    source,
    new Map([[12, "article-12.md"]]),
    new Map([["/api/knowledge/1/attachments/2/file", "attachments/2.png"]]),
  );
  assert.ok(text.includes("[Guide](article-12.md#steps)"));
  assert.ok(text.includes("`[Guide](/knowledge/12)`"));
  assert.ok(text.includes("```md\n[Guide](/knowledge/12)\n```"));
  assert.ok(text.includes("> [Guide](article-12.md)"));
  assert.ok(text.includes("[ref]: article-12.md"));
  assert.ok(text.includes("![screenshot](attachments/2.png)"));
});

const tree = loadWorkModule("src/lib/knowledge/folder-tree.ts");
const format = loadWorkModule("src/lib/knowledge/editor-format.ts");
test("folder hierarchy paths, descendants and inherited archive state", () => {
  const rows = [
    { id: 1, parentId: null, name: "Work", archivedAt: null },
    { id: 2, parentId: 1, name: "Network", archivedAt: "2026-11-23" },
    { id: 3, parentId: 2, name: "VPN", archivedAt: null },
  ];
  assert.deepEqual(
    tree.folderPath(rows, 3).map((row) => row.name),
    ["Work", "Network", "VPN"],
  );
  assert.deepEqual(tree.descendantIds(rows, 1), [1, 2, 3]);
  assert.equal(tree.isFolderArchived(rows, 3), true);
  assert.throws(() => tree.folderPath([{ ...rows[0], parentId: 3 }, ...rows.slice(1)], 1), /cycle/);
});
test("formatting places the caret inside closing Markdown markers", () => {
  for (const [kind, selected, end] of [
    ["bold", "chosen", "**"],
    ["heading", "Title", ""],
    ["code", "command", "\n```\n"],
    ["checklist", "Step", ""],
  ]) {
    const result = format.formatInsertion(kind, selected);
    assert.equal(result.value.slice(result.caret), end);
    assert.ok(result.value.slice(0, result.caret).endsWith(selected));
  }
  assert.equal(format.formatInsertion("bold").value, "****");
  assert.equal(format.formatInsertion("heading").value, "## ");
  assert.equal(format.formatInsertion("checklist").value, "- ");
  assert.equal(format.formatInsertion("bold").caret, 2);
});
