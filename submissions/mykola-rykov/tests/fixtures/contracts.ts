import type { TerrainPackageManifest } from '../../src/contracts/terrain';
import type { MissionConfig } from '../../src/contracts/mission';
import type { ScenarioResult } from '../../src/contracts/result';

const datum = { id: 'EGM2008', description: 'Orthometric heights above EGM2008 geoid' };
const position = { latitudeDeg: 46.2057222222, longitudeDeg: 13.6899166667 };
const altitude = { metres: 400, datumId: datum.id, reference: 'datum' as const };
const model = { id: 'fixture', version: '1' };

export function terrainFixture(): TerrainPackageManifest {
  const asset = (path: string, bytes: number) => ({ path, bytes, sha256: 'a'.repeat(64) });
  return structuredClone({
    schemaVersion: 1, id: 'fixture-region', packageVersion: '1', name: 'Synthetic contract fixture',
    center: position, bounds: { westDeg: 12, eastDeg: 15.5, southDeg: 45, northDeg: 47.5, crossesAntimeridian: false },
    projectedBounds: { minXM: -110_000, maxXM: 110_000, minYM: -110_000, maxYM: 110_000 },
    projection: { definition: '+proj=aeqd +lat_0=46.2057222222 +lon_0=13.6899166667 +datum=WGS84 +units=m', horizontalDatum: 'WGS84', units: 'metres' },
    verticalDatum: datum,
    encoding: { elevation: 'int16', byteOrder: 'little-endian', elevationUnitM: 1, tileCells: 256, displayResampling: 'average', obstructionResampling: 'maximum', validity: 'uint8-0-unknown-1-source-2-confirmed-ocean' },
    sources: [{ id: 'synthetic', dataset: 'Synthetic fixture', release: '1', sourceUrl: 'https://example.com/fixture', nominalResolutionM: 30, verticalDatum: datum, verticalAccuracyM: null, accuracyDescription: 'Synthetic, not geographic data', attribution: 'Test fixture', licenseUrl: 'https://example.com/license', isFallback: false }],
    oceanMask: { source: 'Synthetic fixture', version: '1', method: 'Explicit ocean class', coastalUncertaintyM: 0 },
    levels: [{ level: 0, cellSizeM: 30, columns: 1, rows: 1, tiles: [{ column: 0, row: 0, sourceIds: ['synthetic'], display: asset('tiles/0/display.bin', 131072), obstruction: asset('tiles/0/obstruction.bin', 131072), validity: asset('tiles/0/validity.bin', 65536) }] }],
    contextAssets: [], uncompressedBytes: 330_000, attribution: ['Synthetic contract fixture; no actual terrain.'],
  });
}

export function missionFixture(): MissionConfig {
  const antenna = { id: 'antenna', name: 'Illustrative isotropic', calibration: 'illustrative' as const, provenance: 'Synthetic test fixture', gainPattern: { kind: 'isotropic' as const, gainDbi: 0 }, polarization: 'linear' as const, mounting: { headingDeg: 0, pitchDeg: 0, rollDeg: 0 }, massKg: 0.1, additionalDragAreaM2: 0.001 };
  const radio = { mode: 'fixture-mode', transmitPowerDbm: 20, receiverSensitivityDbm: -100, cableLossDb: 1, installationLossDb: 1, polarizationLossDb: 0, electricalDraw: { kind: 'efficiency' as const, amplifierEfficiency: 0.4, idlePowerW: 1 } };
  return structuredClone({
    schemaVersion: 1, id: 'mission', name: 'Contract fixture', terrain: { packageId: 'fixture-region', packageVersion: '1', verticalDatumId: datum.id },
    launch: { position, altitude }, destination: { position: { latitudeDeg: 46.3, longitudeDeg: 13.7 }, altitude }, waypoints: [],
    flightMode: 'one-way', totalDistanceLimitM: 100_000, groundAntennaHeightAboveSurfaceM: 2,
    aircraft: { id: 'plane', version: '1', name: 'Illustrative aircraft', kind: 'fixed-wing', calibration: 'illustrative', provenance: 'Synthetic fixture', batteryCapacityWh: null, powerModel: null, avionicsPowerW: 5, takeoffLandingEnergyWh: 2 },
    equipment: [{ id: 'equipment', groundAntenna: antenna, airborneAntenna: antenna, groundPointing: { azimuthDeg: 0, elevationDeg: 0 }, uplink: radio, downlink: { ...radio, receiverSensitivityDbm: -95 } }],
    frequencyHz: 915_000_000,
    constraints: { requiredMarginDb: 10, batteryReserveFraction: 0.2, minimumAltitude: null, maximumAltitude: null, minimumTerrainClearanceM: null, corridorWidthM: 10_000 },
    wind: { speedMps: 0, fromDirectionDeg: 0 },
    assumptions: { rfModel: model, energyModel: model, effectiveEarthRadiusFactor: 4 / 3, terrainHeightUncertaintyM: 5, rfLossAllowanceDb: 3 },
  });
}

export function resultFixture(): ScenarioResult {
  return structuredClone({
    schemaVersion: 1, jobId: 'job', scenarioId: 'scenario', missionId: 'mission', equipmentId: 'equipment',
    terrain: { packageId: 'fixture-region', packageVersion: '1', verticalDatumId: datum.id },
    models: { rf: model, energy: model }, assumptions: ['Synthetic fixture; no validated terrain or power model.'],
    routeSamples: [0, 100].map((distance) => ({ distanceAlongRouteM: distance, elapsedTimeS: null, leg: 'outbound', position, altitude, attitude: { headingDeg: 0, pitchDeg: 0, rollDeg: 0 }, uplink: null, downlink: null, clearance: { status: 'unknown', reason: 'Terrain absent' } })),
    summary: { distanceM: 100, durationS: null, climbM: 0, minimumUplinkMarginDb: null, minimumDownlinkMarginDb: null, minimumTwoWayMarginDb: null, energy: null },
    feasibility: { status: 'indeterminate', reasons: ['Insufficient evidence'] },
    rfFeasibility: { status: 'indeterminate', reasons: ['Terrain absent'] },
    energyFeasibility: { status: 'indeterminate', reasons: ['Power model absent'] }, constraintViolations: [],
  });
}
