import { withTimeout } from "./timeout";

export interface Point {
  x: number;
  y: number;
}

export interface FrameResult {
  timestampMs: number;
  frameImage: string;
  landmarks: Point[] | null;
  hip: Point | null;
  knee: Point | null;
}

export interface FramesResponse {
  start: FrameResult;
  bottom: FrameResult;
}

export interface ScoreResult {
  passed: boolean;
  cue: string;
}

// Base URL of the Python pose-analysis service (see /server). Public because
// the browser uploads the video directly to it — not proxied through a
// Next.js route — since Vercel's Node functions have a hard 4.5MB request
// body cap that a real phone-shot video can easily exceed.
const ANALYZE_SERVICE_URL = process.env.NEXT_PUBLIC_ANALYZE_SERVICE_URL;

function requireServiceUrl(): string {
  if (!ANALYZE_SERVICE_URL) {
    throw new Error(
      "Analysis service isn't configured (missing NEXT_PUBLIC_ANALYZE_SERVICE_URL)."
    );
  }
  return ANALYZE_SERVICE_URL;
}

async function parseErrorDetail(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return (
    (body && typeof body.detail === "string" && body.detail) ||
    "Something went wrong talking to the analysis service."
  );
}

export async function fetchFrames(
  file: File,
  startMs: number,
  bottomMs: number
): Promise<FramesResponse> {
  const baseUrl = requireServiceUrl();

  const formData = new FormData();
  formData.append("video", file);
  formData.append("startMs", String(Math.round(startMs)));
  formData.append("bottomMs", String(Math.round(bottomMs)));

  const response = await withTimeout(
    fetch(`${baseUrl}/frames`, { method: "POST", body: formData }),
    45000,
    "Extracting frames is taking too long. Check your connection and try again."
  );

  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }

  return response.json();
}

export async function scoreFrame(
  hipY: number,
  kneeY: number
): Promise<ScoreResult> {
  const baseUrl = requireServiceUrl();

  const response = await withTimeout(
    fetch(`${baseUrl}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hipY, kneeY }),
    }),
    15000,
    "Scoring is taking too long. Check your connection and try again."
  );

  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }

  return response.json();
}
