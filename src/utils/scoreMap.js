import * as tf from '@tensorflow/tfjs';

let backendReady = null;

// Set the fastest available backend once. WebGL is the browser default;
// callers in tests may set 'cpu' before importing this.
export function getBackendReady() {
  if (!backendReady) {
    backendReady = (async () => {
      try {
        await tf.setBackend('webgl');
        // Release GPU textures immediately instead of pooling them, so peak
        // memory across thousands of convolutions stays bounded.
        tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
    })();
  }
  return backendReady;
}

// Score a whole batch of equal-sized templates against the drawing in a single
// pass. All masks must share the same width/height (true for every rotation of
// one rune size, since the rasterized footprint depends only on the size). The
// templates are packed as output channels of one conv2d filter, so N rotations
// cost one convolution and one GPU->CPU readback instead of N.
//
// tf.conv2d performs cross-correlation (no kernel flip), so it computes the
// intersection (overlapping ink) directly. drawingTensor is a [1, dh, dw, 1]
// tensor owned by the caller — referenced but NOT disposed here.
//
// The per-channel score is intersection-over-union (Jaccard) between the
// template's ink and the drawing's ink under the template's (margin-padded)
// footprint:
//   IoU = intersection / (templateInk + drawingInkUnderFootprint - intersection)
// IoU penalizes BOTH a template covering ink it shouldn't and a template
// failing to explain drawn ink, so a simpler rune that merely covers a subset
// of a complex drawing no longer outscores the correct full rune. A blank
// template (inkCount 0) scores 0.
//
// Returns { results: [{ score, col, row }], outWidth, outHeight,
//           filterWidth, filterHeight } — one result per input mask, holding
// that template's best position (top-left col/row in the score map).
export function computeBatchedScoreMap(drawingTensor, masks) {
  const n = masks.length;
  const { width: fw, height: fh } = masks[0];
  const area = fw * fh;

  // Ink count per template.
  const inkCounts = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    const d = masks[c].data;
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i];
    inkCounts[c] = sum;
  }

  // Pack masks into a [fh, fw, 1, n] filter. Filter data is row-major with the
  // output channel as the fastest dimension: index = (y * fw + x) * n + c.
  const filterData = new Float32Array(area * n);
  for (let c = 0; c < n; c++) {
    const d = masks[c].data;
    for (let p = 0; p < area; p++) filterData[p * n + c] = d[p];
  }

  return tf.tidy(() => {
    const filter = tf.tensor4d(filterData, [fh, fw, 1, n]);
    const ones = tf.ones([fh, fw, 1, 1]);

    const intersection = tf.conv2d(drawingTensor, filter, 1, 'valid'); // [1,oH,oW,n]
    const drawingInk = tf.conv2d(drawingTensor, ones, 1, 'valid'); // [1,oH,oW,1]

    const inkT = tf.tensor1d(Array.from(inkCounts)); // [n]
    // union = templateInk + drawingInkUnderFootprint - intersection
    const union = inkT.add(drawingInk).sub(intersection);
    const iou = intersection.div(union.add(1e-6)); // [1,oH,oW,n]

    const [, outH, outW] = iou.shape;
    const flat = iou.reshape([outH * outW, n]);
    const bestScores = flat.max(0).dataSync(); // [n]
    const bestIdx = flat.argMax(0).dataSync(); // [n]

    const results = [];
    for (let c = 0; c < n; c++) {
      const idx = bestIdx[c];
      results.push({
        // A blank template can never be a real match.
        score: inkCounts[c] > 0 ? bestScores[c] : 0,
        col: idx % outW,
        row: Math.floor(idx / outW),
      });
    }

    return {
      results,
      outWidth: outW,
      outHeight: outH,
      filterWidth: fw,
      filterHeight: fh,
    };
  });
}
