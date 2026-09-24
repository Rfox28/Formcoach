"""FormCoach pose analysis service.

Runs the same squat-depth check that used to run entirely in the browser via
@mediapipe/tasks-vision, but server-side using Google's official Python
MediaPipe SDK. See /server/README.md and the project plan for why this
migration happened: client-side pose detection on real phones (especially
iOS Safari) was the root cause of a long string of reliability bugs this
project hit during coach trials.

Deliberately does NOT port the client-side seek/VIDEO-mode timestamp
machinery from analyze.ts/pose.ts - those existed to work around browser-
specific problems (imprecise HTMLVideoElement seeking, MediaPipe VIDEO mode's
monotonic-timestamp requirement) that don't exist in this stateless,
sequential-decode server context. See the project plan for the fuller
reasoning.
"""

import base64
import os
import tempfile

import cv2
import mediapipe as mp
from fastapi import FastAPI, File, HTTPException, UploadFile
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

# 200ms matches the client-side FRAME_INTERVAL_MS this replaces.
FRAME_INTERVAL_MS = 200.0

# Torso/arms/legs connections only - face and finger-level hand connections
# from the full MediaPipe topology aren't useful for a squat depth check and
# just add drawing-code surface area for no benefit here.
POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (27, 29), (29, 31), (27, 31),
    (24, 26), (26, 28), (28, 30), (30, 32), (28, 32),
]
# OpenCV uses BGR, not RGB - these match the hex colors the old client-side
# overlay used (#22c55e green connectors, #facc15 yellow landmark dots).
CONNECTOR_COLOR_BGR = (94, 197, 34)
LANDMARK_COLOR_BGR = (21, 204, 250)

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
        # IMAGE mode, not VIDEO: each sampled frame is judged independently
        # (is hip below knee right now), so there's no need for MediaPipe's
        # cross-frame tracking/smoothing - and no timestamp bookkeeping at
        # all, which sidesteps the exact bug class (a naive monotonic
        # counter distorting temporal smoothing) that caused the most
        # recent client-side regression before this migration.
        running_mode=RunningMode.IMAGE,
        num_poses=1,
    )
)


class AnalysisResponse(BaseModel):
    passed: bool
    cue: str
    frameImage: str


def average_y(landmarks, a: int, b: int) -> float:
    return (landmarks[a].y + landmarks[b].y) / 2


def draw_skeleton(frame, landmarks):
    h, w = frame.shape[:2]
    points = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]
    for a, b in POSE_CONNECTIONS:
        cv2.line(frame, points[a], points[b], CONNECTOR_COLOR_BGR, 3)
    for x, y in points:
        cv2.circle(frame, (x, y), 5, LANDMARK_COLOR_BGR, -1)
    return frame


def to_data_url(frame, max_dim: int = 640, quality: int = 80) -> str:
    h, w = frame.shape[:2]
    scale = min(1.0, max_dim / max(h, w))
    if scale < 1.0:
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("Failed to encode frame as JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(video: UploadFile = File(...)):
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

        best = None  # dict: frame, landmarks, hipY, kneeY
        frame_index = 0
        last_kept_ms = -1_000_000.0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Sequential decode + derived timestamp, not seek-based sampling.
            # OpenCV's CAP_PROP_POS_MSEC seeking has the same imprecision
            # problems on phone-shot H.264 that HTMLVideoElement seeking did
            # in the browser - sequential read sidesteps that class of bug
            # entirely rather than reimplementing a workaround for it.
            timestamp_ms = (frame_index / fps) * 1000.0
            frame_index += 1
            if timestamp_ms - last_kept_ms < FRAME_INTERVAL_MS:
                continue
            last_kept_ms = timestamp_ms

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = _landmarker.detect(mp_image)
            if not result.pose_landmarks:
                continue

            landmarks = result.pose_landmarks[0]
            hip_y = average_y(landmarks, LEFT_HIP, RIGHT_HIP)
            knee_y = average_y(landmarks, LEFT_KNEE, RIGHT_KNEE)

            # Bottom of the rep = frame minimizing kneeY - hipY (closest to,
            # or furthest past, hip breaking below knee) - not just max
            # hip.y in isolation. Matches the heuristic already validated
            # this session against hip-hinge-style bad-form reps, where raw
            # hip height alone picks the wrong frame.
            if best is None or (knee_y - hip_y) < (best["kneeY"] - best["hipY"]):
                best = {
                    "frame": frame.copy(),
                    "landmarks": landmarks,
                    "hipY": hip_y,
                    "kneeY": knee_y,
                }

        cap.release()

        if best is None:
            raise HTTPException(
                status_code=422,
                detail="No pose detected in this video. Try a clearer, side-on shot with the full body in frame.",
            )

        annotated = draw_skeleton(best["frame"], best["landmarks"])
        frame_image = to_data_url(annotated)

        passed = best["hipY"] > best["kneeY"]
        cue = (
            "Good depth. Hip crease broke below the knee."
            if passed
            else "Not quite hitting depth. Drive the hips down until the crease breaks below the top of the knee."
        )

        return AnalysisResponse(passed=passed, cue=cue, frameImage=frame_image)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
