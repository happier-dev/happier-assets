import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { installLicensesIntoPack } from './licensePackaging.mjs';

test('installLicensesIntoPack copies license files into LICENSES/', () => {
  const root = mkdtempSync(join(tmpdir(), 'happier-assets-licenses-'));
  const licensesDir = join(root, 'licenses');
  const packOutDir = join(root, 'pack');

  mkdirSync(licensesDir, { recursive: true });
  mkdirSync(packOutDir, { recursive: true });

  writeFileSync(join(licensesDir, 'Apache-2.0.txt'), 'apache', 'utf8');
  writeFileSync(join(licensesDir, 'GPL-3.0.txt'), 'gpl', 'utf8');

  installLicensesIntoPack({
    packOutDir,
    licensesDir,
    licenseNotices: ['Apache-2.0', 'GPL-3.0'],
  });

  const apache = readFileSync(join(packOutDir, 'LICENSES', 'Apache-2.0.txt'), 'utf8');
  const gpl = readFileSync(join(packOutDir, 'LICENSES', 'GPL-3.0.txt'), 'utf8');
  assert.equal(apache, 'apache');
  assert.equal(gpl, 'gpl');

  const readme = readFileSync(join(packOutDir, 'LICENSES', 'README.txt'), 'utf8');
  assert.ok(readme.includes('Upstream notices:'), 'README should include notices header');
  assert.ok(readme.includes('Apache-2.0'), 'README should mention Apache notice');
});

