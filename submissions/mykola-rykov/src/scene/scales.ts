export const SCALE_COLORS = { unknown: '#89969e', low: '#e36e6e', middle: '#e0c88e', high: '#8ac6bb' } as const;
export function metricColor(value: number | null, metric: 'margin' | 'power', requiredMarginDb: number) {
  if (value === null) return SCALE_COLORS.unknown;
  const relative = metric === 'margin' ? value - requiredMarginDb : value + 100;
  return relative < 0 ? SCALE_COLORS.low : relative < 10 ? SCALE_COLORS.middle : SCALE_COLORS.high;
}
