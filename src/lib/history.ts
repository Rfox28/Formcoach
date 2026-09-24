import { supabase } from "./supabase";

export interface SavedAnalysis {
  id: string;
  coach_id: string;
  created_at: string;
  cue: string;
  passed: boolean;
  frame_image: string;
}

export async function saveAnalysis(input: {
  cue: string;
  passed: boolean;
  frameImage: string;
}): Promise<void> {
  const { error } = await supabase.from("saved_analyses").insert({
    cue: input.cue,
    passed: input.passed,
    frame_image: input.frameImage,
  });
  if (error) throw error;
}

export async function fetchSavedAnalyses(): Promise<SavedAnalysis[]> {
  const { data, error } = await supabase
    .from("saved_analyses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
