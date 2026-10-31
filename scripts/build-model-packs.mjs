import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';

import { installLicensesIntoPack } from './licensePackaging.mjs';
import { releaseAssetNameForPath } from './releaseAssetNames.mjs';

function parseArgs(argv) {
  const out = { repo: null, tag: null, outDir: 'dist', packsFile: 'packs/packs.json' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') out.repo = argv[++i] ?? null;
    else if (a === '--tag') out.tag = argv[++i] ?? null;
    else if (a === '--out') out.outDir = argv[++i] ?? 'dist';
    else if (a === '--packs') out.packsFile = argv[++i] ?? 'packs/packs.json';
  }
  return out;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function walkFiles(dir, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkFiles(full, rel));
    else out.push({ full, rel, sizeBytes: st.size });
  }
  return out;
}

function copyTree(src, dest) {
  const st = statSync(src);
  if (st.isDirectory()) {
    ensureDir(dest);
    for (const name of readdirSync(src)) {
      copyTree(join(src, name), join(dest, name));
    }
    return;
  }
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0) {
    throw new Error(`command_failed:${cmd}`);
  }
}

function releaseBaseUrl(repo, tag) {
  if (!repo || !tag) return null;
  return `https://github.com/${repo}/releases/download/${tag}`;
}

function nowIso() {
  return new Date().toISOString();
}

function buildNotices(pack) {
  const lines = [
    `Happier model pack: ${pack.packId}`,
    `Kind: ${pack.kind}`,
    `Model: ${pack.model}`,
    `Version: ${pack.version}`,
    '',
    'Upstream notices:',
    ...(Array.isArray(pack.licenseNotices) ? pack.licenseNotices.map((l) => `- ${l}`) : []),
    '',
    `Source archive: ${pack.sourceUrl}`,
    '',
  ];
  return lines.join('\n');
}

const args = parseArgs(process.argv);
const packsJson = JSON.parse(readFileSync(args.packsFile, 'utf8'));
const packs = Array.isArray(packsJson?.packs) ? packsJson.packs : [];
if (packs.length === 0) {
  throw new Error(`no_packs_in:${args.packsFile}`);
}

const outDir = args.outDir;
const packOutRoot = join(outDir, 'packs');
const releaseOutRoot = join(outDir, 'release');
const cacheRoot = join(outDir, '.cache');

ensureDir(packOutRoot);
ensureDir(releaseOutRoot);
ensureDir(cacheRoot);

const baseUrl = releaseBaseUrl(args.repo, args.tag);
const manifestMap = {};
const publishedAt = nowIso();
const buildId = process.env.HAPPIER_ASSETS_BUILD_ID || publishedAt;

for (const pack of packs) {
  const packId = String(pack.packId);
  const sourceUrl = String(pack.sourceUrl);
  const sourceRoot = String(pack.sourceRoot);
  const entries = Array.isArray(pack.entries) ? pack.entries : [];

  const tmp = join(tmpdir(), `happier-assets-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  ensureDir(tmp);

  const archivePath = join(cacheRoot, `${packId}.tar.bz2`);
  if (!statSync(cacheRoot).isDirectory()) ensureDir(cacheRoot);
  try {
    if (!statSync(archivePath, { throwIfNoEntry: false })) {
      // noop
    }
  } catch {}
  if (!statSync(archivePath, { throwIfNoEntry: false })) {
    run('curl', ['-L', '-o', archivePath, sourceUrl]);
  }

  run('tar', ['-xjf', archivePath, '-C', tmp]);

  const extractedRoot = join(tmp, sourceRoot);
  const packOutDir = join(packOutRoot, packId);
  rmSync(packOutDir, { recursive: true, force: true });
  ensureDir(packOutDir);

  for (const entry of entries) {
    const from = join(extractedRoot, String(entry.from));
    const to = join(packOutDir, String(entry.to));
    if (entry.type === 'dir') {
      copyTree(from, to);
    } else {
      ensureDir(dirname(to));
      copyFileSync(from, to);
    }
  }

  writeFileSync(join(packOutDir, 'THIRD_PARTY_NOTICES.txt'), buildNotices(pack), 'utf8');
  installLicensesIntoPack({
    packOutDir,
    licensesDir: join(process.cwd(), 'licenses'),
    licenseNotices: pack.licenseNotices ?? [],
  });

  const files = walkFiles(packOutDir).filter((f) => f.rel !== 'manifest.json');
  const manifestFiles = [];
  for (const f of files) {
    const buf = readFileSync(f.full);
    const sha256 = sha256Hex(buf);
    const url = baseUrl
      ? `${baseUrl}/${releaseAssetNameForPath(packId, f.rel)}?v=${encodeURIComponent(buildId)}`
      : `__RELEASE_URL_MISSING__/${releaseAssetNameForPath(packId, f.rel)}`;
    manifestFiles.push({ path: f.rel, url, sha256, sizeBytes: f.sizeBytes });

    const releaseAssetPath = join(releaseOutRoot, releaseAssetNameForPath(packId, f.rel));
    ensureDir(dirname(releaseAssetPath));
    copyFileSync(f.full, releaseAssetPath);
  }

  const manifest = {
    packId,
    kind: pack.kind,
    model: pack.model,
    version: pack.version,
    buildId,
    publishedAt,
    licenseNotices: pack.licenseNotices ?? undefined,
    voices: pack.voices ?? undefined,
    defaultVoiceId: pack.defaultVoiceId ?? undefined,
    frontend: pack.frontend ?? undefined,
    files: manifestFiles,
  };

  writeFileSync(join(packOutDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const manifestAssetName = `${packId}__manifest.json`;
  const manifestReleasePath = join(releaseOutRoot, manifestAssetName);
  writeFileSync(manifestReleasePath, JSON.stringify(manifest, null, 2), 'utf8');

  if (baseUrl) {
    manifestMap[packId] = `${baseUrl}/${manifestAssetName}?v=${encodeURIComponent(buildId)}`;
  }

  rmSync(tmp, { recursive: true, force: true });
}

writeFileSync(
  join(releaseOutRoot, 'model-packs-index.json'),
  JSON.stringify({ buildId, publishedAt, manifests: manifestMap }, null, 2),
  'utf8',
);

process.stdout.write(`${JSON.stringify(manifestMap, null, 2)}\n`);
