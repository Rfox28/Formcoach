"use client";

import { useState } from "react";
import { useSession } from "@/lib/useSession";
import { saveAnalysis } from "@/lib/history";
import { flattenFrame } from "@/lib/flattenFrame";
import {
  fetchFrames,
  scoreFrame,
  type FramesResponse,
  type Point,
} from "@/lib/analyzeApi";
import VideoScrubber from "@/components/VideoScrubber";
import FrameCorrector from "@/components/FrameCorrector";

type Step =
  | "select"
  | "mark"
  | "extracting"
  | "correct"
  | "scoring"
  | "done"
  | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

// Seeded when the server couldn't detect a pose automatically — sane enough
// starting positions that dragging into place is quick, not a guess at the
// coach's actual body position.
const DEFAULT_HIP: Point = { x: 0.5, y: 0.6 };
const DEFAULT_KNEE: Point = { x: 0.5, y: 0.75 };

export default function Home() {
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [frames, setFrames] = useState<FramesResponse | null>(null);
  const [startHip, setStartHip] = useState<Point>(DEFAULT_HIP);
  const [startKnee, setStartKnee] = useState<Point>(DEFAULT_KNEE);
  const [bottomHip, setBottomHip] = useState<Point>(DEFAULT_HIP);
  const [bottomKnee, setBottomKnee] = useState<Point>(DEFAULT_KNEE);

  const [cue, setCue] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { session } = useSession();

  function reset() {
    setStep("select");
    setFile(null);
    setError(null);
    setFrames(null);
    setCue(null);
    setSaveState("idle");
    setSaveError(null);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    setStep("mark");
  }

  async function handleMarksChosen(startMs: number, bottomMs: number) {
    if (!file) return;
    setStep("extracting");
    setError(null);

    try {
      const result = await fetchFrames(file, startMs, bottomMs);
      setFrames(result);
      setStartHip(result.start.hip ?? DEFAULT_HIP);
      setStartKnee(result.start.knee ?? DEFAULT_KNEE);
      setBottomHip(result.bottom.hip ?? DEFAULT_HIP);
      setBottomKnee(result.bottom.knee ?? DEFAULT_KNEE);
      setStep("correct");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not extract frames."
      );
      setStep("error");
    }
  }

  async function handleConfirm() {
    setStep("scoring");
    setError(null);

    try {
      const result = await scoreFrame(bottomHip.y, bottomKnee.y);
      setCue(result.cue);
      setPassed(result.passed);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not score this rep.");
      setStep("error");
    }
  }

  async function handleSave() {
    if (!frames || !cue) return;

    setSaveState("saving");
    setSaveError(null);
    try {
      const [startFrameImage, bottomFrameImage] = await Promise.all([
        flattenFrame(frames.start.frameImage, frames.start.landmarks, startHip, startKnee),
        flattenFrame(frames.bottom.frameImage, frames.bottom.landmarks, bottomHip, bottomKnee),
      ]);
      await saveAnalysis({ cue, passed, startFrameImage, bottomFrameImage });
      setSaveState("saved");
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save this analysis."
      );
      setSaveState("error");
    }
  }

  const busy = step === "extracting" || step === "scoring";

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            FormCoach — Squat Depth Check
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Upload a side-on air squat video, mark the start and bottom of
            the rep yourself, and correct the detected hip/knee points if
            they look off before getting a verdict.
          </p>
        </div>

        {step === "select" && (
          <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white p-10 text-center transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
            <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Choose a squat video
            </span>
            <span className="text-xs text-zinc-500">
              MP4 or MOV, filmed side-on
            </span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onInputChange}
            />
          </label>
        )}

        {step !== "select" && (
          <button
            type="button"
            onClick={reset}
            className="self-start text-xs text-zinc-500 underline underline-offset-2"
          >
            Choose a different video
          </button>
        )}

        {step === "mark" && file && (
          <VideoScrubber file={file} onContinue={handleMarksChosen} />
        )}

        {busy && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {step === "extracting" ? "Extracting frames…" : "Scoring…"}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-zinc-950 dark:bg-zinc-50" />
            </div>
          </div>
        )}

        {step === "error" && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {(step === "correct" || step === "done") && frames && (
          <div className="flex flex-col gap-6">
            <FrameCorrector
              label="Start"
              frameImage={frames.start.frameImage}
              landmarks={frames.start.landmarks}
              hip={startHip}
              knee={startKnee}
              onHipChange={setStartHip}
              onKneeChange={setStartKnee}
            />
            <FrameCorrector
              label="Bottom"
              frameImage={frames.bottom.frameImage}
              landmarks={frames.bottom.landmarks}
              hip={bottomHip}
              knee={bottomKnee}
              onHipChange={setBottomHip}
              onKneeChange={setBottomKnee}
            />
          </div>
        )}

        {step === "correct" && (
          <button
            type="button"
            onClick={handleConfirm}
            className="self-start rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
          >
            Confirm points &amp; get verdict
          </button>
        )}

        {step === "done" && cue && (
          <div className="flex flex-col gap-3">
            <div
              className={`rounded-lg border p-4 text-sm font-medium ${
                passed
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
              }`}
            >
              {cue}
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
        )}
      </main>
    </div>
  );
}
