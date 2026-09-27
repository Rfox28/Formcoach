import { POSE_CONNECTIONS, CONNECTOR_COLOR, LANDMARK_COLOR } from "./poseConnections";
import type { Point } from "./analyzeApi";

// Bakes the base frame + full skeleton (for context) + the hip/knee markers
// at their current (possibly coach-corrected) positions into a single JPEG
// data URL. Called only at Save time, not on every drag — keeps the
// database storing plain images rather than needing to persist landmark
// JSON just for the history view to re-render them.
export async function flattenFrame(
  frameImage: string,
  landmarks: Point[] | null,
  hip: Point,
  knee: Point
): Promise<string> {
  const img = await loadImage(frameImage);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  ctx.drawImage(img, 0, 0);

  const w = canvas.width;
  const h = canvas.height;

  if (landmarks) {
    ctx.strokeStyle = CONNECTOR_COLOR;
    ctx.lineWidth = 3;
    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }

    ctx.fillStyle = LANDMARK_COLOR;
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Hip/knee drawn last, larger, so the (possibly corrected) values are
  // clearly visible even where they overlap the base skeleton dots above.
  drawMarker(ctx, hip, w, h, "#ef4444");
  drawMarker(ctx, knee, w, h, "#3b82f6");

  return canvas.toDataURL("image/jpeg", 0.85);
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  point: Point,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.x * w, point.y * h, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load frame image"));
    img.src = src;
  });
}
