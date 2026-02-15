import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isFile()) out.push({ name, full });
  }
  return out;
}

export function installLicensesIntoPack(opts) {
  const packOutDir = String(opts?.packOutDir ?? '');
  const licensesDir = String(opts?.licensesDir ?? '');
  const notices = Array.isArray(opts?.licenseNotices) ? opts.licenseNotices.map((v) => String(v)) : [];

  if (!packOutDir) throw new Error('packOutDir_required');
  if (!licensesDir) throw new Error('licensesDir_required');

  const destDir = join(packOutDir, 'LICENSES');
  mkdirSync(destDir, { recursive: true });

  const licenseFiles = listFiles(licensesDir);
  for (const f of licenseFiles) {
    copyFileSync(f.full, join(destDir, f.name));
  }

  const readme = [
    'This model pack redistributes third-party artifacts.',
    '',
    'Upstream notices:',
    ...notices.map((n) => `- ${n}`),
    '',
    'License texts:',
    ...licenseFiles.map((f) => `- ${f.name}`),
    '',
  ].join('\n');

  writeFileSync(join(destDir, 'README.txt'), readme, 'utf8');
}

