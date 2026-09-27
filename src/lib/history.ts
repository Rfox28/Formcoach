import { supabase } from "./supabase";

export interface SavedAnalysis {
  id: string;
  coach_id: string;
  created_at: string;
  cue: string;
  passed: boolean;
  start_frame_image: string;
  bottom_frame_image: string;
}

export async function saveAnalysis(input: {
  cue: string;
  passed: boolean;
  startFrameImage: string;
  bottomFrameImage: string;
}): Promise<void> {
  const { error } = await supabase.from("saved_analyses").insert({
    cue: input.cue,
    passed: input.passed,
    start_frame_image: input.startFrameImage,
    bottom_frame_image: input.bottomFrameImage,
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
