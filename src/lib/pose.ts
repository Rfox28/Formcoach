import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { withTimeout } from "./timeout";

const WASM_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
// "lite" over "full": full is meaningfully more accurate about exact
// landmark placement, but combined with the CPU delegate (required for
// Safari reliability, see below) it was too slow on real phones — analysis
// never completed within a timeframe a coach would wait for, even though it
// wasn't technically hung. A coach who can't get a result at all is a worse
// outcome than one who gets a slightly less precise skeleton overlay.
const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let visionFilesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null =
  null;
let currentLandmarker: PoseLandmarker | null = null;

// PoseLandmarker's VIDEO mode tracks pose state across frames for
// performance and requires strictly increasing timestamps for the lifetime
// of the instance. Reusing one instance across separate video uploads
// carries over stale tracking state from the previous video (producing
// silently wrong results, not just an error) and breaks timestamp
// monotonicity once a new video's clock restarts at 0. So each analysis
// gets its own fresh instance; only the wasm fileset lookup is shared.
export async function createPoseLandmarkerForVideo(): Promise<PoseLandmarker> {
  currentLandmarker?.close();
  currentLandmarker = null;

  if (!visionFilesetPromise) {
    visionFilesetPromise = FilesetResolver.forVisionTasks(WASM_BASE_URL);
  }
  const vision = await visionFilesetPromise;

  // The GPU delegate has well-documented reliability problems on iOS
  // Safari specifically (incorrect results, crashes, and initialization
  // hangs — see google-ai-edge/mediapipe issues #6142, #5970, #5788). CPU
  // is slower per frame but works consistently everywhere, which matters
  // more than speed for a tool coaches are trialing on their phones.
  currentLandmarker = await withTimeout(
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_URL,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    }),
    20000,
    "Could not load the pose detection model. Check your connection and try again."
  );
  return currentLandmarker;
}
