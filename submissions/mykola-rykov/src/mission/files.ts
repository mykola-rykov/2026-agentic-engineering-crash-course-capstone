import { parseMission } from '../contracts/mission';
import type { MissionConfig } from '../contracts/mission';
import type { TerrainPackageManifest } from '../contracts/terrain';
export function importMission(text: string, terrain: TerrainPackageManifest): MissionConfig {
  const mission = parseMission(JSON.parse(text));
  if (mission.terrain.packageId !== terrain.id || mission.terrain.packageVersion !== terrain.packageVersion || mission.terrain.verticalDatumId !== terrain.verticalDatum.id) throw new Error('Mission terrain id, version, or datum differs from the selected package. Install and select the referenced package first.');
  return mission;
}
export function exportMission(mission: MissionConfig): string { return JSON.stringify(parseMission(mission), null, 2) + '\n'; }
export function requiredInputs(mission: MissionConfig) {
  const missing: string[] = [];
  if (!mission.constraints.minimumAltitude) missing.push('minimum altitude');
  if (!mission.constraints.maximumAltitude) missing.push('maximum altitude');
  if (mission.constraints.minimumTerrainClearanceM === null) missing.push('minimum DSM clearance');
  return missing;
}
