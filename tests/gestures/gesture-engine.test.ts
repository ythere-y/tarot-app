import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GestureEngine,
  type GestureEngineDependencies,
  type GestureEngineFrame,
} from '../../src/gestures/gesture-engine';

interface EngineHarness {
  readonly dependencies: GestureEngineDependencies;
  readonly callbacks: Map<number, FrameRequestCallback>;
  readonly detectedTimestamps: number[];
  readonly close: ReturnType<typeof vi.fn>;
  readonly stopTrack: ReturnType<typeof vi.fn>;
  hidden: boolean;
}

function createHarness(): EngineHarness {
  const callbacks = new Map<number, FrameRequestCallback>();
  const detectedTimestamps: number[] = [];
  const close = vi.fn();
  const stopTrack = vi.fn();
  let nextFrameId = 1;
  const harness: EngineHarness = {
    callbacks,
    detectedTimestamps,
    close,
    stopTrack,
    hidden: false,
    dependencies: {
      createLandmarker: vi.fn(async () => ({
        detectForVideo: (_video, timestamp) => {
          detectedTimestamps.push(timestamp);
          return {
            landmarks: [],
            worldLandmarks: [],
            handednesses: [],
            handedness: [],
          };
        },
        close,
      })),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: stopTrack }],
      }) as unknown as MediaStream),
      requestAnimationFrame: (callback) => {
        const id = nextFrameId++;
        callbacks.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (id) => {
        callbacks.delete(id);
      },
      getVisibilityState: () => (harness.hidden ? 'hidden' : 'visible'),
    },
  };
  return harness;
}

function createVideo(): HTMLVideoElement {
  return {
    currentTime: 0,
    srcObject: null,
    play: vi.fn(async () => undefined),
  } as unknown as HTMLVideoElement;
}

function runNextFrame(harness: EngineHarness, timestamp: number): void {
  const entry = harness.callbacks.entries().next().value as
    | [number, FrameRequestCallback]
    | undefined;
  if (!entry) throw new Error('No animation frame was scheduled');
  harness.callbacks.delete(entry[0]);
  entry[1](timestamp);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('GestureEngine', () => {
  it('runs one-hand video inference near 24 FPS with monotonic camera timestamps', async () => {
    const harness = createHarness();
    const video = createVideo();
    const frames: GestureEngineFrame[] = [];
    const engine = new GestureEngine({ dependencies: harness.dependencies });
    await engine.start(video, (frame) => frames.push(frame));

    video.currentTime = 1;
    runNextFrame(harness, 0);
    video.currentTime = 1;
    runNextFrame(harness, 20);
    runNextFrame(harness, 42);
    video.currentTime = 0.5;
    runNextFrame(harness, 84);

    expect(frames).toHaveLength(3);
    expect(harness.detectedTimestamps).toHaveLength(3);
    expect(harness.detectedTimestamps[0]).toBe(1_000);
    expect(harness.detectedTimestamps[1]).toBeGreaterThan(1_000);
    expect(harness.detectedTimestamps[2]).toBeGreaterThan(
      harness.detectedTimestamps[1] ?? 0,
    );
  });

  it('skips inference while the document is hidden', async () => {
    const harness = createHarness();
    harness.hidden = true;
    const engine = new GestureEngine({ dependencies: harness.dependencies });
    await engine.start(createVideo(), vi.fn());

    runNextFrame(harness, 0);
    runNextFrame(harness, 50);
    expect(harness.detectedTimestamps).toEqual([]);

    harness.hidden = false;
    runNextFrame(harness, 100);
    expect(harness.detectedTimestamps).toHaveLength(1);
  });

  it('cancels inference, closes the model, and stops camera tracks on stop', async () => {
    const harness = createHarness();
    const video = createVideo();
    const engine = new GestureEngine({ dependencies: harness.dependencies });
    await engine.start(video, vi.fn());

    engine.stop();

    expect(harness.callbacks.size).toBe(0);
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.stopTrack).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it.each([
    ['NotAllowedError', 'PERMISSION_DENIED'],
    ['SecurityError', 'PERMISSION_DENIED'],
    ['NotFoundError', 'NO_DEVICE'],
    ['DevicesNotFoundError', 'NO_DEVICE'],
  ] as const)('maps %s camera failures to %s', async (name, expectedCode) => {
    const harness = createHarness();
    const cameraError = new DOMException('camera failed', name);
    harness.dependencies.getUserMedia = vi.fn(async () => {
      throw cameraError;
    });
    const engine = new GestureEngine({ dependencies: harness.dependencies });

    await expect(engine.start(createVideo(), vi.fn())).rejects.toMatchObject({
      name: 'GestureEngineError',
      code: expectedCode,
      cause: cameraError,
    });
  });

  it('maps camera startup timeout to a typed timeout error', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.dependencies.getUserMedia = vi.fn(
      () => new Promise<MediaStream>(() => undefined),
    );
    const engine = new GestureEngine({
      cameraTimeoutMs: 25,
      dependencies: harness.dependencies,
    });

    const starting = engine.start(createVideo(), vi.fn());
    const expectation = expect(starting).rejects.toMatchObject({
      name: 'GestureEngineError',
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(25);

    await expectation;
  });

  it('maps model initialization failures and releases the acquired camera', async () => {
    const harness = createHarness();
    const modelError = new Error('model unavailable');
    harness.dependencies.createLandmarker = vi.fn(async () => {
      throw modelError;
    });
    const engine = new GestureEngine({ dependencies: harness.dependencies });

    await expect(engine.start(createVideo(), vi.fn())).rejects.toMatchObject({
      code: 'MODEL_ERROR',
      cause: modelError,
    });
    expect(harness.stopTrack).toHaveBeenCalledOnce();
  });
});
