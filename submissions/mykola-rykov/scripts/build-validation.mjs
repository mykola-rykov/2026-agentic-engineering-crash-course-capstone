import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export async function validateBuild(directory) {
  const root = resolve(directory);
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  if (!assets.length || !html.includes('id="root"')) throw new Error('Missing application entry.');
  for (const asset of assets) {
    if (!asset.startsWith('./')) throw new Error(`Non-relative build asset: ${asset}`);
    const path = resolve(root, asset);
    if (!path.startsWith(root + sep)) throw new Error(`Asset escapes build directory: ${asset}`);
    if (!(await stat(path)).isFile()) throw new Error(`Missing build asset: ${asset}`);
  }
  return assets.length;
}
