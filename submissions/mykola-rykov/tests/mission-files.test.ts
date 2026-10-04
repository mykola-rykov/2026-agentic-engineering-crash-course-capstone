import { expect, test } from 'vitest';
import { exportMission, importMission, requiredInputs } from '../src/mission/files';
import { newMission } from '../src/mission/defaults';
import { terrainFixture } from './fixtures/contracts';
test('JSON round trip retains configuration and references', () => {
  const terrain = terrainFixture(), mission = newMission(terrain);
  mission.equipment[0]!.groundPointing = { azimuthDeg: 43, elevationDeg: 12 };
  mission.equipment[0]!.uplink.receiverSensitivityDbm = -110;
  expect(importMission(exportMission(mission), terrain)).toEqual(mission);
  expect(mission.equipment[0]!.downlink.receiverSensitivityDbm).toBe(-100);
});
test('invalid imports leave active mission intact and explain why', () => {
  const terrain = terrainFixture(), active = newMission(terrain), before = exportMission(active);
  for (const text of ['{', JSON.stringify({ ...active, schemaVersion: 2 }), JSON.stringify({ ...active, frequencyHz: null }), JSON.stringify({ ...active, terrain: { ...active.terrain, packageVersion: 'different' } })]) expect(() => importMission(text, terrain)).toThrow();
  expect(exportMission(active)).toBe(before);
});
test('required altitude and clearance inputs remain explicit', () => {
  const mission = newMission(terrainFixture()); expect(requiredInputs(mission)).toHaveLength(3);
  mission.constraints.minimumAltitude = { reference: 'datum', datumId: 'EGM2008', metres: 100 };
  mission.constraints.maximumAltitude = { reference: 'datum', datumId: 'EGM2008', metres: 500 };
  mission.constraints.minimumTerrainClearanceM = 0;
  expect(requiredInputs(mission)).toEqual([]);
});
