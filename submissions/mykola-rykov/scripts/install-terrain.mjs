import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const source = resolve(process.argv[2] ?? 'terrain/packages/alpine-adriatic');
const validation = spawnSync(process.execPath, ['scripts/terrain-python.mjs', 'tools/terrain/package.py', 'validate', source], { stdio: 'inherit' });
if (validation.status !== 0) process.exit(validation.status ?? 1);
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(manifest.id)) throw new Error('Invalid package id.');
const destination = resolve('public/terrain', manifest.id);
await mkdir('public/terrain', { recursive: true });
await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
let registry = { schemaVersion: 1, regions: [] };
try { registry = JSON.parse(await readFile('public/regions.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
registry.regions = registry.regions.filter((region) => region.id !== manifest.id);
registry.regions.push({ id: manifest.id, name: manifest.name, manifestPath: `./terrain/${manifest.id}/manifest.json` });
await writeFile('public/regions.json', JSON.stringify(registry, null, 2) + '\n');
console.log(`Installed ${manifest.id} for the local viewer.`);
