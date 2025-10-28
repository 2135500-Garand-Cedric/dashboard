"use client";

import { usePlayer } from "@/context/MusicPlayerContext";

export default function MusicDashboardTile() {
  const {
    video,
    playing,
    play,
    pause,
    skipForward,
    skipBack,
    progress,
  } = usePlayer();

  if (!video) return <p>Loading...</p>;

  return (
    <div
      className="card w-full max-w-sm rounded-xl shadow p-4 bg-white"
      style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
    >
      <div className="flex flex-col items-center">
        {/* Thumbnail */}
        <div className="w-full h-48 rounded-lg overflow-hidden mb-3">
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Video title */}
        <h3 className="text-center font-semibold mb-2">{video.title}</h3>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 rounded mt-2">
          <div
            className="h-2 bg-green-500 rounded"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center mt-4 space-x-4">
          <button
            className="bg-white bg-opacity-70 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition"
            onClick={skipBack}
          >
            ⏪
          </button>
          <button
            className="bg-white bg-opacity-70 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition"
            onClick={playing ? pause : play}
          >
            {playing ? "⏸️" : "▶️"}
          </button>
          <button
            className="bg-white bg-opacity-70 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition"
            onClick={skipForward}
          >
            ⏩
          </button>
        </div>
      </div>
    </div>
  );
}
