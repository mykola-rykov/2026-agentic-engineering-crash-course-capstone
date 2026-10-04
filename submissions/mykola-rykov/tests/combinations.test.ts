import { expect, test } from 'vitest';
import { enumerateCombinations, parsePowerSelection } from '../src/mission/combinations';
import { newMission } from '../src/mission/defaults';
import { parseMission } from '../src/contracts/mission';
import { terrainFixture } from './fixtures/contracts';
test('cartesian selections have stable distinct identities and independent nested ownership', () => {
  const template = newMission(terrainFixture()).equipment[0]!;
  const selected = { ground: [{ groundAntenna: template.groundAntenna, groundPointing: template.groundPointing }], airborne: [template.airborneAntenna, { ...template.airborneAntenna, id: 'second' }], uplinkPowersDbm: [20, 23], downlinkPowersDbm: [20, 23, 26] };
  const results = enumerateCombinations(template, selected);
  expect(parseMission({ ...newMission(terrainFixture()), equipment: results }).equipment).toHaveLength(12);
  expect(results).toHaveLength(12); expect(new Set(results.map(item => item.id)).size).toBe(12);
  expect(enumerateCombinations(template, selected).map(item => item.id)).toEqual(results.map(item => item.id));
  results[0]!.airborneAntenna.massKg = 1; results[0]!.downlink.electricalDraw = { kind: 'efficiency', idlePowerW: 10, amplifierEfficiency: .5 };
  expect(results[1]!.airborneAntenna.massKg).toBe(0); expect(template.airborneAntenna.massKg).toBe(0);
  expect(results[1]!.downlink.electricalDraw).toEqual(template.downlink.electricalDraw);
  expect(parsePowerSelection('20, 23,20')).toEqual([20, 23]);
  expect(() => parsePowerSelection('20,,23')).toThrow('empty');
  expect(() => enumerateCombinations(template, { ...selected, airborne: [] })).toThrow('Select');
});
