"""FormCoach pose analysis service.

Runs pose detection for the squat-depth check using Google's official Python
MediaPipe SDK, server-side. See the project plan for why this migrated off
the browser: client-side pose detection on real phones (especially iOS
Safari) was the root cause of a long string of reliability bugs this project
hit during coach trials.

Second migration (this version): moved from a fully-automatic "AI finds the
bottom of the rep by itself" design to coach-guided frame selection. The
automatic approach produced borderline/inconsistent verdicts on videos where
the true hip-vs-knee margin is tiny (confirmed: identical re-runs of the same
video could flip pass/fail). Now the coach marks the start and bottom
timestamps themselves in the browser, and this service just extracts those
two specific frames and detects landmarks on them - the coach can then
correct the detected points client-side before a verdict is requested.

Frame extraction is still a single sequential decode, never raw
CAP_PROP_POS_MSEC seeking - that has the same imprecision problems on
phone-shot H.264 that browser video seeking had, which this project already
spent real effort solving once (see analyze.ts's git history before it was
deleted). One linear scan over the (short) clip finds the actual frames
closest to both requested timestamps in a single pass.
"""

import base64
import os
import tempfile
from typing import Optional

import cv2
import mediapipe as mp
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    RunningMode,
)
from pydantic import BaseModel

MODEL_PATH = os.path.join(os.path.dirname(__file__), "pose_landmarker_full.task")

LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26

app = FastAPI()

# TODO: tighten allow_origins to the deployed Vercel domain once known,
# instead of "*". Left open during initial setup/testing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

_landmarker = PoseLandmarker.create_from_options(
    PoseLandmarkerOptions(
        base_options=BaseOptions(
            model_asset_path=MODEL_PATH,
            delegate=BaseOptions.Delegate.CPU,
        ),
        # IMAGE mode, not VIDEO: each frame is judged independently, so there
        # is no need for MediaPipe's cross-frame tracking/smoothing - and no
        # timestamp bookkeeping at all, which sidesteps the exact bug class
        # (a naive monotonic counter distorting temporal smoothing) that
        # caused a real client-side regression before pose detection moved
        # server-side.
        running_mode=RunningMode.IMAGE,
        num_poses=1,
    )
)


class Point(BaseModel):
    x: float
    y: float


class FrameResult(BaseModel):
    timestampMs: float
    frameImage: str
    landmarks: Optional[list[Point]] = None
    hip: Optional[Point] = None
    knee: Optional[Point] = None


class FramesResponse(BaseModel):
    start: FrameResult
    bottom: FrameResult


class ScoreRequest(BaseModel):
    hipY: float
    kneeY: float


class ScoreResponse(BaseModel):
    passed: bool
    cue: str


def average_point(landmarks, a: int, b: int) -> Point:
    return Point(x=(landmarks[a].x + landmarks[b].x) / 2, y=(landmarks[a].y + landmarks[b].y) / 2)


def to_data_url(frame, max_dim: int = 640, quality: int = 80) -> str:
    h, w = frame.shape[:2]
    scale = min(1.0, max_dim / max(h, w))
    if scale < 1.0:
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("Failed to encode frame as JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")


def score(hip_y: float, knee_y: float) -> tuple[bool, str]:
    """The single source of truth for the depth-check rule. Kept in exactly
    one place (here) rather than duplicated into the client, even though the
    client now does the frame selection - the client should never need to
    know the pass/fail threshold itself."""
    passed = hip_y > knee_y
    cue = (
        "Good depth. Hip crease broke below the knee."
        if passed
        else "Not quite hitting depth. Drive the hips down until the crease breaks below the top of the knee."
    )
    return passed, cue


def find_closest_frames(cap, fps: float, targets_ms: dict[str, float]) -> dict:
    """Single sequential pass finding, for each named target timestamp, the
    actual decoded frame closest to it. Deliberately no early-break
    optimization even though each target's distance-to-frame is unimodal in
    frame index (so early exit would be theoretically valid) - a short rep
    clip is only a few hundred frames, and this project's history has
    repeatedly shown the cost of being clever in frame-sampling logic
    outweighs the (negligible, here) performance win of skipping the rest of
    a cheap linear scan."""
    best: dict[str, Optional[dict]] = {name: None for name in targets_ms}
    frame_index = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        timestamp_ms = (frame_index / fps) * 1000.0
        frame_index += 1

        for name, target_ms in targets_ms.items():
            diff = abs(timestamp_ms - target_ms)
            current = best[name]
            if current is None or diff < current["diff"]:
                best[name] = {"frame": frame.copy(), "timestampMs": timestamp_ms, "diff": diff}

    return best


def detect_frame(
    frame,
) -> tuple[Optional[list[Point]], Optional[Point], Optional[Point]]:
    """Runs pose detection on a single already-extracted frame. Returns the
    plain (un-annotated) frame's data URL plus landmarks/hip/knee, or None
    landmarks if no pose was found - the client falls back to manual point
    placement in that case rather than treating it as an error."""
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = _landmarker.detect(mp_image)

    landmarks = None
    hip = None
    knee = None
    if result.pose_landmarks:
        lm = result.pose_landmarks[0]
        landmarks = [Point(x=p.x, y=p.y) for p in lm]
        hip = average_point(lm, LEFT_HIP, RIGHT_HIP)
        knee = average_point(lm, LEFT_KNEE, RIGHT_KNEE)

    return landmarks, hip, knee


@app.post("/frames", response_model=FramesResponse)
async def frames(
    video: UploadFile = File(...),
    startMs: float = Form(...),
    bottomMs: float = Form(...),
):
    suffix = os.path.splitext(video.filename or "")[1] or ".mp4"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)

    try:
        with os.fdopen(fd, "wb") as f:
            f.write(await video.read())

        cap = cv2.VideoCapture(tmp_path)
        # iPhone videos store orientation as container metadata rather than
        # baking it into pixels. Browsers apply this automatically; OpenCV
        # historically does not, which can silently process sideways frames
        # while reporting success - breaking the orientation-dependent
        # hip-vs-knee check without looking like an error. Best-effort: not
        # all OpenCV builds/backends support this property.
        try:
            cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
        except Exception:
            pass

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        if fps <= 0:
            fps = 30.0

        matched = find_closest_frames(cap, fps, {"start": startMs, "bottom": bottomMs})
        cap.release()

        if matched["start"] is None or matched["bottom"] is None:
            raise HTTPException(
                status_code=422,
                detail="Could not read this video. Try a different file.",
            )

        results = {}
        for name in ("start", "bottom"):
            m = matched[name]
            landmarks, hip, knee = detect_frame(m["frame"])
            results[name] = FrameResult(
                timestampMs=m["timestampMs"],
                frameImage=to_data_url(m["frame"]),
                landmarks=landmarks,
                hip=hip,
                knee=knee,
            )

        return FramesResponse(start=results["start"], bottom=results["bottom"])
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.post("/score", response_model=ScoreResponse)
def score_endpoint(body: ScoreRequest):
    passed, cue = score(body.hipY, body.kneeY)
    return ScoreResponse(passed=passed, cue=cue)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
