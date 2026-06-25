import * as tf from '@tensorflow/tfjs';
import {
  CANVAS_WIDTH,
  DETECTION_RESOLUTION,
  MATCH_THRESHOLD,
  SIGIL_MATCH_THRESHOLD,
  NMS_RELATIVE,
  SIGIL_MIN_SIZE,
  ITERATIVE_SIZES,
  ITERATIVE_ROTATIONS,
  TEMPLATE_MARGIN_FACTOR,
  ROTATION_BATCH_SIZE,
  DILATION_RADIUS,
} from '../config.js';
import { imageDataToMask, dilateMask } from './maskUtils.js';
import { loadTemplateImages, rasterizeRotatedScaled } from './templateMasks.js';
import { computeBatchedScoreMap, getBackendReady } from './scoreMap.js';
import { dedupeFindings, suppressSigilFragments } from './findingDedup.js';

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
  const drawingMask = dilateMask(canvasToMask(canvas), DILATION_RADIUS);

  // Build the drawing tensor once; it is referenced inside the batched score
  // map's tidy but owned here — disposed in finally so it is released on throw.
  const drawingTensor = tf.tensor4d(
    drawingMask.data,
    [1, drawingMask.height, drawingMask.width, 1],
  );

  const candidates = [];

  try {
    const runes = await loadTemplateImages();
    let batchCount = 0;

    for (const rune of runes) {
      for (const size of ITERATIVE_SIZES) {
        // Sigils are the large central element — skip small scales so a stray
        // stroke can't match a tiny sigil fragment.
        if (rune.type === 'sigil' && size < SIGIL_MIN_SIZE) continue;
        // All rotations of one size share footprint dimensions, so they batch
        // into multi-channel convolutions. Process them in sequential
        // sub-batches to bound peak GPU memory.
        const workingSize = Math.max(2, Math.round(size * scale));

        for (let start = 0; start < ITERATIVE_ROTATIONS.length; start += ROTATION_BATCH_SIZE) {
          const rotations = ITERATIVE_ROTATIONS.slice(start, start + ROTATION_BATCH_SIZE);
          const masks = rotations.map((rotation) =>
            dilateMask(
              imageDataToMask(
                rasterizeRotatedScaled(rune.image, workingSize, rotation, TEMPLATE_MARGIN_FACTOR),
              ),
              DILATION_RADIUS,
            ),
          );

          const { results, filterWidth, filterHeight } = computeBatchedScoreMap(
            drawingTensor,
            masks,
          );

          // Sigils match more loosely than ring runes (large freehand glyph),
          // so they clear a lower bar.
          const threshold =
            rune.type === 'sigil' ? SIGIL_MATCH_THRESHOLD : MATCH_THRESHOLD;

          for (let c = 0; c < results.length; c++) {
            const { score, col, row } = results[c];
            if (score >= threshold) {
              // Center in working coords, converted back to canvas coords.
              candidates.push({
                id: rune.id,
                name: rune.name,
                type: rune.type,
                imagePath: rune.imagePath,
                size,
                rotation: rotations[c],
                x: (col + filterWidth / 2) / scale,
                y: (row + filterHeight / 2) / scale,
                score,
              });
            }
          }

          // Yield to the UI after every few sub-batches so the
          // "Wirke Zauber…" indicator stays responsive.
          batchCount++;
          if (batchCount % 4 === 0) {
            await tf.nextFrame();
          }
        }
      }
    }
  } finally {
    drawingTensor.dispose();
  }

  // NMS first, then drop rune fragments that sit inside a detected sigil's
  // glyph (the sigil is the center element; real runes ring it from outside).
  const deduped = suppressSigilFragments(dedupeFindings(candidates, NMS_RELATIVE));
  const findings = deduped.map((f) => ({
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

// Pay the one-time startup costs ahead of the first real scan: select the
// WebGL backend, decode + cache every template image, and compile the conv2d
// shader via one tiny throwaway correlation. Doing this when the page opens
// keeps the first "Alter Zauber" cast from also paying for backend init,
// image decoding, and shader compilation. The heavy size/rotation scan still
// runs per cast — this only removes the first-run-only overhead. Safe to call
// more than once: the backend promise and image cache are memoized.
export async function warmUpDetection() {
  await getBackendReady();
  await loadTemplateImages();

  // A minimal valid conv (8x8 drawing, 4x4 single-channel filter) is enough to
  // trigger WebGL program compilation; TF.js caches the compiled program so the
  // first real conv2d skips it.
  const drawingTensor = tf.tensor4d(new Float32Array(8 * 8), [1, 8, 8, 1]);
  try {
    const mask = { width: 4, height: 4, data: new Float32Array(4 * 4).fill(1) };
    computeBatchedScoreMap(drawingTensor, [mask]);
  } finally {
    drawingTensor.dispose();
  }
}
