"use client";

import { createContext, useContext, useState, ReactNode, useRef, useEffect } from "react";

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

  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);

  // Load YouTube API once
  useEffect(() => {
    // Only load the script once
    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }

    // Define the global callback
    (window as any).onYouTubeIframeAPIReady = () => {
      const YT = (window as any).YT;

      playerRef.current = new YT.Player("youtube-player-temp", {
        videoId: "", // empty initially
        events: {
          onReady: () => {
            setPlayerReady(true);
            fetchFirstVideo();
          },
          onStateChange: (event: any) => {
            if (event.data === YT.PlayerState.PLAYING) setPlaying(true);
            else if (event.data === YT.PlayerState.PAUSED) setPlaying(false);
            else if (event.data === YT.PlayerState.ENDED) fetchRandomVideo();
          },
        },
        playerVars: { controls: 0, modestbranding: 1 },
      });
    };
  }, []);

  // Track progress
  useEffect(() => {
    if (!playerRef.current) return;

    const updateProgress = () => {
      const duration = playerRef.current.getDuration();
      const currentTime = playerRef.current.getCurrentTime();
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
    playerRef.current.playVideo();
    setPlaying(true);
  };
  const pause = () => {
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

  // Fetch first video
  const fetchFirstVideo = async () => {
    try {
      const res = await fetch("/api/youtube");
      const data = await res.json();
      if (data.items?.length) {
        const item = data.items[0];
        const firstVideo = {
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium.url,
        };
        setVideo(firstVideo);

        // Load it in the player so play button works
        if (playerRef.current) {
          playerRef.current.loadVideoById(firstVideo.videoId);
        }
      }
    } catch (err) {
      console.error("Failed to fetch first video", err);
    }
  };

  // Fetch random video after previous ends
  const fetchRandomVideo = async () => {
    try {
      const res = await fetch("/api/youtube/random");
      const data = await res.json();
      if (data.items?.length) {
        const item = data.items[0];
        const newVideo = {
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium.url,
        };
        setVideo(newVideo);

        if (playerRef.current) {
          playerRef.current.loadVideoById(newVideo.videoId);
          playerRef.current.playVideo();
          setPlaying(true);
        }
      }
    } catch (err) {
      console.error("Failed to fetch random video", err);
    }
  };

  return (
    <MusicPlayerContext.Provider
      value={{ video, playing, progress, play, pause, skipForward, skipBack, setVideo }}
    >
      {children}
      <div id="youtube-player-temp" style={{ display: "none" }} />
    </MusicPlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(MusicPlayerContext);
  if (!context) throw new Error("usePlayer must be used within MusicPlayerProvider");
  return context;
};
