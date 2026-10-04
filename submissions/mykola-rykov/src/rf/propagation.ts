import { EARTH_RADIUS_M } from './profile';
export const SPEED_OF_LIGHT_MPS = 299_792_458;
export function checkFrequency(frequencyHz: number) {
  if (!Number.isFinite(frequencyHz) || frequencyHz < 100e6 || frequencyHz > 6e9) throw new Error('Frequency must be between 100 MHz and 6 GHz.');
}
export function freeSpaceLossDb(distanceM: number, frequencyHz: number, speedOfLightMps = SPEED_OF_LIGHT_MPS) {
  checkFrequency(frequencyHz);
  if (!Number.isFinite(distanceM) || distanceM <= 0 || !Number.isFinite(speedOfLightMps) || speedOfLightMps <= 0) throw new Error('Free-space distance and wave speed must be positive.');
  return 20 * Math.log10(4 * Math.PI * distanceM * frequencyHz / speedOfLightMps);
}
export function knifeEdgeLossDb(v: number) {
  if (!Number.isFinite(v)) throw new Error('Knife-edge parameter must be finite.');
  return v <= -.78 ? 0 : 6.9 + 20 * Math.log10(Math.hypot(v - .1, 1) + v - .1);
}
function bullington(distancesKm: readonly number[], heightsM: readonly number[], transmitterM: number, receiverM: number, radiusKm: number, wavelengthM: number) {
  const d = distancesKm.at(-1)!;
  const directSlope = (receiverM - transmitterM) / d;
  let txSlope = -Infinity, rxSlope = -Infinity, vMax = -Infinity;
  for (let i = 1; i < distancesKm.length - 1; i++) {
    const x = distancesKm[i]!, h = heightsM[i]! + 500 / radiusKm * x * (d - x);
    txSlope = Math.max(txSlope, (h - transmitterM) / x);
    rxSlope = Math.max(rxSlope, (h - receiverM) / (d - x));
    vMax = Math.max(vMax, (h - (transmitterM * (d - x) + receiverM * x) / d) * Math.sqrt(.002 * d / (wavelengthM * x * (d - x))));
  }
  let v = vMax;
  if (txSlope >= directSlope && txSlope + rxSlope > 0) {
    const x = (receiverM - transmitterM + rxSlope * d) / (txSlope + rxSlope);
    v = (transmitterM + txSlope * x - (transmitterM * (d - x) + receiverM * x) / d) * Math.sqrt(.002 * d / (wavelengthM * x * (d - x)));
  }
  const knife = knifeEdgeLossDb(v);
  return knife + (1 - Math.exp(-knife / 6)) * (10 + .02 * d);
}
function sphericalFirstTerm(d: number, h1: number, h2: number, radius: number, wavelength: number) {
  const x = Math.cbrt(Math.PI / (wavelength * radius * radius)) * d;
  const scale = 2 * Math.cbrt(Math.PI * Math.PI / (wavelength * wavelength * radius));
  const f = x >= 1.6 ? 11 + 10 * Math.log10(x) - 17.6 * x : -20 * Math.log10(x) - 5.6488 * x ** 1.425;
  const gain = (y: number) => y > 2 ? 17.6 * Math.sqrt(y - 1.1) - 5 * Math.log10(y - 1.1) - 8 : 20 * Math.log10(y + .1 * y ** 3);
  return -f - gain(scale * h1) - gain(scale * h2);
}
export function sphericalLossDb(distanceM: number, h1: number, h2: number, radiusM: number, wavelengthM: number) {
  if (![distanceM, h1, h2, radiusM, wavelengthM].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Spherical diffraction requires positive path, effective heights, radius and wavelength.');
  const horizon = Math.sqrt(2 * radiusM) * (Math.sqrt(h1) + Math.sqrt(h2));
  if (distanceM >= horizon) return Math.max(0, sphericalFirstTerm(distanceM, h1, h2, radiusM, wavelengthM));
  const c = (h1 - h2) / (h1 + h2), m = distanceM ** 2 / (4 * radiusM * (h1 + h2));
  const acosArgument = Math.max(-1, Math.min(1, 1.5 * c * Math.sqrt(3 * m / (m + 1) ** 3)));
  const b = 2 * Math.sqrt((m + 1) / (3 * m)) * Math.cos(Math.PI / 3 + Math.acos(acosArgument) / 3);
  const d1 = distanceM * (1 + b) / 2, d2 = distanceM - d1;
  const clearance = ((h1 - d1 * d1 / (2 * radiusM)) * d2 + (h2 - d2 * d2 / (2 * radiusM)) * d1) / distanceM;
  const required = .552 * Math.sqrt(d1 * d2 * wavelengthM / distanceM);
  if (clearance > required) return 0;
  const marginalRadius = .5 * (distanceM / (Math.sqrt(h1) + Math.sqrt(h2))) ** 2;
  const marginalLoss = sphericalFirstTerm(distanceM, h1, h2, marginalRadius, wavelengthM);
  return marginalLoss < 0 ? 0 : (1 - clearance / required) * marginalLoss;
}
export interface DiffractionOptions { effectiveEarthRadiusM?: number; speedOfLightMps?: number }
export function deltaBullington(distanceM: ArrayLike<number>, terrainM: ArrayLike<number>, transmitterDatumM: number, receiverDatumM: number, frequencyHz: number, options: DiffractionOptions = {}) {
  checkFrequency(frequencyHz);
  const radiusM = options.effectiveEarthRadiusM ?? EARTH_RADIUS_M * 4 / 3;
  const speed = options.speedOfLightMps ?? SPEED_OF_LIGHT_MPS;
  const d = Array.from(distanceM, (x) => x / 1000), h = Array.from(terrainM);
  if (d.length < 3 || h.length !== d.length || d[0] !== 0 || ![transmitterDatumM, receiverDatumM, radiusM, speed].every(Number.isFinite) || radiusM <= 0 || speed <= 0 || d.some((x, i) => !Number.isFinite(x) || !Number.isFinite(h[i]) || (i > 0 && x <= d[i - 1]!))) throw new Error('Invalid or incomplete diffraction profile.');
  const total = d.at(-1)!, wavelength = speed / frequencyHz;
  const actualBullingtonLossDb = bullington(d, h, transmitterDatumM, receiverDatumM, radiusM / 1000, wavelength);
  let integral1 = 0, integral2 = 0;
  for (let i = 1; i < d.length; i++) {
    const dx = d[i]! - d[i - 1]!;
    integral1 += dx * (h[i]! + h[i - 1]!);
    integral2 += dx * (h[i]! * (2 * d[i]! + d[i - 1]!) + h[i - 1]! * (d[i]! + 2 * d[i - 1]!));
  }
  let smoothTx = (2 * integral1 * total - integral2) / (total * total), smoothRx = (integral2 - integral1 * total) / (total * total);
  let obstruction = -Infinity, txAngle = -Infinity, rxAngle = -Infinity;
  for (let i = 1; i < d.length - 1; i++) {
    const excess = h[i]! - (transmitterDatumM * (total - d[i]!) + receiverDatumM * d[i]!) / total;
    obstruction = Math.max(obstruction, excess); txAngle = Math.max(txAngle, excess / d[i]!); rxAngle = Math.max(rxAngle, excess / (total - d[i]!));
  }
  if (obstruction > 0) { smoothTx -= obstruction * txAngle / (txAngle + rxAngle); smoothRx -= obstruction * rxAngle / (txAngle + rxAngle); }
  smoothTx = Math.min(smoothTx, h[0]!); smoothRx = Math.min(smoothRx, h.at(-1)!);
  const modifiedTransmitterHeightM = transmitterDatumM - smoothTx, modifiedReceiverHeightM = receiverDatumM - smoothRx;
  const smoothBullingtonLossDb = bullington(d, h.map(() => 0), modifiedTransmitterHeightM, modifiedReceiverHeightM, radiusM / 1000, wavelength);
  const spherical = sphericalLossDb(total * 1000, modifiedTransmitterHeightM, modifiedReceiverHeightM, radiusM, wavelength);
  const deltaBullingtonLossDb = actualBullingtonLossDb + Math.max(spherical - smoothBullingtonLossDb, 0);
  if (!Number.isFinite(deltaBullingtonLossDb)) throw new Error('Non-finite diffraction result.');
  return { actualBullingtonLossDb, smoothBullingtonLossDb, sphericalLossDb: spherical, deltaBullingtonLossDb, modifiedTransmitterHeightM, modifiedReceiverHeightM };
}
