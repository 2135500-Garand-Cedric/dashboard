"use client";
import { useState } from "react";
import { button, input, ReadState, useKnowledgeRead } from "./shared";
export default function WorkPicker({
  onLink,
}: {
  onLink: (kind: string, id: number, title: string) => void;
}) {
  const [kind, setKind] = useState("task"),
    [q, setQ] = useState("");
  const { data, error, reload } = useKnowledgeRead<{ id: number; title: string }[]>(
    `/api/knowledge/work?kind=${kind}&q=${encodeURIComponent(q)}`,
  );
  return (
    <div className="space-y-3">
      <label className="block">
        Type
        <select
          aria-label="Related work type"
          className={input}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="task">Task</option>
          <option value="project">Project</option>
        </select>
      </label>
      <label className="block">
        Search
        <input
          className={input}
          aria-label="Search related work"
          type="search"
          value={q}
          maxLength={200}
          onChange={(event) => setQ(event.target.value)}
        />
      </label>
      {!data ? (
        <ReadState error={error} retry={reload} />
      ) : (
        <ul className="space-y-2">
          {data.map((row) => (
            <li key={row.id}>
              <button
                className={`${button} w-full justify-start text-left`}
                onClick={() => onLink(kind, row.id, row.title)}
              >
                {kind === "task" ? `TASK-${String(row.id).padStart(4, "0")} · ` : ""}
                {row.title}
              </button>
            </li>
          ))}
          {!data.length && <li>No matching work.</li>}
        </ul>
      )}
    </div>
  );
}
