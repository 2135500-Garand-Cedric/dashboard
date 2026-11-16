"use client";

import { useSettings } from "@/context/SettingsContext";
import { localToday } from "@/lib/work-management/date-format";
import { useCallback, useEffect, useState } from "react";
import { CheckCircleIcon, ClockIcon, FireIcon, StarIcon } from "@heroicons/react/24/solid";

type Quest = {
  id: number;
  title: string;
  type: "daily" | "weekly";
  xp: number;
  coins: number;
  completed: boolean;
  lastCompleted?: string | null;
};

export default function QuestTile({
  setUserXp,
  setUserCoins,
}: {
  setUserXp: (xp: number) => void;
  setUserCoins: (coins: number) => void;
}) {
  const { timeZone } = useSettings();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [showWeekly, setShowWeekly] = useState(false);

  const resetQuestsIfNeeded = useCallback(
    (quests: Quest[]) => {
      const today = localToday(new Date(), timeZone);
      const sunday = new Date(`${today}T12:00:00Z`);
      sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
      const weekStart = sunday.toISOString().slice(0, 10);
      return quests.map((quest) =>
        quest.lastCompleted &&
        localToday(new Date(quest.lastCompleted), timeZone) <
          (quest.type === "daily" ? today : weekStart)
          ? { ...quest, completed: false }
          : quest,
      );
    },
    [timeZone],
  );
  useEffect(() => {
    let active = true;
    void fetch("/api/users/quests")
      .then((response) => response.json())
      .then((data: Quest[]) => {
        if (active) setQuests(resetQuestsIfNeeded(data));
      });
    return () => {
      active = false;
    };
  }, [resetQuestsIfNeeded]);

  const toggleQuest = async (quest: Quest) => {
    const updatedCompleted = !quest.completed;

    const res = await fetch("/api/users/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questId: quest.id,
        add: updatedCompleted,
        xp: quest.xp,
        coins: quest.coins,
      }),
    });

    const data = await res.json();

    setQuests((prev) =>
      prev.map((q) =>
        q.id === quest.id
          ? {
              ...q,
              completed: updatedCompleted,
              lastCompleted: updatedCompleted ? new Date().toISOString() : null,
            }
          : q,
      ),
    );

    // Update parent XP/coins state
    if (data.totalXp !== undefined && data.coins !== undefined) {
      setUserXp(data.totalXp);
      setUserCoins(data.coins);
    }
  };

  const displayedQuests = quests.filter((q) =>
    showWeekly ? q.type === "weekly" : q.type === "daily",
  );

  // 🔹 Compute next weekly reset date (next Sunday)
  const nextSunday = (() => {
    const d = new Date(`${localToday(new Date(), timeZone)}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7 - d.getUTCDay());
    return d.toLocaleDateString(undefined, {
      timeZone: "UTC",
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  })();

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow p-4 max-w-md">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <StarIcon className="w-5 h-5 text-yellow-500" /> Quests
        </h2>
        <button
          onClick={() => setShowWeekly(!showWeekly)}
          className="px-3 py-1 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
        >
          {showWeekly ? "Show Daily" : "Show Weekly"}
        </button>
      </div>

      {/* 🔹 Only show reset info in Weekly mode */}
      {showWeekly && (
        <p className="text-sm text-gray-500 mb-3">
          Weekly quests reset on <span className="font-medium">{nextSunday}</span>
        </p>
      )}

      <div
        className={`space-y-3 ${displayedQuests.length > 5 ? "max-h-75 overflow-y-auto pr-1" : ""}`}
      >
        {displayedQuests.length === 0 && (
          <div className="text-gray-500 text-sm italic">
            No {showWeekly ? "weekly" : "daily"} quests
          </div>
        )}

        {displayedQuests.map((quest) => (
          <div
            key={quest.id}
            className={`p-3 border rounded flex items-center justify-between cursor-pointer transition ${
              quest.completed ? "bg-green-100 border-green-400" : "hover:bg-accent/10"
            }`}
            onClick={() => toggleQuest(quest)}
          >
            <div className="flex items-center gap-2">
              {quest.completed ? (
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              ) : quest.type === "daily" ? (
                <ClockIcon className="w-5 h-5 text-blue-500" />
              ) : (
                <FireIcon className="w-5 h-5 text-red-500" />
              )}
              <span className={quest.completed ? "line-through text-gray-500" : ""}>
                {quest.title}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              +{quest.xp} XP / +{quest.coins} 💰
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
