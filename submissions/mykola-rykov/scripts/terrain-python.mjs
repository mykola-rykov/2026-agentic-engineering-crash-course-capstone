import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const configured = process.env.TERRAIN_PYTHON;
const candidates = configured ? [configured] : [
  '.venv/bin/python', '/opt/homebrew/bin/python3', 'python3',
];
let interpreter;
for (const candidate of candidates) {
  if (candidate.includes('/') && !existsSync(candidate)) continue;
  const probe = spawnSync(candidate, ['-c', 'from osgeo import gdal; import numpy; assert int(gdal.VersionInfo()) >= 3070000'], { timeout: 15000, encoding: 'utf8' });
  if (probe.status === 0) { interpreter = candidate; break; }
}
if (!interpreter) {
  console.error('Python with GDAL >=3.7 and NumPy is required. Set TERRAIN_PYTHON to that interpreter. See docs/TERRAIN_BUILD.md.');
  process.exit(1);
}
const child = spawnSync(interpreter, process.argv.slice(2), { stdio: 'inherit', env: { ...process.env, PROJ_NETWORK: 'OFF' } });
if (child.error) console.error(child.error.message);
process.exit(child.status ?? 1);
