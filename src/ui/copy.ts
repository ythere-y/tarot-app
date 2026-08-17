import type { DrawPhase } from '../app/types';
import type { InterpretationTopic } from '../interpretation/types';
import type { TarotOrientation } from '../tarot/types';

export const APP_COPY = {
  brand: '玄穹塔罗',
  brandEn: 'Celestial Tarot',
  remaining: '余牌',
  remainingEn: 'Remaining',
  history: '本轮牌迹',
  historyEn: 'Drawn Arcana',
  noHistory: '第一张牌仍在星轨中等待。',
  reading: '牌意',
  readingEn: 'Reading',
  noReading: '抽取一张牌后，此处将展开它的讯息。',
  upright: '正位',
  reversed: '逆位',
  camera: '手势镜',
  cameraEn: 'Gesture Camera',
  cameraIdle: '摄像头尚未开启',
  cameraRequesting: '正在唤醒摄像头…',
  cameraReady: '手势识别已就绪',
  cameraError: '摄像头暂不可用',
  startCamera: '开启手势抽牌',
  retryCamera: '重试摄像头',
  usePointer: '使用鼠标 / 触屏',
  pointerMode: '指针模式',
  gestureMode: '手势模式',
  reset: '重置牌阵',
  resetTitle: '确认重置本轮牌阵？',
  resetDescription: '本轮牌迹将被清空，全部 78 张牌会重新回到星轨。',
  confirmReset: '确认重置',
  cancel: '继续本轮',
  fallbackTitle: '二维星轨',
  fallbackDescription: '此设备无法开启 3D 星盘，已切换为完整可用的二维抽牌模式。',
  fallbackCard: '等待抽取',
  fallbackCardEn: 'Awaiting a card',
} as const;

export const TOPIC_COPY: Readonly<Record<InterpretationTopic, string>> = {
  general: '通用',
  love: '爱情',
  career: '事业',
  wealth: '财运',
  growth: '成长',
};

export const PHASE_COPY: Readonly<Record<DrawPhase['type'], string>> = {
  READY: '静候启程',
  CAROUSEL: '星轨流转',
  HOLDING: '执牌移动',
  PLACED: '已入揭示位',
  REVEALING: '牌面显现',
  READING: '聆听牌意',
  ARCHIVING: '归入牌迹',
  COMPLETE: '本轮圆满',
};

export const ORIENTATION_COPY: Readonly<Record<TarotOrientation, string>> = {
  upright: APP_COPY.upright,
  reversed: APP_COPY.reversed,
};

export const READING_TOPICS = Object.freeze(
  (Object.keys(TOPIC_COPY) as InterpretationTopic[]).map((value) => ({
    value,
    label: TOPIC_COPY[value],
  })),
);
