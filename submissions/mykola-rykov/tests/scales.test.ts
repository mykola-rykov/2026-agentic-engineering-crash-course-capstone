import { expect, test } from 'vitest';
import { metricColor, SCALE_COLORS } from '../src/scene/scales';
test('route and comparison scales share absolute units and fixed thresholds', () => {
  expect(metricColor(null, 'margin', 10)).toBe(SCALE_COLORS.unknown);
  expect(metricColor(9.99, 'margin', 10)).toBe(SCALE_COLORS.low);
  expect(metricColor(10, 'margin', 10)).toBe(SCALE_COLORS.middle);
  expect(metricColor(20, 'margin', 10)).toBe(SCALE_COLORS.high);
  expect(metricColor(-100.01, 'power', 10)).toBe(SCALE_COLORS.low);
  expect(metricColor(-100, 'power', 10)).toBe(SCALE_COLORS.middle);
  expect(metricColor(-90, 'power', 20)).toBe(SCALE_COLORS.high);
});
