import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// Exercise the actual release check, including failures, rather than a source snapshot.
test('static build entry requires existing local assets', async () => {
  const { validateBuild } = await import('../scripts/build-validation.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'rf-build-'));
  try {
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets/app.js'), '');
    await writeFile(join(directory, 'index.html'), '<div id="root"></div><script src="./assets/app.js"></script>');
    expect(await validateBuild(directory)).toBe(1);
    await writeFile(join(directory, 'index.html'), '<div id="root"></div><script src="https://example.com/app.js"></script>');
    await expect(validateBuild(directory)).rejects.toThrow('Non-relative');
    await writeFile(join(directory, 'index.html'), '<div id="root"></div><script src="./assets/missing.js"></script>');
    await expect(validateBuild(directory)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
