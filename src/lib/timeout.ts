// Races a promise against a timer. Only rescues cases where the event loop
// gets control back periodically (e.g. a slow series of awaited steps) — it
// cannot interrupt a single call that blocks the main thread synchronously
// the whole time. Still worth having everywhere async work talks to
// MediaPipe/network/hardware: it turns "silent hang forever" into "clear
// error after N seconds" for the common case.
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}
