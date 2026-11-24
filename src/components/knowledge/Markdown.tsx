"use client";
/* eslint-disable @next/next/no-img-element -- Private authenticated images bypass the public optimizer. */
import { createElement, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Token } from "markdown-it";
import { markdown, safeHref, localImage } from "@/lib/knowledge/markdown";
function Code({ value, language }: { value: string; language: string }) {
  const [message, setMessage] = useState("Copy");
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-card-border bg-black/20">
      <div className="flex items-center justify-between gap-3 border-b border-card-border px-3 py-1 text-xs text-gray-400">
        <span>{language}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setMessage("Copied");
            } catch {
              setMessage("Select code to copy");
            }
          }}
        >
          {message}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm">
        <code>{value}</code>
      </pre>
    </div>
  );
}
const allowed = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "s",
  "blockquote",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
function renderTokens(tokens: Token[]): ReactNode[] {
  let position = 0;
  function nodes(): ReactNode[] {
    const result: ReactNode[] = [];
    while (position < tokens.length) {
      const token = tokens[position++],
        key = position;
      if (token.nesting === -1) break;
      if (token.type === "inline")
        result.push(<span key={key}>{renderTokens(token.children || [])}</span>);
      else if (["fence", "code_block"].includes(token.type))
        result.push(<Code key={key} value={token.content} language={token.info.split(/\s/)[0]} />);
      else if (token.type === "code_inline")
        result.push(
          <code key={key} className="rounded bg-black/25 px-1.5 py-0.5 text-[.9em]">
            {token.content}
          </code>,
        );
      else if (token.type === "image") {
        const src = String(token.attrGet("src") || "");
        result.push(
          localImage(src) ? (
            <img
              key={key}
              src={src}
              alt={token.content}
              loading="lazy"
              className="my-3 max-h-[65vh] max-w-full rounded-lg object-contain"
            />
          ) : (
            <span key={key} className="text-gray-400">
              [Image unavailable: {token.content}]
            </span>
          ),
        );
      } else if (token.type === "link_open") {
        const children = nodes(),
          href = safeHref(String(token.attrGet("href") || ""));
        result.push(
          href ? (
            href.startsWith("/") ? (
              <Link key={key} className="text-blue-400 underline" href={href}>
                {children}
              </Link>
            ) : (
              <a
                key={key}
                className="text-blue-400 underline"
                href={href}
                target={href.startsWith("#") ? undefined : "_blank"}
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {children}
              </a>
            )
          ) : (
            <span key={key}>{children}</span>
          ),
        );
      } else if (token.nesting === 1) {
        const children = nodes();
        if (allowed.has(token.tag)) {
          const element = createElement(
            token.tag,
            {
              key,
              ...(token.tag === "ol" && token.attrGet("start")
                ? { start: Number(token.attrGet("start")) }
                : {}),
            },
            children,
          );
          result.push(
            token.tag === "table" ? (
              <div key={key} className="my-4 overflow-x-auto">
                {element}
              </div>
            ) : (
              element
            ),
          );
        } else result.push(<span key={key}>{children}</span>);
      } else if (token.type === "hr")
        result.push(<hr key={key} className="my-5 border-card-border" />);
      else if (["softbreak", "hardbreak"].includes(token.type)) result.push(<br key={key} />);
      else if (token.type === "text") {
        const check = /^\[([ xX])\] /.exec(token.content);
        result.push(check ? token.content.slice(4) : token.content);
      }
    }
    return result;
  }
  return nodes();
}
export default function Markdown({ body }: { body: string }) {
  return (
    <div className="knowledge-markdown min-w-0 break-words [overflow-wrap:anywhere]">
      {renderTokens(markdown.parse(body, {}))}
    </div>
  );
}
