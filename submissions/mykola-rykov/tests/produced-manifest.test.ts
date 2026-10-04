import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { parseTerrainManifest } from '../src/contracts/terrain';

test('Python-produced package is compatible with the browser manifest contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rf-manifest-'));
  try {
    const code = 'import sys; sys.path.insert(0, "tests/terrain"); from test_package import make_package; make_package(sys.argv[1])';
    const result = spawnSync(process.execPath, ['scripts/terrain-python.mjs', '-c', code, directory], { encoding: 'utf8', timeout: 30000 });
    expect(result.status, result.stderr).toBe(0);
    const manifest = parseTerrainManifest(JSON.parse(await readFile(join(directory, 'package/manifest.json'), 'utf8')));
    expect(manifest.sources[0]?.id).toBe('fixture');
    expect(manifest.contextAssets).toHaveLength(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 35000);
