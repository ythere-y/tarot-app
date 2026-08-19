const REVERSED_LABEL = '↻ 逆位 · REVERSED';

export function updateOrientationMarker(marker, isReversed) {
  marker.hidden = !isReversed;
  marker.textContent = isReversed ? REVERSED_LABEL : '';
}
