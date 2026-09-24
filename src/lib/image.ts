export function toResizedDataUrl(
  source: HTMLCanvasElement,
  maxDim = 640,
  quality = 0.8
): string {
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  if (scale === 1) return source.toDataURL("image/jpeg", quality);

  const scaled = document.createElement("canvas");
  scaled.width = Math.round(source.width * scale);
  scaled.height = Math.round(source.height * scale);
  scaled.getContext("2d")?.drawImage(source, 0, 0, scaled.width, scaled.height);
  return scaled.toDataURL("image/jpeg", quality);
}
