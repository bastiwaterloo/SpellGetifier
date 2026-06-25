import * as tf from '@tensorflow/tfjs';
import {
  CANVAS_WIDTH,
  DETECTION_RESOLUTION,
  MATCH_THRESHOLD,
  PENALTY_WEIGHT,
  NMS_RELATIVE,
  ITERATIVE_SIZES,
  ITERATIVE_ROTATIONS,
} from '../config.js';
import { imageDataToMask } from './maskUtils.js';
import { loadRuneImages, rasterizeRotatedScaled } from './templateMasks.js';
import { computeBatchedScoreMap, getBackendReady } from './scoreMap.js';
import { dedupeFindings } from './findingDedup.js';

// Downscale the (DPR-scaled) canvas to the square detection working resolution
// on a white background, then threshold to an ink mask. Working at a reduced
// resolution keeps conv2d intermediate textures under the WebGL size limit and
// drastically cuts per-convolution cost.
export function canvasToMask(canvas) {
  const off = document.createElement('canvas');
  off.width = DETECTION_RESOLUTION;
  off.height = DETECTION_RESOLUTION;
  const ctx = off.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, DETECTION_RESOLUTION, DETECTION_RESOLUTION);
  ctx.drawImage(canvas, 0, 0, DETECTION_RESOLUTION, DETECTION_RESOLUTION);
  const imageData = ctx.getImageData(0, 0, DETECTION_RESOLUTION, DETECTION_RESOLUTION);
  return imageDataToMask(imageData);
}

export async function detectRunes(canvas) {
  await getBackendReady();

  // Drawing is scanned at DETECTION_RESOLUTION; sizes/positions are reported
  // back in original canvas coordinates via this factor.
  const scale = DETECTION_RESOLUTION / CANVAS_WIDTH;
  const drawingMask = canvasToMask(canvas);

  // Build the drawing tensor once; it is referenced inside the batched score
  // map's tidy but owned here — disposed in finally so it is released on throw.
  const drawingTensor = tf.tensor4d(
    drawingMask.data,
    [1, drawingMask.height, drawingMask.width, 1],
  );

  const candidates = [];

  try {
    const runes = await loadRuneImages();
    let batchCount = 0;

    for (const rune of runes) {
      for (const size of ITERATIVE_SIZES) {
        // All rotations of one size share footprint dimensions, so they batch
        // into a single multi-channel convolution.
        const workingSize = Math.max(2, Math.round(size * scale));
        const masks = ITERATIVE_ROTATIONS.map((rotation) =>
          imageDataToMask(rasterizeRotatedScaled(rune.image, workingSize, rotation)),
        );

        const { results, filterWidth, filterHeight } = computeBatchedScoreMap(
          drawingTensor,
          masks,
          PENALTY_WEIGHT,
        );

        for (let c = 0; c < results.length; c++) {
          const { score, col, row } = results[c];
          if (score >= MATCH_THRESHOLD) {
            // Center in working coords, converted back to canvas coords.
            candidates.push({
              id: rune.id,
              name: rune.name,
              imagePath: rune.imagePath,
              size,
              rotation: ITERATIVE_ROTATIONS[c],
              x: (col + filterWidth / 2) / scale,
              y: (row + filterHeight / 2) / scale,
              score,
            });
          }
        }

        // Yield to the UI after every few batched sizes so the
        // "Wirke Zauber…" indicator stays responsive.
        batchCount++;
        if (batchCount % 4 === 0) {
          await tf.nextFrame();
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
