"use client";
import { useState } from "react";
import TaskModal from "@/components/shared/TaskModal";
import {
  button,
  typeName,
  input,
  Paging,
  ReadState,
  useKnowledgeRead,
  type ArticleSummary,
  type Page,
} from "./shared";
export default function ArticlePicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (article: ArticleSummary) => void;
}) {
  return (
    <TaskModal open={open} title="Choose an article" onClose={onClose}>
      {open && <Picker onSelect={onSelect} />}
    </TaskModal>
  );
}
function Picker({ onSelect }: { onSelect: (article: ArticleSummary) => void }) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const { data, error, reload } = useKnowledgeRead<Page<ArticleSummary>>(
    `/api/knowledge?q=${encodeURIComponent(q)}&page=${page}`,
  );
  return (
    <div className="space-y-3">
      <input
        aria-label="Search articles"
        className={input}
        type="search"
        placeholder="Search articles…"
        maxLength={300}
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
          setPage(1);
        }}
      />
      {!data ? (
        <ReadState error={error} retry={reload} />
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((article) => (
              <button
                className={`${button} w-full justify-start text-left`}
                key={article.id}
                onClick={() => onSelect(article)}
              >
                <span>
                  <span className="block">{article.title}</span>
                  <span className="mt-1 block text-xs text-gray-400">
                    {typeName(article.type)} · #{article.id}
                  </span>
                </span>
              </button>
            ))}
            {!data.total && <p>No articles found.</p>}
          </div>
          <Paging {...data} onPage={setPage} />
        </>
      )}
    </div>
  );
}
