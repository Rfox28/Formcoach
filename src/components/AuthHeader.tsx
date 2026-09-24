"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";

type Mode = "signin" | "signup";

export default function AuthHeader() {
  const { session, user, loading } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Check your email to confirm your account, then sign in.");
        }
      }
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <header className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        {loading ? (
          <span className="text-xs text-zinc-500">Loading…</span>
        ) : session && user ? (
          <>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {user.email}
            </span>
            <div className="flex items-center gap-3">
              <Link
                href="/history"
                className="text-xs font-medium text-zinc-950 underline underline-offset-2 dark:text-zinc-50"
              >
                History
              </Link>
              <button
                onClick={handleSignOut}
                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-950 dark:border-zinc-700 dark:text-zinc-50"
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-wrap items-center gap-2"
          >
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
            >
              {mode === "signin" ? "Sign in" : "Sign up"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setInfo(null);
              }}
              className="text-xs text-zinc-500 underline underline-offset-2"
            >
              {mode === "signin" ? "New here? Create an account" : "Already have an account?"}
            </button>
            {error && (
              <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
            {info && (
              <p className="w-full text-xs text-zinc-500">{info}</p>
            )}
          </form>
        )}
      </div>
    </header>
  );
}
