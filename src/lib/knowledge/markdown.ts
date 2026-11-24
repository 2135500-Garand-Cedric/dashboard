import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

// Parse into tokens, never inject rendered HTML. Both browser and server use this parser.
export const markdown = new MarkdownIt({ html: false, linkify: false, breaks: true });
export function safeHref(value: string): string | null {
  if (/^\/(?!\/)[^\s\\]*$/.test(value) || /^#[^\s\\]*$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function articleIdFromHref(href: string): number | null {
  const match = /^\/knowledge\/([1-9]\d*)(?:[?#].*)?$/.exec(href);
  const id = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(id) && id <= 2147483647 && id > 0 ? id : null;
}
export function localImage(href: string): boolean {
  return /^\/api\/knowledge\/(?:[1-9]\d*\/attachments\/[1-9]\d*|images\/[1-9]\d*)\/file$/.test(
    href,
  );
}
export function visitTokens(tokens: Token[], visit: (token: Token) => void) {
  for (const token of tokens) {
    visit(token);
    if (token.children) visitTokens(token.children, visit);
  }
}
export function articleLinks(body: string): number[] {
  const ids = new Set<number>();
  visitTokens(markdown.parse(body, {}), (token) => {
    if (token.type !== "link_open") return;
    const id = articleIdFromHref(String(token.attrGet("href") || ""));
    if (id) ids.add(id);
  });
  return [...ids];
}
export function linkLabel(text: string): string {
  return text.replace(/[\\\[\]]/g, "\\$&").replace(/[\r\n]/g, " ");
}
export const templates: Record<string, string> = {
  REFERENCE: "## Summary\n\n\n## Useful facts\n\n\n## Commands\n\n\n## Related information\n",
  TROUBLESHOOTING:
    "## Symptoms\n\n\n## Environment\n\n\n## Error messages\n\n\n## Checks\n\n\n## Cause\n\n\n## Solution\n\n\n## Verification\n\n\n## Related information\n",
  PROCEDURE:
    "## Purpose\n\n\n## Prerequisites\n\n\n## Steps\n\n1. \n\n## Verification\n\n\n## Rollback or recovery\n",
};

export function inlineImageIds(body: string): number[] {
  const ids = new Set<number>();
  visitTokens(markdown.parse(body, {}), (token) => {
    if (token.type !== "image") return;
    const match = /^\/api\/knowledge\/images\/([1-9]\d*)\/file$/.exec(
      String(token.attrGet("src") || ""),
    );
    if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) <= 2147483647)
      ids.add(Number(match[1]));
  });
  return [...ids];
}
