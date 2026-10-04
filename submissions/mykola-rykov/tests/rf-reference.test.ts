import { expect, test } from 'vitest';
import published from './fixtures/rf/itu-delta-bullington.json';
import single from './fixtures/rf/analytical-single-ridge.json';
test('independently published reference set retains twenty cases and complete profiles', () => {
  expect(published.cases).toHaveLength(20); expect(Object.keys(published.profiles)).toHaveLength(4);
  expect(published.documentSha256).toMatch(/^[0-9a-f]{64}$/); expect(published.workbookSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(published.cases[0]!.expected.deltaBullingtonLossDb).toBe(34.44302652283418);
  expect(published.cases[5]!.expected.deltaBullingtonLossDb).toBe(69.83036946959768);
  for (const profile of Object.values(published.profiles)) {
    expect(profile[0]![0]).toBe(0);
    expect(profile.every((point, index) => point.every(Number.isFinite) && (index === 0 || point[0]! > profile[index - 1]![0]!))).toBe(true);
  }
  expect(single.expectedDeltaBullingtonLossDb).toBe(41.0520972032907);
});
