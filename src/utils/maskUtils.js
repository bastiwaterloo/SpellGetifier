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

// Morphological dilation of a binary mask by `radius` pixels (square structuring
// element), implemented as two separable max passes for O(w*h*radius) cost. A
// pixel becomes ink if any pixel within `radius` (Chebyshev distance) is ink.
// Thickens thin strokes so near-misses still overlap during correlation.
export function dilateMask(mask, radius) {
  if (radius <= 0) return mask;
  const { width, height, data } = mask;

  const horizontal = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let on = 0;
      const lo = Math.max(0, x - radius);
      const hi = Math.min(width - 1, x + radius);
      for (let xx = lo; xx <= hi; xx++) {
        if (data[row + xx]) { on = 1; break; }
      }
      horizontal[row + x] = on;
    }
  }

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      const lo = Math.max(0, y - radius);
      const hi = Math.min(height - 1, y + radius);
      for (let yy = lo; yy <= hi; yy++) {
        if (horizontal[yy * width + x]) { on = 1; break; }
      }
      out[y * width + x] = on;
    }
  }

  return { data: out, width, height };
}
