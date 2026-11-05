"use client";

import { createContext, useContext, useState, ReactNode, useRef, useEffect } from "react";
import { loadYouTubeAPI, type YouTubePlayer } from "@/lib/youtube-api";

interface Video {
  videoId: string;
  title: string;
  thumbnail: string;
}

interface MusicPlayerContextType {
  video: Video | null;
  playing: boolean;
  progress: number;
  play: () => void;
  pause: () => void;
  skipForward: () => void;
  skipBack: () => void;
  setVideo: (video: Video) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export const MusicPlayerProvider = ({ children }: { children: ReactNode }) => {
  const [video, setVideo] = useState<Video | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playbackRequestedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const container = playerContainerRef.current;
    if (!container) return;
    let disposed = false;
    let player: YouTubePlayer | null = null;
    const controller = new AbortController();

    const fetchVideo = async (random = false) => {
      try {
        const res = await fetch(random ? "/api/youtube/random" : "/api/youtube", { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (disposed || !data.items?.length) return;
        const item = data.items[0];
        const nextVideo = {
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium.url,
        };
        setVideo(nextVideo);
        // Cue the initial video without playing. If Pause was pressed while
        // fetching the next track, that track must also remain paused.
        if (playbackRequestedRef.current) player?.loadVideoById(nextVideo.videoId);
        else player?.cueVideoById(nextVideo.videoId);
        setProgress(0);
      } catch (err) {
        if (!disposed) console.error("Failed to fetch video", err);
      }
    };

    loadYouTubeAPI().then((YT) => {
      if (disposed) return;
      // YouTube replaces its mount element with an iframe. Keep that element
      // inside a stable wrapper whose DOM node remains under React's control.
      const mount = document.createElement("div");
      container.appendChild(mount);
      player = new YT.Player(mount, {
        videoId: "",
        events: {
          onReady: () => {
            if (disposed) return;
            setPlayerReady(true);
            void fetchVideo();
          },
          onStateChange: (event) => {
            if (disposed) return;
            if (event.data === YT.PlayerState.PLAYING) {
              if (!playbackRequestedRef.current) {
                player?.pauseVideo();
                return;
              }
              setPlaying(true);
            }
            else if (event.data === YT.PlayerState.PAUSED) setPlaying(false);
            else if (event.data === YT.PlayerState.ENDED && playbackRequestedRef.current) void fetchVideo(true);
          },
        },
        playerVars: { controls: 0, modestbranding: 1, autoplay: 0 },
      });
      playerRef.current = player;
    }).catch((err) => {
      if (!disposed) console.error("Failed to initialize YouTube player", err);
    });

    return () => {
      disposed = true;
      controller.abort();
      playerRef.current = null;
      player?.destroy();
      container.replaceChildren();
    };
  }, []);

  // Track progress
  useEffect(() => {
    if (!playerRef.current) return;

    const updateProgress = () => {
      const player = playerRef.current;
      if (!player) return;
      const duration = player.getDuration();
      const currentTime = player.getCurrentTime();
      if (duration) setProgress((currentTime / duration) * 100);
    };

    if (playing) intervalRef.current = window.setInterval(updateProgress, 500);
    else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [playing]);

  // Control functions
  const play = () => {
    if (!playerReady || !video || !playerRef.current) return;
    playbackRequestedRef.current = true;
    playerRef.current.playVideo();
    setPlaying(true);
  };
  const pause = () => {
    playbackRequestedRef.current = false;
    if (!playerRef.current) return;
    playerRef.current.pauseVideo();
    setPlaying(false);
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
    <MusicPlayerContext.Provider
      value={{ video, playing, progress, play, pause, skipForward, skipBack, setVideo }}
    >
      {children}
      <div ref={playerContainerRef} style={{ display: "none" }} />
    </MusicPlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(MusicPlayerContext);
  if (!context) throw new Error("usePlayer must be used within MusicPlayerProvider");
  return context;
};
