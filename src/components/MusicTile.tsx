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
    volume,
    setVolume,
    volumeSupported,
  } = usePlayer();

  if (!video) return <p>Loading...</p>;

  return (
    <div
      className="music-tile card w-full max-w-sm rounded-xl shadow p-4 bg-white"
      style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
    >
      <div className="music-tile-content flex flex-col items-center">
        {/* Thumbnail */}
        <div className="music-thumbnail relative w-full h-48 rounded-lg overflow-hidden mb-3">
          <img
            src={video.thumbnail}
            alt={video.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        {/* Video title */}
        <h3 className="shrink-0 w-full break-words text-center font-semibold mb-2">
          {video.title}
        </h3>

        {/* Progress bar */}
        <div className="shrink-0 w-full h-2 bg-gray-200 rounded mt-2">
          <div className="h-2 bg-green-500 rounded" style={{ width: `${progress}%` }} />
        </div>

        {/* Controls */}
        <div className="shrink-0 flex justify-center items-center mt-4 space-x-4">
          <button
            aria-label="Skip back 10 seconds"
            className="bg-white bg-opacity-70 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition"
            onClick={skipBack}
          >
            ⏪
          </button>
          <button
            aria-label={playing ? "Pause music" : "Play music"}
            className="bg-white bg-opacity-70 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition"
            onClick={playing ? pause : play}
          >
            {playing ? "⏸️" : "▶️"}
          </button>
          <button
            aria-label="Skip forward 10 seconds"
            className="bg-white bg-opacity-70 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition"
            onClick={skipForward}
          >
            ⏩
          </button>
        </div>
        <div className="mt-3 w-full shrink-0">
          {volumeSupported ? (
            <label className="flex items-center gap-3 text-sm">
              <span>Volume</span>
              <input
                aria-label="Music volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="min-w-0 flex-1 accent-blue-500"
              />
              <span className="w-10 text-right tabular-nums">{volume}%</span>
            </label>
          ) : (
            <p className="text-center text-xs text-gray-400">
              Use your iPhone or iPad volume buttons.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
