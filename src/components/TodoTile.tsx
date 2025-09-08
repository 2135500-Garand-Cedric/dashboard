"use client";
import { useEffect, useState } from "react";

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

export default function TodoTile() {
  const [todos, setTodos] = useState<TodoItem[]>([]);

  useEffect(() => {
    fetch("/api/todos")
      .then((res) => res.json())
      .then((data) => setTodos(data));
  }, []);

  return (
    <div
      className="card w-full max-w-sm"
      style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}
    >
      <h2
        className="text-xl font-semibold mb-4"
        style={{ color: "var(--color-foreground)" }}
      >
        Todo List
      </h2>
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className={`flex items-center justify-between p-2 rounded transition hover:bg-[color:var(--accent)]`}
            style={{
              color: todo.done ? "var(--success)" : "var(--color-foreground)",
              textDecoration: todo.done ? "line-through" : "none",
            }}
          >
            <span>{todo.text}</span>
            {todo.done && (
              <span
                className="font-bold"
                style={{ color: "var(--success)" }}
              >
                &#10003;
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
