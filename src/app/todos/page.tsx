"use client";

import TodoBoard from "@/components/todos/TodoBoard";
import LevelBar from "@/components/LevelBar";
import { useState, useEffect } from "react";

export default function TodosPage() {
  const [userXp, setUserXp] = useState(0);
  const [userCoins, setUserCoins] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUserXp(data.totalXp);
      setUserCoins(data.coins);
      setLoading(false);
    };
    fetchUser();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div
      className="p-6"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Header with title + LevelBar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-foreground)" }}
        >
          Todos
        </h1>
        <LevelBar xp={userXp} coins={userCoins} />
      </div>

      {/* Todo board gets setters */}
      <TodoBoard
        setUserXp={setUserXp}
        setUserCoins={setUserCoins}
      />
    </div>
  );
}
