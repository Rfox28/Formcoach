"use client";

import { useEffect, useRef, useState } from "react";

interface VideoScrubberProps {
  file: File;
  onContinue: (startMs: number, bottomMs: number) => void;
}

// Frame-perfect client-side stepping is unnecessary here — the server's
// closest-actual-frame matching is specifically designed to absorb this
// imprecision, so there's no need for requestVideoFrameCallback (inconsistent
// browser support) or any other exact-frame machinery. Simple time-based
// nudges are enough; the "frame" button is deliberately labeled approximate.
const ASSUMED_FPS = 30;

export default function VideoScrubber({ file, onContinue }: VideoScrubberProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [bottomMs, setBottomMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const video = videoRef.current;
    if (video) video.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function seekTo(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    video.currentTime = Math.min(Math.max(ms, 0), durationMs) / 1000;
  }

  function nudge(deltaMs: number) {
    seekTo(currentMs + deltaMs);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  const canContinue = startMs !== null && bottomMs !== null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Scrub through your video and mark the start of the rep and the bottom
        of the rep.
      </p>

      {/*
        Deliberately NOT display:none. iOS Safari can refuse to load/decode
        video at all for display:none elements — no events fire, no error,
        permanent hang. This video needs to stay visible anyway since the
        coach is reviewing it directly.
      */}
      <video
        ref={videoRef}
        playsInline
        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
        onLoadedMetadata={(e) => setDurationMs(e.currentTarget.duration * 1000)}
        onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{(currentMs / 1000).toFixed(2)}s</span>
          <span>{(durationMs / 1000).toFixed(2)}s</span>
        </div>

        <div className="relative">
          <input
            type="range"
            min={0}
            max={Math.max(durationMs, 1)}
            step={1}
            value={currentMs}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="w-full"
          />
          {startMs !== null && durationMs > 0 && (
            <div
              className="pointer-events-none absolute top-1/2 h-2 w-0.5 -translate-y-1/2 bg-green-600"
              style={{ left: `${(startMs / durationMs) * 100}%` }}
              title="Start mark"
            />
          )}
          {bottomMs !== null && durationMs > 0 && (
            <div
              className="pointer-events-none absolute top-1/2 h-2 w-0.5 -translate-y-1/2 bg-amber-600"
              style={{ left: `${(bottomMs / durationMs) * 100}%` }}
              title="Bottom mark"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => nudge(-1000)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          >
            −1s
          </button>
          <button
            type="button"
            onClick={() => nudge(-100)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          >
            −0.1s
          </button>
          <button
            type="button"
            onClick={() => nudge(-1000 / ASSUMED_FPS)}
            title="Approximate — the server snaps to the exact nearest frame"
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          >
            −1 frame
          </button>
          <button
            type="button"
            onClick={() => nudge(1000 / ASSUMED_FPS)}
            title="Approximate — the server snaps to the exact nearest frame"
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          >
            +1 frame
          </button>
          <button
            type="button"
            onClick={() => nudge(100)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          >
            +0.1s
          </button>
          <button
            type="button"
            onClick={() => nudge(1000)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
          >
            +1s
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          // Read video.currentTime directly rather than the currentMs state
          // variable: that state is only updated by the "timeupdate" event,
          // which fires on its own cadence and is NOT guaranteed to have
          // fired yet immediately after a seek — clicking this right after
          // scrubbing could otherwise silently capture a stale, earlier
          // timestamp than what's actually on screen.
          onClick={() => setStartMs((videoRef.current?.currentTime ?? 0) * 1000)}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Set start {startMs !== null ? `(${(startMs / 1000).toFixed(2)}s)` : ""}
        </button>
        <button
          type="button"
          onClick={() => setBottomMs((videoRef.current?.currentTime ?? 0) * 1000)}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Set bottom {bottomMs !== null ? `(${(bottomMs / 1000).toFixed(2)}s)` : ""}
        </button>
      </div>

      {startMs !== null && bottomMs !== null && bottomMs < startMs && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Heads up: your bottom mark is earlier than your start mark — double
          check these are right.
        </p>
      )}

      <button
        type="button"
        disabled={!canContinue}
        onClick={() => onContinue(startMs!, bottomMs!)}
        className="self-start rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
      >
        Continue
      </button>
    </div>
  );
}
