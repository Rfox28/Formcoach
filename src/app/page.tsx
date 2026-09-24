"use client";

import { useState } from "react";
import { useSession } from "@/lib/useSession";
import { saveAnalysis } from "@/lib/history";
import { withTimeout } from "@/lib/timeout";

type Status = "idle" | "analyzing" | "done" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

interface AnalysisResult {
  passed: boolean;
  cue: string;
  frameImage: string;
}

// Base URL of the Python pose-analysis service (see /server). Public because
// the browser uploads the video directly to it — not proxied through a
// Next.js route — since Vercel's Node functions have a hard 4.5MB request
// body cap that a real phone-shot video can easily exceed.
const ANALYZE_SERVICE_URL = process.env.NEXT_PUBLIC_ANALYZE_SERVICE_URL;

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const { session } = useSession();

  async function handleFile(file: File) {
    if (!ANALYZE_SERVICE_URL) {
      setError(
        "Analysis service isn't configured (missing NEXT_PUBLIC_ANALYZE_SERVICE_URL)."
      );
      setStatus("error");
      return;
    }

    setStatus("analyzing");
    setError(null);
    setResult(null);
    setSaveState("idle");
    setSaveError(null);

    try {
      const formData = new FormData();
      formData.append("video", file);

      const response = await withTimeout(
        fetch(`${ANALYZE_SERVICE_URL}/analyze`, {
          method: "POST",
          body: formData,
        }),
        45000,
        "Analysis is taking too long. Check your connection and try again."
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body && typeof body.detail === "string" && body.detail) ||
            "Something went wrong analyzing this video."
        );
      }

      const analysis: AnalysisResult = await response.json();
      setResult(analysis);
      setStatus("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong analyzing this video."
      );
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleSave() {
    if (!result) return;

    setSaveState("saving");
    setSaveError(null);
    try {
      await saveAnalysis({
        cue: result.cue,
        passed: result.passed,
        frameImage: result.frameImage,
      });
      setSaveState("saved");
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save this analysis."
      );
      setSaveState("error");
    }
  }

  const busy = status === "analyzing";

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
              Analyzing rep…
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-zinc-950 dark:bg-zinc-50" />
            </div>
          </div>
        )}

        {status === "error" && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {status === "done" && result && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.frameImage}
              alt="Bottom-of-rep frame with pose overlay"
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
            />

            <div className="flex flex-col gap-3">
              <div
                className={`rounded-lg border p-4 text-sm font-medium ${
                  result.passed
                    ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
                    : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                }`}
              >
                {result.cue}
              </div>

              {session ? (
                <button
                  onClick={handleSave}
                  disabled={saveState === "saving" || saveState === "saved"}
                  className="self-start rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                >
                  {saveState === "saved"
                    ? "Saved ✓"
                    : saveState === "saving"
                    ? "Saving…"
                    : "Save analysis"}
                </button>
              ) : (
                <p className="text-xs text-zinc-500">
                  Sign in above to save this to your history.
                </p>
              )}

              {saveState === "error" && saveError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {saveError}
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
