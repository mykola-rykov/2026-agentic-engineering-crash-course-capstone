import { checkFrequency, SPEED_OF_LIGHT_MPS } from './propagation';
import { curvedTerrain } from './profile';
import type { RadioProfile } from './profile';
export function fresnelEvidence(profile: RadioProfile, transmitterDatumM: number, receiverDatumM: number, frequencyHz: number, effectiveRadiusFactor = 4 / 3, terrainUncertaintyM = 0) {
  checkFrequency(frequencyHz);
  if (![transmitterDatumM, receiverDatumM].every(Number.isFinite)) throw new Error('Ray heights must be finite and share the profile datum.');
  if (profile.status !== 'known' || profile.validity.some((value) => value === 0)) return { status: 'unknown' as const, reason: 'Missing terrain along the station-to-aircraft ray.' };
  const terrain = curvedTerrain(profile, effectiveRadiusFactor, terrainUncertaintyM);
  const rayHeightM = new Float64Array(terrain.length), firstFresnelRadiusM = new Float64Array(terrain.length), clearanceM = new Float64Array(terrain.length);
  let minimumFraction = Infinity, limitingIndex = -1;
  const wavelength = SPEED_OF_LIGHT_MPS / frequencyHz;
  for (let i = 0; i < terrain.length; i++) {
    const x = profile.distanceM[i]!, d = profile.pathLengthM;
    rayHeightM[i] = transmitterDatumM + (receiverDatumM - transmitterDatumM) * x / d;
    firstFresnelRadiusM[i] = Math.sqrt(wavelength * x * (d - x) / d);
    clearanceM[i] = rayHeightM[i]! - terrain[i]!;
    if (i > 0 && i < terrain.length - 1) {
      const fraction = clearanceM[i]! / firstFresnelRadiusM[i]!;
      if (fraction < minimumFraction) { minimumFraction = fraction; limitingIndex = i; }
    }
  }
  if (limitingIndex < 0 || !Number.isFinite(minimumFraction)) throw new Error('Fresnel evidence requires an interior terrain sample.');
  return { status: 'known' as const, minimumFirstFresnelClearanceFraction: minimumFraction, meetsSixtyPercentFresnel: minimumFraction >= .6, limitingIndex, limitingDistanceM: profile.distanceM[limitingIndex]!, limitingTerrainElevationM: profile.terrainM[limitingIndex]!, rayHeightM, firstFresnelRadiusM, clearanceM };
}
