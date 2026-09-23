import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { createPoseLandmarkerForVideo } from "./pose";
import { rules, type RuleOutcome } from "./rules";

const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;

// 200ms rather than 120ms: fewer frames means less total inference work,
// which matters a lot on slower mobile CPUs (see pose.ts for why we're on
// CPU delegate). A typical squat's eccentric+concentric phases still span
// well over a second, so this still gives plenty of samples to find the
// bottom of the rep accurately.
const FRAME_INTERVAL_MS = 200;

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

// Resolves with the video's actual currentTime once the seek settles, or
// null if the seek made no real progress at all (still worth discarding —
// that means we'd be re-analyzing a stale/duplicate frame under a new
// timestamp label, which is what caused inconsistent verdicts before).
// Deliberately does NOT require landing exactly on the requested time: on a
// slow device seeks often land a bit off-target but are still perfectly
// valid, real frames. Rejecting those too aggressively throws away good
// samples near the true bottom of the rep, which caused a wrong verdict on
// an otherwise clearly-good-depth squat. Callers should use the *actual*
// returned time as the sample's timestamp, not the originally requested one.
function seekTo(video: HTMLVideoElement, seconds: number): Promise<number | null> {
  return new Promise((resolve) => {
    const startingTime = video.currentTime;

    // Some browsers (notably Safari) never fire "seeked" when currentTime is
    // set to the value it's already at, since no seek actually occurs. The
    // very first frame (t=0) is exactly this case right after a video loads,
    // which without this guard hangs forever waiting for an event that never
    // comes — the whole analysis stalls at 0% with no error.
    if (Math.abs(startingTime - seconds) < 0.001) {
      resolve(startingTime);
      return;
    }

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      clearTimeout(timeoutId);
      resolve(video.currentTime);
    };
    video.addEventListener("seeked", onSeeked);

    // Safety net: some devices/codecs can also fail to fire "seeked" for a
    // legitimate seek (e.g. sparse-keyframe encodings). Never let a single
    // frame block the entire analysis indefinitely.
    const timeoutId = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      const madeProgress = Math.abs(video.currentTime - startingTime) > 0.01;
      resolve(madeProgress ? video.currentTime : null);
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

  // MediaPipe's VIDEO mode requires strictly increasing timestamps, and
  // *also* uses the actual millisecond gaps between them for its internal
  // temporal smoothing/tracking — passing an arbitrary always-increasing
  // counter (e.g. 1, 2, 3…) instead of realistic elapsed-time values distorts
  // that reasoning and produces wrong landmark positions, not just a crash.
  // So: track the real achieved time, and only nudge it forward the minimum
  // amount needed on the rare occasion an imprecise seek jitters backward
  // relative to the previous frame.
  let lastDetectTimestamp = -1;

  for (let t = 0; t < durationMs; t += FRAME_INTERVAL_MS) {
    const actualTimeSeconds = await seekTo(video, t / 1000);
    if (actualTimeSeconds === null) {
      onProgress?.(Math.min(t / durationMs, 1));
      continue;
    }

    let detectTimestamp = Math.round(actualTimeSeconds * 1000);
    if (detectTimestamp <= lastDetectTimestamp) {
      detectTimestamp = lastDetectTimestamp + 1;
    }
    lastDetectTimestamp = detectTimestamp;

    const result = landmarker.detectForVideo(video, detectTimestamp);
    const landmarks = result.landmarks[0];
    if (!landmarks) continue;

    samples.push({
      timeMs: actualTimeSeconds * 1000,
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
