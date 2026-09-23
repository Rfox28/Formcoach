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
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
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

  const bottomFrame = samples.reduce((lowest, sample) =>
    sample.hipY > lowest.hipY ? sample : lowest
  );

  const outcomes = rules.map((rule) =>
    rule.check({ hipY: bottomFrame.hipY, kneeY: bottomFrame.kneeY })
  );

  onProgress?.(1);

  return { bottomFrame, outcomes };
}
