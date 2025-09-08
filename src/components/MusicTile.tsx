"use client";

import { useEffect, useRef, useState } from "react";

interface Video {
  videoId: string;
  title: string;
  thumbnail: string;
}

export default function MusicTile() {
  const [video, setVideo] = useState<Video | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100%
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);

  // Fetch latest video from your API route
  useEffect(() => {
    fetch("/api/youtube")
      .then((res) => res.json())
      .then((data) => {
        if (data.items && data.items.length > 0) {
          const item = data.items[0];
          setVideo({
            videoId: item.id.videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url,
          });
        }
      });
  }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    if ((window as any).YT) return; // already loaded
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  }, []);

  // Initialize player when video is loaded
  useEffect(() => {
    if (!video) return;

    const onYouTubeIframeAPIReady = () => {
      playerRef.current = new (window as any).YT.Player(`youtube-player`, {
        videoId: video.videoId,
        events: {
          onReady: () => console.log("Player ready"),
          onStateChange: (event: any) => {
            setPlaying(event.data === (window as any).YT.PlayerState.PLAYING);
          },
        },
        playerVars: { controls: 0, modestbranding: 1 },
      });
    };

    if ((window as any).YT && (window as any).YT.Player) {
      onYouTubeIframeAPIReady();
    } else {
      (window as any).onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
    }
  }, [video]);

  // Track progress
  useEffect(() => {
    if (!playerRef.current) return;

    const updateProgress = () => {
      const duration = playerRef.current.getDuration();
      const currentTime = playerRef.current.getCurrentTime();
      setProgress((currentTime / duration) * 100);
    };

    if (playing) {
      intervalRef.current = window.setInterval(updateProgress, 500);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing]);

  // Controls
  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
    setPlaying(!playing);
  };
  const skipForward = () => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(playerRef.current.getCurrentTime() + 10, true);
  };
  const skipBack = () => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(Math.max(playerRef.current.getCurrentTime() - 10, 0), true);
  };

  return (
    <div
      className="card w-full max-w-sm rounded-xl shadow p-4 bg-white"
      style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
    >
      {video ? (
        <div className="flex flex-col items-center">
          <div className="w-full rounded-lg overflow-hidden">
            <div id="youtube-player" className="w-full h-48"></div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-200 rounded mt-4">
            <div
              className="h-2 bg-green-500 rounded"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Controls below progress bar */}
          <div className="flex items-center justify-center space-x-4 mt-4">
            <button
              onClick={skipBack}
              className="bg-white bg-opacity-70 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition"
            >
              ⏪
            </button>
            <button
              onClick={togglePlay}
              className="bg-white bg-opacity-70 rounded-full w-12 h-12 flex items-center justify-center hover:bg-opacity-100 transition"
            >
              {playing ? "⏸️" : "▶️"}
            </button>
            <button
              onClick={skipForward}
              className="bg-white bg-opacity-70 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-100 transition"
            >
              ⏩
            </button>
          </div>
        </div>
      ) : (
        <p>Loading latest video...</p>
      )}
    </div>
  );
}
