import { expect, test } from 'vitest';
import { illustrativeAircraft, energyPrerequisites } from '../src/energy/profiles';
import { aircraftSchema } from '../src/contracts/mission';
test('both editable presets are explicitly synthetic and independently owned', () => {
  for (const kind of ['fixed-wing', 'multirotor'] as const) {
    const first = aircraftSchema.parse(illustrativeAircraft(kind)), second = illustrativeAircraft(kind);
    expect(first.calibration).toBe('illustrative'); expect(first.provenance).toContain('No measured aircraft dataset');
    expect(first.powerModel).not.toBeNull(); expect(energyPrerequisites(first)).toEqual([]);
    first.batteryCapacityWh = null; expect(second.batteryCapacityWh).not.toBeNull(); expect(energyPrerequisites(first)).toEqual(['Battery capacity is missing.']);
    first.powerModel = null; expect(energyPrerequisites(first)).toHaveLength(2);
  }
});
