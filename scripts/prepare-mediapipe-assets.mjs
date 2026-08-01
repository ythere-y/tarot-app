import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = resolve(
  projectRoot,
  'node_modules',
  '@mediapipe',
  'tasks-vision',
  'wasm',
);
const destinationDirectory = resolve(
  projectRoot,
  'public',
  'mediapipe',
  'wasm',
);
const files = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

await mkdir(destinationDirectory, { recursive: true });
await Promise.all(
  files.map((file) =>
    copyFile(
      resolve(sourceDirectory, file),
      resolve(destinationDirectory, file),
    ),
  ),
);
