import { expect, test } from 'vitest';
import { compareMetrics } from '../src/mission/comparison';
import { resultFixture } from './fixtures/contracts';
test('7 km / 5 dB fixture reports computed tradeoffs and no invented missing energy benefit', () => {
  const fixture = resultFixture();
  const baseline = { summary: { ...fixture.summary, distanceM: 20_000, minimumTwoWayMarginDb: 10 }, rfFeasibility: { status: 'feasible' as const, reasons: [] } };
  const longer = { ...baseline, summary: { ...baseline.summary, distanceM: 27_000, minimumTwoWayMarginDb: 15 } };
  const result = compareMetrics(longer, baseline);
  expect(result.cons).toEqual(['7.00 km longer than the comparison baseline.']);
  expect(result.pros).toEqual(['5.00 dB greater minimum two-way margin than the comparison baseline.']);
  expect(result.unavailable.join(' ')).toContain('energy estimates are missing');
  expect(compareMetrics({ ...longer, rfFeasibility: fixture.rfFeasibility }, baseline).pros).toEqual([]);
});
