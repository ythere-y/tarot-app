import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GestureEngine,
  type GestureEngineDependencies,
  type GestureEngineFrame,
  type GestureLandmarker,
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

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createStream(stop: () => void): MediaStream {
  return {
    getTracks: () => [{ stop }],
  } as unknown as MediaStream;
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

  it('stops a camera stream that resolves after stop cancels startup', async () => {
    const harness = createHarness();
    const pendingCamera = createDeferred<MediaStream>();
    const lateTrackStop = vi.fn();
    harness.dependencies.getUserMedia = vi.fn(() => pendingCamera.promise);
    const video = createVideo();
    const engine = new GestureEngine({ dependencies: harness.dependencies });

    const starting = engine.start(video, vi.fn());
    engine.stop();
    pendingCamera.resolve(createStream(lateTrackStop));
    await starting;

    expect(lateTrackStop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(harness.callbacks.size).toBe(0);
  });

  it('closes a model that resolves after stop cancels startup', async () => {
    const harness = createHarness();
    const pendingModel = createDeferred<GestureLandmarker>();
    const lateModelClose = vi.fn();
    harness.dependencies.createLandmarker = vi.fn(() => pendingModel.promise);
    const video = createVideo();
    const engine = new GestureEngine({ dependencies: harness.dependencies });

    const starting = engine.start(video, vi.fn());
    await vi.waitFor(() => {
      expect(harness.dependencies.createLandmarker).toHaveBeenCalledOnce();
    });
    engine.stop();
    expect(harness.stopTrack).toHaveBeenCalledOnce();
    pendingModel.resolve({
      detectForVideo: vi.fn(),
      close: lateModelClose,
    });
    await starting;

    expect(lateModelClose).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(harness.callbacks.size).toBe(0);
  });

  it('prevents an older pending start from replacing the current session', async () => {
    const harness = createHarness();
    const firstCamera = createDeferred<MediaStream>();
    const firstTrackStop = vi.fn();
    const secondTrackStop = vi.fn();
    const secondStream = createStream(secondTrackStop);
    harness.dependencies.getUserMedia = vi
      .fn()
      .mockImplementationOnce(() => firstCamera.promise)
      .mockImplementationOnce(async () => secondStream);
    const firstVideo = createVideo();
    const secondVideo = createVideo();
    const firstOnFrame = vi.fn();
    const secondOnFrame = vi.fn();
    const engine = new GestureEngine({ dependencies: harness.dependencies });

    const firstStart = engine.start(firstVideo, firstOnFrame);
    await engine.start(secondVideo, secondOnFrame);
    firstCamera.resolve(createStream(firstTrackStop));
    await firstStart;
    runNextFrame(harness, 0);

    expect(firstTrackStop).toHaveBeenCalledOnce();
    expect(secondTrackStop).not.toHaveBeenCalled();
    expect(firstVideo.srcObject).toBeNull();
    expect(secondVideo.srcObject).toBe(secondStream);
    expect(firstOnFrame).not.toHaveBeenCalled();
    expect(secondOnFrame).toHaveBeenCalledOnce();
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

  it('reports runtime inference failures and releases the active session', async () => {
    const harness = createHarness();
    const inferenceError = new Error('GPU delegate failed');
    harness.dependencies.createLandmarker = vi.fn(async () => ({
      detectForVideo: () => {
        throw inferenceError;
      },
      close: harness.close,
    }));
    const onError = vi.fn();
    const engine = new GestureEngine({ dependencies: harness.dependencies });
    await engine.start(createVideo(), vi.fn(), onError);

    runNextFrame(harness, 0);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'MODEL_ERROR',
      cause: inferenceError,
    });
    expect(harness.callbacks.size).toBe(0);
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.stopTrack).toHaveBeenCalledOnce();
  });
});
