import { test, expect } from '@playwright/test';
test('offline terrain, coordinate placement and one-canvas view switching', async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => { const url = new URL(route.request().url()); if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort(); } return route.continue(); });
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Local terrain ready' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Place coordinate' }).click();
  await expect(page.getByTestId('selected-point')).toContainText('DSM elevation:');
  const elevation = await page.getByTestId('selected-point').textContent();
  await page.getByRole('button', { name: 'Top-down' }).click();
  await expect(page.getByRole('button', { name: 'Top-down' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Perspective', exact: true }).click();
  await expect(page.getByTestId('selected-point')).toHaveText(elevation!);
  await page.screenshot({ path: 'test-results/terrain-viewer.png' });
  expect(external).toEqual([]); expect(errors).toEqual([]);
});
test('unsupported WebGL2 is explicit', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) { if (String(args[0]) === 'webgl2') return null; return original.apply(this, args); }) as typeof original;
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('WebGL2 is required');
});
