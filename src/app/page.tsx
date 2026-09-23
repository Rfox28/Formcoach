"use client";

import { useRef, useState } from "react";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { analyzeSquatVideo, type AnalysisResult } from "@/lib/analyze";
import { withTimeout } from "@/lib/timeout";

type Status = "idle" | "loading" | "analyzing" | "done" | "error";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function handleFile(file: File) {
    const video = videoRef.current;
    if (!video) return;

    setStatus("loading");
    setError(null);
    setResult(null);
    setProgress(0);

    const url = URL.createObjectURL(file);
    video.src = url;

    try {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(
            new Error(
              "This video is taking too long to load. Try a shorter clip or a different browser."
            )
          );
        }, 15000);
        video.onloadedmetadata = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timeoutId);
          reject(new Error("Could not load this video file."));
        };
      });

      setStatus("analyzing");
      const analysis = await withTimeout(
        analyzeSquatVideo(video, (fraction) => setProgress(fraction)),
        45000,
        "Analysis is taking too long on this device. Try a shorter video, a different browser, or a Wi-Fi connection."
      );
      await drawBottomFrame(video, analysis);
      setResult(analysis);
      setStatus("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong analyzing this video."
      );
      setStatus("error");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function drawBottomFrame(
    video: HTMLVideoElement,
    analysis: AnalysisResult
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = analysis.bottomFrame.timeMs / 1000;
    });

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const drawingUtils = new DrawingUtils(ctx);
    drawingUtils.drawConnectors(
      analysis.bottomFrame.landmarks,
      PoseLandmarker.POSE_CONNECTIONS,
      { color: "#22c55e", lineWidth: 3 }
    );
    drawingUtils.drawLandmarks(analysis.bottomFrame.landmarks, {
      color: "#facc15",
      radius: 4,
    });
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const primaryOutcome = result?.outcomes[0];
  const busy = status === "loading" || status === "analyzing";

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            FormCoach — Squat Depth Check
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Upload a side-on air squat video. FormCoach finds the bottom of
            the rep and checks one rule: does the hip crease break below the
            top of the knee.
          </p>
        </div>

        <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white p-10 text-center transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            {status === "idle" ? "Choose a squat video" : "Choose a different video"}
          </span>
          <span className="text-xs text-zinc-500">
            MP4 or MOV, filmed side-on
          </span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={onInputChange}
            disabled={busy}
          />
        </label>

        {busy && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {status === "loading"
                ? "Loading pose model…"
                : "Analyzing rep…"}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-950 transition-all dark:bg-zinc-50"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {status === "error" && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {/*
          Deliberately NOT display:none (Tailwind's `hidden`). iOS Safari can
          refuse to load or decode video at all for display:none elements —
          no events ever fire, no error, just a permanent hang before
          analysis even starts. Keeping it in the render tree (just visually
          collapsed to nothing) avoids that failure mode.
        */}
        <video
          ref={videoRef}
          className="absolute h-px w-px overflow-hidden opacity-0"
          style={{ pointerEvents: "none" }}
          playsInline
          muted
        />

        <canvas
          ref={canvasRef}
          className={`w-full rounded-xl border border-zinc-200 dark:border-zinc-800 ${
            status === "done" ? "block" : "hidden"
          }`}
        />

        {status === "done" && primaryOutcome && (
          <div
            className={`rounded-lg border p-4 text-sm font-medium ${
              primaryOutcome.passed
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            {primaryOutcome.cue}
          </div>
        )}
      </main>
    </div>
  );
}
