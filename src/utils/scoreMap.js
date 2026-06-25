import * as tf from '@tensorflow/tfjs';

let backendReady = null;

// Set the fastest available backend once. WebGL is the browser default;
// callers in tests may set 'cpu' before importing this.
export function getBackendReady() {
  if (!backendReady) {
    backendReady = (async () => {
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
    })();
  }
  return backendReady;
}

// Cross-correlation of the drawing with the template (tf.conv2d does not
// flip the kernel, so it already computes correlation). Returns a plain
// score map; all tensors created inside tidy are released before returning.
// drawingTensor is a tf.Tensor4D of shape [1, dh, dw, 1] owned by the caller —
// it is referenced but NOT disposed here.
export function computeScoreMap(drawingTensor, templateMask, penaltyWeight) {
  const { width: tw, height: th } = templateMask;

  return tf.tidy(() => {
    const template = tf.tensor4d(templateMask.data, [th, tw, 1, 1]);
    const ones = tf.ones([th, tw, 1, 1]);

    let inkCount = 0;
    for (let i = 0; i < templateMask.data.length; i++) inkCount += templateMask.data[i];
    const footprintArea = tw * th;

    const coverage = tf.conv2d(drawingTensor, template, 1, 'valid');
    const inkUnderFootprint = tf.conv2d(drawingTensor, ones, 1, 'valid');
    const penalty = inkUnderFootprint.sub(coverage);

    const coverageRatio = inkCount > 0 ? coverage.div(inkCount) : coverage.mul(0);
    const denom = footprintArea - inkCount;
    const penaltyRatio = denom > 0 ? penalty.div(denom) : penalty.mul(0);
    const score = coverageRatio.sub(penaltyRatio.mul(penaltyWeight));

    const [, outH, outW] = score.shape;
    const scores = score.dataSync();
    return { scores: Float32Array.from(scores), width: outW, height: outH };
  });
}
