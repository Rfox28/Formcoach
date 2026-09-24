"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { fetchSavedAnalyses, type SavedAnalysis } from "@/lib/history";

type LoadState = "idle" | "loading" | "loaded" | "error";

export default function HistoryPage() {
  const { session, loading: sessionLoading } = useSession();
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setLoadState("loading");
    setError(null);

    fetchSavedAnalyses()
      .then((rows) => {
        if (cancelled) return;
        setAnalyses(rows);
        setLoadState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load your history."
        );
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Saved analyses
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Every squat depth check you've saved, newest first.
          </p>
        </div>

        {sessionLoading && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}

        {!sessionLoading && !session && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Sign in above to view your saved analyses.
          </p>
        )}

        {session && loadState === "loading" && (
          <p className="text-sm text-zinc-500">Loading your history…</p>
        )}

        {session && loadState === "error" && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {session && loadState === "loaded" && analyses.length === 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No saved analyses yet.
          </p>
        )}

        {session && loadState === "loaded" && analyses.length > 0 && (
          <div className="flex flex-col gap-6">
            {analyses.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.frame_image}
                  alt="Bottom-of-rep frame"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
                />
                <div
                  className={`rounded-lg border p-3 text-sm font-medium ${
                    row.passed
                      ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
                      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  }`}
                >
                  {row.cue}
                </div>
                <p className="text-xs text-zinc-500">
                  {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
