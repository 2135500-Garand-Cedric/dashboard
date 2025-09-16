"use client";

import TodoTile from "@/components/TodoTile";
import MusicTile from "@/components/MusicTile";
import EventTile from "@/components/EventTile";
import QuestTile from "@/components/QuestTile";
import LevelBar from "@/components/LevelBar";
import { useState, useEffect } from "react";

export default function Home() {
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
      className="p-8"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Header with title + progress */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--color-foreground)" }}
        >
          My Dashboard
        </h1>
        <LevelBar xp={userXp} coins={userCoins} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <EventTile />
        <TodoTile />
        <MusicTile />
        <QuestTile setUserXp={setUserXp} setUserCoins={setUserCoins} />
      </div>
    </div>
  );
}
