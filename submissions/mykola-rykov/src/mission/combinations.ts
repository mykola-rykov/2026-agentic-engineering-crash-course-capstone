import type { MissionConfig } from '../contracts/mission';
export type EquipmentCombination = MissionConfig['equipment'][number];
export interface CombinationSelection {
  ground: Pick<EquipmentCombination, 'groundAntenna' | 'groundPointing'>[];
  airborne: EquipmentCombination['airborneAntenna'][];
  uplinkPowersDbm: number[]; downlinkPowersDbm: number[];
}
export function enumerateCombinations(template: EquipmentCombination, selected: CombinationSelection): EquipmentCombination[] {
  const groups = [selected.ground, selected.airborne, selected.uplinkPowersDbm, selected.downlinkPowersDbm];
  if (groups.some(group => group.length === 0)) throw new Error('Select at least one ground antenna, airborne antenna, and power in each direction.');
  if ([...selected.uplinkPowersDbm, ...selected.downlinkPowersDbm].some(n => !Number.isFinite(n))) throw new Error('Selected transmit powers must be finite dBm values.');
  const count = groups.reduce((n, group) => n * group.length, 1);
  if (count > 64) throw new Error('Select at most 64 equipment combinations per mission.');
  const results: EquipmentCombination[] = [];
  const ids = new Set<string>();
  for (const ground of selected.ground) for (const airborne of selected.airborne) for (const up of selected.uplinkPowersDbm) for (const down of selected.downlinkPowersDbm) {
    const identity = JSON.stringify([ground.groundAntenna.id, ground.groundPointing.azimuthDeg, ground.groundPointing.elevationDeg, airborne.id, up, down]);
    if (ids.has(identity)) continue;
    ids.add(identity);
    const id = `combination-${results.length + 1}`;
    results.push(structuredClone({ ...template, ...ground, airborneAntenna: airborne, id, uplink: { ...template.uplink, transmitPowerDbm: up }, downlink: { ...template.downlink, transmitPowerDbm: down } }));
  }
  return results;
}
export function parsePowerSelection(input: string) {
  const tokens = input.split(',').map(value => value.trim());
  if (tokens.some(value => value.length === 0)) throw new Error('Enter comma-separated finite dBm values without empty entries.');
  const values = tokens.map(Number);
  if (values.some(value => !Number.isFinite(value))) throw new Error('Transmit power selections must be finite numbers.');
  return [...new Set(values)];
}
