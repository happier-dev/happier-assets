import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('keeps install paths unchanged while using GitHub-normalized release asset names', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'happier-assets-model-pack-test-'));
  const packId = 'kokoro-82m-v1.0-onnx-q8-wasm';
  const archiveRootName = 'fixture-source';
  const sourceRoot = join(fixtureRoot, archiveRootName);
  const outDir = join(fixtureRoot, 'out');
  const packsFile = join(fixtureRoot, 'packs.json');

  try {
    const voicesDir = join(sourceRoot, 'espeak-ng-data', 'voices', '!v');
    const languageDir = join(sourceRoot, 'espeak-ng-data', 'lang', 'gmw');
    mkdirSync(voicesDir, { recursive: true });
    mkdirSync(languageDir, { recursive: true });
    writeFileSync(join(voicesDir, 'Alex'), 'alex voice\n', 'utf8');
    writeFileSync(join(voicesDir, 'Mr serious'), 'serious voice\n', 'utf8');
    writeFileSync(join(languageDir, 'en-US'), 'english language\n', 'utf8');

    writeFileSync(
      packsFile,
      JSON.stringify({
        packs: [
          {
            packId,
            kind: 'tts',
            model: 'fixture',
            version: '1',
            sourceUrl: 'https://invalid.example/not-used.tar.bz2',
            sourceRoot: archiveRootName,
            entries: [
              {
                type: 'dir',
                from: 'espeak-ng-data',
                to: 'espeak-ng-data',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const cacheDir = join(outDir, '.cache');
    mkdirSync(cacheDir, { recursive: true });
    execFileSync(
      'tar',
      ['-cjf', join(cacheDir, `${packId}.tar.bz2`), '-C', fixtureRoot, archiveRootName],
      { cwd: repoRoot, stdio: 'pipe' },
    );

    execFileSync(
      process.execPath,
      [
        'scripts/build-model-packs.mjs',
        '--repo',
        'happier-dev/happier-assets',
        '--tag',
        'model-packs',
        '--out',
        outDir,
        '--packs',
        packsFile,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          HAPPIER_ASSETS_BUILD_ID: 'fixture-build',
        },
        stdio: 'pipe',
      },
    );

    const manifest = JSON.parse(
      readFileSync(join(outDir, 'release', `${packId}__manifest.json`), 'utf8'),
    );
    const byPath = new Map(manifest.files.map((file) => [file.path, file]));

    const alex = byPath.get('espeak-ng-data/voices/!v/Alex');
    assert.equal(
      alex.url,
      `https://github.com/happier-dev/happier-assets/releases/download/model-packs/${packId}__espeak-ng-data__voices__.v__Alex?v=fixture-build`,
    );
    assert.equal(readFileSync(join(outDir, 'packs', packId, alex.path), 'utf8'), 'alex voice\n');

    const mrSerious = byPath.get('espeak-ng-data/voices/!v/Mr serious');
    assert.equal(
      mrSerious.url,
      `https://github.com/happier-dev/happier-assets/releases/download/model-packs/${packId}__espeak-ng-data__voices__.v__Mr.serious?v=fixture-build`,
    );
    assert.equal(
      readFileSync(join(outDir, 'packs', packId, mrSerious.path), 'utf8'),
      'serious voice\n',
    );

    const english = byPath.get('espeak-ng-data/lang/gmw/en-US');
    assert.equal(
      english.url,
      `https://github.com/happier-dev/happier-assets/releases/download/model-packs/${packId}__espeak-ng-data__lang__gmw__en-US?v=fixture-build`,
    );

    assert.equal(
      existsSync(join(outDir, 'release', `${packId}__espeak-ng-data__voices__.v__Alex`)),
      true,
    );
    assert.equal(
      existsSync(join(outDir, 'release', `${packId}__espeak-ng-data__voices__!v__Alex`)),
      false,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
