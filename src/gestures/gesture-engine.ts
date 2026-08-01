import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { HandLandmark } from './classifier';

const DEFAULT_WASM_BASE_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const DEFAULT_MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/' +
  'hand_landmarker/float16/latest/hand_landmarker.task';

export type GestureEngineErrorCode =
  | 'PERMISSION_DENIED'
  | 'NO_DEVICE'
  | 'TIMEOUT'
  | 'MODEL_ERROR'
  | 'CAMERA_ERROR';

export class GestureEngineError extends Error {
  readonly code: GestureEngineErrorCode;
  override readonly cause: unknown;

  constructor(code: GestureEngineErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'GestureEngineError';
    this.code = code;
    this.cause = cause;
  }
}

export interface GestureEngineFrame {
  readonly landmarks: readonly HandLandmark[] | null;
  readonly timestamp: number;
}

export interface GestureLandmarker {
  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number,
  ): HandLandmarkerResult;
  close(): void;
}

export interface GestureEngineDependencies {
  createLandmarker(): Promise<GestureLandmarker>;
  getUserMedia(
    constraints: MediaStreamConstraints,
  ): Promise<MediaStream>;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  getVisibilityState(): DocumentVisibilityState;
}

export interface GestureEngineOptions {
  readonly targetFps?: number;
  readonly cameraTimeoutMs?: number;
  readonly wasmBasePath?: string;
  readonly modelAssetPath?: string;
  readonly dependencies?: GestureEngineDependencies;
}

interface EngineSession {
  readonly generation: number;
  readonly video: HTMLVideoElement;
  stream?: MediaStream;
  landmarker?: GestureLandmarker;
  frameRequestId?: number;
  lastInferenceFrameTime?: number;
  lastCameraTimestamp?: number;
  running: boolean;
  cleaned: boolean;
}

function createDefaultDependencies(
  wasmBasePath: string,
  modelAssetPath: string,
): GestureEngineDependencies {
  return {
    async createLandmarker() {
      const fileset = await FilesetResolver.forVisionTasks(wasmBasePath);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath },
        runningMode: 'VIDEO',
        numHands: 1,
      });
    },
    async getUserMedia(constraints) {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('No camera device is available', 'NotFoundError');
      }
      return navigator.mediaDevices.getUserMedia(constraints);
    },
    requestAnimationFrame(callback) {
      return window.requestAnimationFrame(callback);
    },
    cancelAnimationFrame(id) {
      window.cancelAnimationFrame(id);
    },
    getVisibilityState() {
      return document.visibilityState;
    },
  };
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function mapCameraError(error: unknown): GestureEngineError {
  if (error instanceof GestureEngineError) return error;
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new GestureEngineError(
      'PERMISSION_DENIED',
      'Camera permission was denied',
      error,
    );
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new GestureEngineError(
      'NO_DEVICE',
      'No camera device was found',
      error,
    );
  }
  return new GestureEngineError(
    'CAMERA_ERROR',
    'The camera could not be started',
    error,
  );
}

export class GestureEngine {
  private readonly targetFrameIntervalMs: number;
  private readonly cameraTimeoutMs: number;
  private readonly dependencies: GestureEngineDependencies;
  private generation = 0;
  private session: EngineSession | undefined;

  constructor(options: GestureEngineOptions = {}) {
    const targetFps = options.targetFps ?? 24;
    if (!Number.isFinite(targetFps) || targetFps <= 0) {
      throw new RangeError('Gesture engine target FPS must be positive');
    }
    this.targetFrameIntervalMs = 1_000 / targetFps;
    this.cameraTimeoutMs = options.cameraTimeoutMs ?? 10_000;
    this.dependencies =
      options.dependencies ??
      createDefaultDependencies(
        options.wasmBasePath ?? DEFAULT_WASM_BASE_PATH,
        options.modelAssetPath ?? DEFAULT_MODEL_ASSET_PATH,
      );
  }

