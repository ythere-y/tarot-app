export function depthForApparentScale(cameraDistance, apparentScale) {
  if (!Number.isFinite(cameraDistance) || cameraDistance <= 0) {
    throw new RangeError('Camera distance must be greater than 0');
  }
  if (!Number.isFinite(apparentScale) || apparentScale <= 1) {
    throw new RangeError('Apparent scale must be greater than 1');
  }
  return cameraDistance - cameraDistance / apparentScale;
}
