import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

test('rebuilds the published Kokoro voice identities, default and effective frontend', () => {
  const { packs } = JSON.parse(readFileSync(join(repoRoot, 'packs/packs.json'), 'utf8'));
  const pack = packs.find((candidate) => candidate.packId === 'kokoro-82m-v1.0-onnx-q8-wasm');
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'happier-assets-kokoro-metadata-'));
  const sourceRoot = join(fixtureRoot, pack.sourceRoot);
  const outDir = join(fixtureRoot, 'out');
  const packsFile = join(fixtureRoot, 'packs.json');

  try {
    mkdirSync(sourceRoot, { recursive: true });
    for (const entry of pack.entries) {
      const target = join(sourceRoot, entry.from);
      if (entry.type === 'dir') {
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, 'fixture-data'), 'frontend fixture');
      } else {
        writeFileSync(target, 'model fixture');
      }
    }
    // Keep the real pack definition; only replace the external download with a cached fixture.
    writeFileSync(packsFile, JSON.stringify({ packs: [{ ...pack, sourceUrl: 'https://invalid.example/not-used.tar.bz2' }] }));
    const cacheDir = join(outDir, '.cache');
    mkdirSync(cacheDir, { recursive: true });
    execFileSync('tar', ['-cjf', join(cacheDir, `${pack.packId}.tar.bz2`), '-C', fixtureRoot, pack.sourceRoot]);
    execFileSync(process.execPath, [
      'scripts/build-model-packs.mjs', '--repo', 'happier-dev/happier-assets',
      '--tag', 'model-packs', '--out', outDir, '--packs', packsFile,
    ], { cwd: repoRoot, stdio: 'pipe' });

    for (const manifestPath of [
      join(outDir, 'packs', pack.packId, 'manifest.json'),
      join(outDir, 'release', `${pack.packId}__manifest.json`),
    ]) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      // Captured by ranged GET on 2026-10-31 from the public model-packs release:
      // kokoro-82m-v1.0-onnx-q8-wasm__manifest.json
      // Whole-manifest SHA-256: 34a32bd9a524d26d9019e66cb385713f16d525cdae8678a6e8661adf9fa3af5b.
      // The projection hash pins every id/title/subtitle/SID without duplicating the catalog.
      assert.deepEqual({
        voiceCount: manifest.voices?.length,
        voicesSha256: createHash('sha256').update(JSON.stringify(manifest.voices ?? null)).digest('hex'),
        defaultVoiceId: manifest.defaultVoiceId,
        frontend: manifest.frontend,
      }, {
        voiceCount: 103,
        voicesSha256: '29d7f634e58add1c1d590c7efca5ee6444656fe03b28a6c342c78c38bc22c5e7',
        defaultVoiceId: 'af_maple',
        // The published manifest omits frontend; the app's resolveKokoroModelConfig defaults to en.
        frontend: { lang: 'en' },
      });
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

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
    assert.equal(Object.hasOwn(manifest, 'voices'), false);
    assert.equal(Object.hasOwn(manifest, 'defaultVoiceId'), false);
    assert.equal(Object.hasOwn(manifest, 'frontend'), false);
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