  async start(
    video: HTMLVideoElement,
    onFrame: (frame: GestureEngineFrame) => void,
  ): Promise<void> {
    this.stop();
    const session: EngineSession = {
      generation: this.generation,
      video,
      running: false,
      cleaned: false,
    };
    this.session = session;

    let stream: MediaStream;
    try {
      stream = await this.acquireCamera();
    } catch (error) {
      if (!this.isCurrent(session)) return;
      this.releaseSession(session);
      throw mapCameraError(error);
    }
    if (!this.isCurrent(session)) {
      stopTracks(stream);
      return;
    }
    session.stream = stream;
    video.srcObject = stream;

    try {
      await video.play();
    } catch (error) {
      if (!this.isCurrent(session)) return;
      this.releaseSession(session);
      throw mapCameraError(error);
    }
    if (!this.isCurrent(session)) {
      this.releaseSession(session);
      return;
    }

    let landmarker: GestureLandmarker;
    try {
      landmarker = await this.dependencies.createLandmarker();
    } catch (error) {
      if (!this.isCurrent(session)) return;
      this.releaseSession(session);
      throw new GestureEngineError(
        'MODEL_ERROR',
        'The hand landmark model could not be loaded',
        error,
      );
    }
    if (!this.isCurrent(session)) {
      landmarker.close();
      return;
    }

    session.landmarker = landmarker;
    session.running = true;
    this.scheduleFrame(session, onFrame);
  }

  stop(): void {
    this.generation += 1;
    const session = this.session;
    this.session = undefined;
    if (session) this.releaseSession(session);
  }

  private async acquireCamera(): Promise<MediaStream> {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const camera = this.dependencies
      .getUserMedia({
        audio: false,
        video: { facingMode: 'user' },
      })
      .then((stream) => {
        if (timedOut) stopTracks(stream);
        return stream;
      });
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        reject(
          new GestureEngineError(
            'TIMEOUT',
            'Timed out while waiting for the camera',
          ),
        );
      }, this.cameraTimeoutMs);
    });

    try {
      return await Promise.race([camera, timeout]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  private scheduleFrame(
    session: EngineSession,
    onFrame: (frame: GestureEngineFrame) => void,
  ): void {
    session.frameRequestId = this.dependencies.requestAnimationFrame(
      (frameTime) => {
        session.frameRequestId = undefined;
        if (!this.isCurrent(session) || !session.running) return;

        if (
          this.dependencies.getVisibilityState() !== 'hidden' &&
          (session.lastInferenceFrameTime === undefined ||
            frameTime - session.lastInferenceFrameTime >=
              this.targetFrameIntervalMs)
        ) {
          this.runInference(session, frameTime, onFrame);
        }
        if (this.isCurrent(session) && session.running) {
          this.scheduleFrame(session, onFrame);
        }
      },
    );
  }

  private runInference(
    session: EngineSession,
    frameTime: number,
    onFrame: (frame: GestureEngineFrame) => void,
  ): void {
    const { video, landmarker } = session;
    if (!video || !landmarker) return;

    session.lastInferenceFrameTime = frameTime;
    const videoTimestamp = video.currentTime * 1_000;
    const timestamp = Math.max(
      Number.isFinite(videoTimestamp) ? videoTimestamp : frameTime,
      session.lastCameraTimestamp === undefined
        ? Number.NEGATIVE_INFINITY
        : session.lastCameraTimestamp + 0.001,
    );
    session.lastCameraTimestamp = timestamp;
    const result = landmarker.detectForVideo(video, timestamp);
    onFrame({
      landmarks: (result.landmarks[0] as readonly HandLandmark[] | undefined) ?? null,
      timestamp,
    });
  }

  private isCurrent(session: EngineSession): boolean {
    return (
      this.session === session &&
      session.generation === this.generation &&
      !session.cleaned
    );
  }

  private releaseSession(session: EngineSession): void {
    if (session.cleaned) return;
    session.cleaned = true;
    session.running = false;
    if (session.frameRequestId !== undefined) {
      this.dependencies.cancelAnimationFrame(session.frameRequestId);
      session.frameRequestId = undefined;
    }
    session.landmarker?.close();
    session.landmarker = undefined;
    if (session.stream) {
      stopTracks(session.stream);
      if (session.video.srcObject === session.stream) {
        session.video.srcObject = null;
      }
      session.stream = undefined;
    }
    if (this.session === session) this.session = undefined;
  }
}
