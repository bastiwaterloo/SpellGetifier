import { describe, it, expect } from 'vitest';
import { imageDataToMask, sumMask } from '../maskUtils.js';

// helper: build an RGBA buffer from a 2D array of 0 (white) / 1 (black)
function rgba(pixels) {
  const height = pixels.length;
  const width = pixels[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = pixels[y][x] ? 0 : 255; // 1 -> black, 0 -> white
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('imageDataToMask', () => {
  it('marks dark opaque pixels as ink', () => {
    const mask = imageDataToMask(rgba([[1, 0], [0, 1]]));
    expect(Array.from(mask.data)).toEqual([1, 0, 0, 1]);
    expect(mask.width).toBe(2);
    expect(mask.height).toBe(2);
  });

  it('treats fully transparent pixels as non-ink', () => {
    const img = rgba([[1]]);
    img.data[3] = 0; // alpha 0
    const mask = imageDataToMask(img);
    expect(mask.data[0]).toBe(0);
  });
});

describe('sumMask', () => {
  it('counts ink pixels', () => {
    const mask = imageDataToMask(rgba([[1, 1], [0, 1]]));
    expect(sumMask(mask)).toBe(3);
  });
});
