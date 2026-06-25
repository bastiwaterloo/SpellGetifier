import * as tf from '@tensorflow/tfjs';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MATCH_THRESHOLD,
  PENALTY_WEIGHT,
  NMS_RELATIVE,
  ITERATIVE_SIZES,
  ITERATIVE_ROTATIONS,
} from '../config.js';
import { imageDataToMask } from './maskUtils.js';
import { loadRuneImages, rasterizeRotatedScaled } from './templateMasks.js';
import { computeScoreMap, getBackendReady } from './scoreMap.js';
import { dedupeFindings } from './findingDedup.js';

// Re-rasterize the canvas (its backing store is DPR-scaled) to logical
// 500x500 on a white background, then threshold to an ink mask.
export function canvasToMask(canvas) {
  const off = document.createElement('canvas');
  off.width = CANVAS_WIDTH;
  off.height = CANVAS_HEIGHT;
  const ctx = off.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.drawImage(canvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  return imageDataToMask(imageData);
}

export async function detectRunes(canvas) {
  await getBackendReady();
  const drawingMask = canvasToMask(canvas);

  // Build the drawing tensor once; it is referenced inside computeScoreMap's
  // tidy but owned here — disposed in finally so it is released even on throw.
  const drawingTensor = tf.tensor4d(
    drawingMask.data,
    [1, drawingMask.height, drawingMask.width, 1],
  );

  const candidates = [];

  try {
    const runes = await loadRuneImages();
    let variantCount = 0;

    for (const rune of runes) {
      for (const size of ITERATIVE_SIZES) {
        for (const rotation of ITERATIVE_ROTATIONS) {
          // Rasterize and threshold lazily — the mask (a plain Float32Array
          // wrapper) is discarded at end of iteration; it is not a tensor.
          const imageData = rasterizeRotatedScaled(rune.image, size, rotation);
          const mask = imageDataToMask(imageData);

          const { scores, width } = computeScoreMap(drawingTensor, mask, PENALTY_WEIGHT);

          // Keep the single best position for this rune/size/rotation; cross-
          // scale and cross-position duplicates are merged later by dedupeFindings.
          let bestScore = -Infinity;
          let bestIndex = -1;
          for (let i = 0; i < scores.length; i++) {
            if (scores[i] > bestScore) {
              bestScore = scores[i];
              bestIndex = i;
            }
          }

          if (bestScore >= MATCH_THRESHOLD && bestIndex >= 0) {
            const col = bestIndex % width;
            const row = Math.floor(bestIndex / width);
            candidates.push({
              id: rune.id,
              name: rune.name,
              imagePath: rune.imagePath,
              size,
              rotation,
              x: col + mask.width / 2,
              y: row + mask.height / 2,
              score: bestScore,
            });
          }

          // Yield to the UI at least every 16 variants so the
          // "Wirke Zauber…" indicator updates visibly.
          variantCount++;
          if (variantCount % 16 === 0) {
            await tf.nextFrame();
          }
        }
      }
    }
  } finally {
    drawingTensor.dispose();
  }

  const findings = dedupeFindings(candidates, NMS_RELATIVE).map((f) => ({
    ...f,
    score: Math.round(f.score * 100),
  }));

  if (findings.length === 0) {
    return { match: null, confidence: 0, message: 'Keine Runen gefunden', findings: [] };
  }

  const top = findings[0];
  return {
    match: { id: top.id, name: top.name, imagePath: top.imagePath },
    confidence: top.score,
    message: `${findings.length} Runen gefunden`,
    findings,
  };
}
