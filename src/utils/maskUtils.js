// Convert an ImageData-like object to a binary ink mask.
// Ink = dark and opaque. Returns a Float32Array (1 = ink, 0 = background).
export function imageDataToMask({ data, width, height }, threshold = 128) {
  const mask = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const opaque = data[i + 3] > 0;
    mask[p] = opaque && luminance < threshold ? 1 : 0;
  }
  return { data: mask, width, height };
}

export function sumMask(mask) {
  let total = 0;
  for (let i = 0; i < mask.data.length; i++) total += mask.data[i];
  return total;
}
