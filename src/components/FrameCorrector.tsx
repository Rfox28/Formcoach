"use client";

import { useRef, useState } from "react";
import type { Point } from "@/lib/analyzeApi";
import { POSE_CONNECTIONS, CONNECTOR_COLOR, LANDMARK_COLOR } from "@/lib/poseConnections";

interface FrameCorrectorProps {
  label: string;
  frameImage: string;
  landmarks: Point[] | null;
  hip: Point;
  knee: Point;
  onHipChange: (p: Point) => void;
  onKneeChange: (p: Point) => void;
}

type Dragging = "hip" | "knee" | null;

export default function FrameCorrector({
  label,
  frameImage,
  landmarks,
  hip,
  knee,
  onHipChange,
  onKneeChange,
}: FrameCorrectorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Dragging>(null);

  function pointFromEvent(e: React.PointerEvent): Point {
    const rect = wrapperRef.current!.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    return { x, y };
  }

  function startDrag(which: Dragging) {
    return (e: React.PointerEvent) => {
      // setPointerCapture keeps the drag tracking even if the pointer
      // briefly leaves the handle's bounds (important for fast touch
      // drags on a small phone screen) — but it's not essential, just an
      // improvement, so a failure here must never block starting the drag
      // itself. Without this try/catch, an exception here would abort the
      // handler before setDragging runs, silently breaking the whole
      // interaction in whatever environment it happened in.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignored — dragging still works via the wrapper's onPointerMove
        // as long as the pointer stays within its bounds.
      }
      setDragging(which);
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const p = pointFromEvent(e);
    if (dragging === "hip") onHipChange(p);
    else onKneeChange(p);
  }

  function endDrag() {
    setDragging(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-zinc-500">{label}</p>

      {!landmarks && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Pose not detected automatically — drag the hip and knee points into
          position.
        </div>
      )}

      <div
        ref={wrapperRef}
        className="relative select-none"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frameImage}
          alt={`${label} frame`}
          className="block h-auto w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
          draggable={false}
        />

        {landmarks && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {POSE_CONNECTIONS.map(([a, b], i) => {
              const pa = landmarks[a];
              const pb = landmarks[b];
              if (!pa || !pb) return null;
              return (
                <line
                  key={i}
                  x1={`${pa.x * 100}%`}
                  y1={`${pa.y * 100}%`}
                  x2={`${pb.x * 100}%`}
                  y2={`${pb.y * 100}%`}
                  stroke={CONNECTOR_COLOR}
                  strokeWidth={3}
                />
              );
            })}
            {landmarks.map((p, i) => (
              <circle
                key={i}
                cx={`${p.x * 100}%`}
                cy={`${p.y * 100}%`}
                r={4}
                fill={LANDMARK_COLOR}
              />
            ))}
          </svg>
        )}

        {/* Draggable hip/knee handles — visually distinct (bigger, different
            color) from the static context skeleton above. touch-action:none
            is required so iOS Safari's default touch-scroll doesn't hijack
            the drag gesture. */}
        <div
          onPointerDown={startDrag("hip")}
          className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-red-500 shadow-md active:cursor-grabbing"
          style={{ left: `${hip.x * 100}%`, top: `${hip.y * 100}%`, touchAction: "none" }}
          title="Hip — drag to correct"
        />
        <div
          onPointerDown={startDrag("knee")}
          className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-blue-500 shadow-md active:cursor-grabbing"
          style={{ left: `${knee.x * 100}%`, top: `${knee.y * 100}%`, touchAction: "none" }}
          title="Knee — drag to correct"
        />
      </div>

      <div className="flex gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Hip
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> Knee
        </span>
      </div>
    </div>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
