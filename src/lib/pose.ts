import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

let visionFilesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null =
  null;
let currentLandmarker: PoseLandmarker | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

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
