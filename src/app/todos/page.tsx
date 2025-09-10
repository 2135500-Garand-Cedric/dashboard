// src/app/todos/page.tsx
import TodoBoard from "@/components/todos/TodoBoard";

export default function TodosPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4" style={{ color: "var(--color-foreground)" }}>
        Todos
      </h1>
      <TodoBoard />
    </div>
  );
}
