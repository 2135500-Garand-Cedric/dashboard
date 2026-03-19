"use client";

import { useEffect, useState } from "react";
import { AcademicCapIcon } from "@heroicons/react/24/outline";

type Practice = {
  id: number;
  activityId: number;
  wordCount: number;
  perfectCount: number;
  goodCount: number;
  weakCount: number;
};

export default function JapaneseDashboardTile() {
  const [addedToday, setAddedToday] = useState(0);
  const [practices, setPractices] = useState<Practice[]>([]);

  const loadData = async () => {
    try {
      // Fetch vocab added today
      const vocabRes = await fetch("/api/japanese-practice/vocabulary/add");
      const vocabData = await vocabRes.json();
      setAddedToday(vocabData.count || 0);

      // Fetch today's practices
      const practiceRes = await fetch("/api/japanese-practice/practices");
      const practiceData = await practiceRes.json();
      setPractices(practiceData.practices || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 🔹 Aggregate data
  const grouped = {
    total: 0,
    perfect: 0,
    good: 0,
    weak: 0,
  };

  const kanji = {
    total: 0,
    perfect: 0,
    good: 0,
    weak: 0,
  };

  practices.forEach((p) => {
    if (p.activityId === 5) {
      kanji.total += p.wordCount;
      kanji.perfect += p.perfectCount;
      kanji.good += p.goodCount;
      kanji.weak += p.weakCount;
    } else {
      grouped.total += p.wordCount;
      grouped.perfect += p.perfectCount;
      grouped.good += p.goodCount;
      grouped.weak += p.weakCount;
    }
  });

  const StatBoxes = ({ perfect, good, weak }: any) => (
    <div className="flex gap-2 mt-2">
      <div className="flex-1 text-center py-1 rounded-lg border border-green-500 text-green-500 text-sm">
        {perfect}
      </div>
      <div className="flex-1 text-center py-1 rounded-lg border border-yellow-500 text-yellow-500 text-sm">
        {good}
      </div>
      <div className="flex-1 text-center py-1 rounded-lg border border-red-500 text-red-500 text-sm">
        {weak}
      </div>
    </div>
  );

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow p-4 max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-lg font-semibold flex items-center gap-2"
          style={{ color: "var(--color-foreground)" }}
        >
          <AcademicCapIcon className="w-5 h-5 text-[var(--color-accent)]" />
          Japanese
        </h2>
      </div>

      {/* Added Today */}
      <div className="mb-4">
        <p className="text-sm text-gray-500">Added Today</p>
        <p className="text-2xl font-bold text-[var(--color-foreground)]">
          {addedToday} words
        </p>
      </div>

      {/* Activities 1–4 */}
      <div className="mb-4">
        <p className="text-sm text-gray-500">Practice (Vocab)</p>
        <p className="text-xl font-semibold text-[var(--color-foreground)]">
          {grouped.total} words
        </p>
        <StatBoxes
          perfect={grouped.perfect}
          good={grouped.good}
          weak={grouped.weak}
        />
      </div>

      {/* Activity 5 */}
      <div>
        <p className="text-sm text-gray-500">Practice (Kanji writing)</p>
        <p className="text-xl font-semibold text-[var(--color-foreground)]">
          {kanji.total} words
        </p>
        <StatBoxes
          perfect={kanji.perfect}
          good={kanji.good}
          weak={kanji.weak}
        />
      </div>
    </div>
  );
}
