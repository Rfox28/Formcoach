// TS port of the connection topology used server-side (server/main.py used
// to draw this with OpenCV; now the client draws it since points need to be
// interactive). This is topology/styling duplication, not rule-logic
// duplication - the actual pass/fail threshold stays server-side in
// server/main.py's score() function, the single source of truth for that.
//
// Torso/arms/legs connections only - face and finger-level hand connections
// from the full MediaPipe topology aren't useful for a squat depth check.
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

export const CONNECTOR_COLOR = "#22c55e";
export const LANDMARK_COLOR = "#facc15";
