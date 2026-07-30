import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseAssetNameForPath } from './releaseAssetNames.mjs';

test('matches GitHub release asset sanitization for Kokoro voice paths', () => {
  assert.equal(
    releaseAssetNameForPath(
      'kokoro-82m-v1.0-onnx-q8-wasm',
      'espeak-ng-data/voices/!v/Alex',
    ),
    'kokoro-82m-v1.0-onnx-q8-wasm__espeak-ng-data__voices__.v__Alex',
  );
  assert.equal(
    releaseAssetNameForPath(
      'kokoro-82m-v1.0-onnx-q8-wasm',
      'espeak-ng-data/voices/!v/Mr serious',
    ),
    'kokoro-82m-v1.0-onnx-q8-wasm__espeak-ng-data__voices__.v__Mr.serious',
  );
  assert.equal(
    releaseAssetNameForPath(
      'kokoro-82m-v1.0-onnx-q8-wasm',
      'espeak-ng-data/lang/gmw/en-US',
    ),
    'kokoro-82m-v1.0-onnx-q8-wasm__espeak-ng-data__lang__gmw__en-US',
  );
});
