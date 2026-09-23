import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { createPoseLandmarkerForVideo } from "./pose";
import { rules, type RuleOutcome } from "./rules";

const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;

const FRAME_INTERVAL_MS = 120;

export interface FrameSample {
  timeMs: number;
  hipY: number;
  kneeY: number;
  landmarks: NormalizedLandmark[];
}

export interface AnalysisResult {
  bottomFrame: FrameSample;
  outcomes: RuleOutcome[];
}

function averageY(landmarks: NormalizedLandmark[], a: number, b: number) {
  return (landmarks[a].y + landmarks[b].y) / 2;
}

function seekTo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    // Some browsers (notably Safari) never fire "seeked" when currentTime is
    // set to the value it's already at, since no seek actually occurs. The
    // very first frame (t=0) is exactly this case right after a video loads,
    // which without this guard hangs forever waiting for an event that never
    // comes — the whole analysis stalls at 0% with no error.
    if (Math.abs(video.currentTime - seconds) < 0.001) {
      resolve();
      return;
    }

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      clearTimeout(timeoutId);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);

    // Safety net: some devices/codecs can also fail to fire "seeked" for a
    // legitimate seek (e.g. sparse-keyframe encodings). Never let a single
    // frame block the entire analysis indefinitely.
    const timeoutId = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }, 2000);

    video.currentTime = seconds;
  });
}

export async function analyzeSquatVideo(
  video: HTMLVideoElement,
  onProgress?: (fraction: number) => void
): Promise<AnalysisResult> {
  const landmarker = await createPoseLandmarkerForVideo();
  const durationMs = video.duration * 1000;
  const samples: FrameSample[] = [];

  for (let t = 0; t < durationMs; t += FRAME_INTERVAL_MS) {
    await seekTo(video, t / 1000);
    const result = landmarker.detectForVideo(video, Math.round(t));
    const landmarks = result.landmarks[0];
    if (!landmarks) continue;

    samples.push({
      timeMs: t,
      hipY: averageY(landmarks, LEFT_HIP, RIGHT_HIP),
      kneeY: averageY(landmarks, LEFT_KNEE, RIGHT_KNEE),
      landmarks,
    });

    onProgress?.(Math.min(t / durationMs, 1));
  }

  if (samples.length === 0) {
    throw new Error(
      "No pose detected in this video. Try a clearer, side-on shot with the full body in frame."
    );
  }

  // The bottom of the rep is the frame where the hip crease is closest to
  // (or furthest below) the knee, not just wherever the hip is lowest on
  // screen in isolation. A pure "max hip.y" search breaks on hip-hinge-heavy
  // reps: hips travel backward more than down, so hip.y can jitter to its
  // highest value during an early weight-shift rather than the true bottom.
  // Optimizing for the hip-to-knee relationship directly targets what the
  // rule actually checks, so it stays accurate for both real squats and
  // poor-form reps.
  const bottomFrame = samples.reduce((deepest, sample) =>
    sample.kneeY - sample.hipY < deepest.kneeY - deepest.hipY ? sample : deepest
  );

  const outcomes = rules.map((rule) =>
    rule.check({ hipY: bottomFrame.hipY, kneeY: bottomFrame.kneeY })
  );

  onProgress?.(1);

  return { bottomFrame, outcomes };
}
