"use client";

import DashboardQuickAdd from "@/components/DashboardQuickAdd";
import TodoTile from "@/components/TodoTile";
import MusicTile from "@/components/MusicTile";
import EventTile from "@/components/EventTile";
import QuestTile from "@/components/QuestTile";
import LevelBar from "@/components/LevelBar";
import { useState, useEffect } from "react";
import JapaneseDashboardTile from "@/components/JapaneseStatsTile";
import FinanceTile from "@/components/FinanceTile";

export default function Home() {
  const [userXp, setUserXp] = useState(0);
  const [userCoins, setUserCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [calendarRevision, setCalendarRevision] = useState(0);

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

  useEffect(() => {
    const refresh = () => setCalendarRevision((value) => value + 1);
    window.addEventListener("dashboard:event-created", refresh);
    return () => window.removeEventListener("dashboard:event-created", refresh);
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div
      className="dashboard-page p-4 md:p-4"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Header with title + progress */}
      <div className="dashboard-header flex flex-wrap items-center justify-between mb-4 gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1
            className="text-2xl lg:text-3xl font-bold"
            style={{ color: "var(--color-foreground)" }}
          >
            My Dashboard
          </h1>
          <div className="hidden md:block">
            <DashboardQuickAdd />
          </div>
        </div>
        <LevelBar xp={userXp} coins={userCoins} />
      </div>

      {/* Main grid */}
      <div className="dashboard-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <EventTile refreshToken={calendarRevision} />
        <TodoTile />
        <MusicTile />
        <QuestTile setUserXp={setUserXp} setUserCoins={setUserCoins} />
        <JapaneseDashboardTile />
        <FinanceTile />
      </div>
    </div>
  );
}
