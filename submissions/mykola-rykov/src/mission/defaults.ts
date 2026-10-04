import { MISSION_DEFAULTS } from '../contracts/mission';
import type { MissionConfig } from '../contracts/mission';
import type { TerrainPackageManifest } from '../contracts/terrain';
export function newMission(terrain: TerrainPackageManifest): MissionConfig {
  const antenna = { id: 'isotropic', name: 'Illustrative isotropic', calibration: 'illustrative' as const, provenance: 'Uncalibrated editable example', gainPattern: { kind: 'isotropic' as const, gainDbi: 0 }, polarization: 'linear' as const, mounting: { headingDeg: 0, pitchDeg: 0, rollDeg: 0 }, massKg: 0, additionalDragAreaM2: 0 };
  const radio = { mode: 'Illustrative radio', transmitPowerDbm: 20, receiverSensitivityDbm: -100, cableLossDb: 0, installationLossDb: 0, polarizationLossDb: 0, electricalDraw: { kind: 'efficiency' as const, amplifierEfficiency: .4, idlePowerW: 1 } };
  const altitude = { metres: 100, reference: 'above-dsm' as const, datumId: terrain.verticalDatum.id };
  return {
    schemaVersion: 1, id: 'mission', name: 'New mission', terrain: { packageId: terrain.id, packageVersion: terrain.packageVersion, verticalDatumId: terrain.verticalDatum.id },
    launch: { position: { ...terrain.center }, altitude: { ...altitude } }, destination: { position: { ...terrain.center }, altitude }, waypoints: [],
    flightMode: MISSION_DEFAULTS.flightMode, totalDistanceLimitM: 100_000, groundAntennaHeightAboveSurfaceM: 10,
    aircraft: { id: 'aircraft', version: '1', name: 'Uncalibrated aircraft', kind: 'fixed-wing', calibration: 'illustrative', provenance: 'Enter an aircraft model and battery before energy analysis', batteryCapacityWh: null, powerModel: null, avionicsPowerW: 5, takeoffLandingEnergyWh: 0 },
    equipment: [{ id: 'equipment-1', groundAntenna: structuredClone(antenna), airborneAntenna: structuredClone(antenna), groundPointing: { azimuthDeg: 0, elevationDeg: 0 }, uplink: structuredClone(radio), downlink: structuredClone(radio) }], frequencyHz: 915_000_000,
    constraints: { requiredMarginDb: MISSION_DEFAULTS.requiredMarginDb, batteryReserveFraction: MISSION_DEFAULTS.batteryReserveFraction, minimumAltitude: null, maximumAltitude: null, minimumTerrainClearanceM: null, corridorWidthM: MISSION_DEFAULTS.corridorWidthM },
    wind: { speedMps: MISSION_DEFAULTS.windSpeedMps, fromDirectionDeg: MISSION_DEFAULTS.windFromDirectionDeg },
    assumptions: { rfModel: { id: 'p525-p526-delta-bullington', version: '1' }, energyModel: { id: 'aircraft-electrical', version: '1' }, effectiveEarthRadiusFactor: MISSION_DEFAULTS.effectiveEarthRadiusFactor, terrainHeightUncertaintyM: 5, rfLossAllowanceDb: 3 },
  };
}
