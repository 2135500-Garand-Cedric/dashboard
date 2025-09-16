"use client";

import { CurrencyDollarIcon } from "@heroicons/react/24/solid";

const xpForLevel = (level: number) => Math.round(level ** 1.9 + 50 * level);

const getLevelInfo = (totalXp: number) => {
  let level = 1;
  let accumulatedXp = 0;

  while (true) {
    const xpToNext = xpForLevel(level);
    if (totalXp < accumulatedXp + xpToNext) break;
    accumulatedXp += xpToNext;
    level++;
  }

  const currentLevelXp = totalXp - accumulatedXp;
  const nextLevelXp = xpForLevel(level);
  const progressPercent = Math.min((currentLevelXp / nextLevelXp) * 100, 100);

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressPercent,
  };
};

export default function LevelBar({
  xp,
  coins,
}: {
  xp: number;
  coins: number;
}) {
  const { level, currentLevelXp, nextLevelXp, progressPercent } = getLevelInfo(xp);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      {/* XP Progress */}
      <div className="w-56">
        <div className="flex justify-between text-xs mb-1">
          <span className="font-medium">Level {level}</span>
          <span>
            {currentLevelXp}/{nextLevelXp} XP
          </span>
        </div>
        <div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden">
          <div
            className="h-2 bg-green-500 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Coins */}
      <div className="flex items-center gap-1 text-yellow-600 font-medium">
        <CurrencyDollarIcon className="w-5 h-5" />
        {coins}
      </div>
    </div>
  );
}
