"use client";

import { useEffect, useState } from "react";

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

export default function TodoTile() {
  const [todos, setTodos] = useState<TodoItem[]>([]);

  // Track date to reset completed tasks daily
  const today = new Date().toDateString();

  // Load todos from API
  useEffect(() => {
    const storedDate = localStorage.getItem("todosDate");
    if (storedDate !== today) {
      // New day, clear completed tasks
      localStorage.setItem("todosDate", today);
      localStorage.removeItem("completedTodos");
    }

    fetch("/api/todos")
      .then((res) => res.json())
      .then((data) => {
        // Mark tasks done if stored in localStorage
        const completed = JSON.parse(localStorage.getItem("completedTodos") || "[]");
        const updated = data.map((todo: TodoItem) => ({
          ...todo,
          done: completed.includes(todo.id),
        }));
        setTodos(updated);
      });
  }, []);

  // Toggle task done status
  const toggleTodo = async (id: number) => {
    const updatedTodos = todos.map((todo) => {
      if (todo.id === id) {
        return { ...todo, done: !todo.done };
      }
      return todo;
    });
    setTodos(updatedTodos);

    // Store checked tasks in localStorage for today
    const completedIds = updatedTodos.filter((t) => t.done).map((t) => t.id);
    localStorage.setItem("completedTodos", JSON.stringify(completedIds));

    // Update database
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !todos.find((t) => t.id === id)?.done }),
    });
  };

  return (
    <div
      className="card w-full max-w-sm rounded-xl shadow p-4 bg-white"
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
            className="flex items-center justify-between p-2 rounded hover:bg-[color:var(--accent)] transition"
            style={{
              color: todo.done ? "var(--success)" : "var(--color-foreground)",
              textDecoration: todo.done ? "line-through" : "none",
            }}
          >
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggleTodo(todo.id)}
                className="form-checkbox h-5 w-5 text-green-500"
              />
              <span>{todo.text}</span>
            </label>

            {todo.done && (
              <span className="font-bold" style={{ color: "var(--success)" }}>
                &#10003;
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
