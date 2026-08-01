export interface DeviceCapabilities {
  readonly devicePixelRatio?: number;
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
  readonly reducedMotion?: boolean;
}

export interface SceneQuality {
  readonly pixelRatio: number;
  readonly particleCount: number;
  readonly shadows: boolean;
}

export function clampPixelRatio(pixelRatio: number, maximum = 2): number {
  if (!Number.isFinite(pixelRatio)) {
    return 1;
  }

  return Math.min(Math.max(pixelRatio, 1), Math.max(1, maximum));
}

export function selectSceneQuality(
  capabilities: DeviceCapabilities,
): SceneQuality {
  const weakDevice =
    (capabilities.hardwareConcurrency ?? 8) <= 4 ||
    (capabilities.deviceMemory ?? 8) <= 4;
  const reducedMotion = capabilities.reducedMotion ?? false;

  return {
    pixelRatio: clampPixelRatio(
      capabilities.devicePixelRatio ?? 1,
      weakDevice ? 1.25 : 2,
    ),
    particleCount: reducedMotion ? 0 : weakDevice ? 180 : 480,
    shadows: !weakDevice && !reducedMotion,
  };
}
