import type { ScenarioResult } from '../contracts/result';
type Metrics = Pick<ScenarioResult, 'summary' | 'rfFeasibility'>;
export function routeObjective(result: ScenarioResult) {
  const objective = result.assumptions.map(a => /^Bounded (shortest|energy|margin) objective/.exec(a)?.[1]).find(Boolean);
  return objective === 'shortest' ? 'Shortest found route' : objective === 'energy' ? 'Lowest energy found route' : objective === 'margin' ? 'Highest minimum margin found route' : null;
}
export function compareMetrics(current: Metrics, baseline: Metrics) {
  const pros: string[] = [], cons: string[] = [], unavailable: string[] = [];
  const distanceDifferenceKm = (current.summary.distanceM - baseline.summary.distanceM) / 1000;
  if (Math.abs(distanceDifferenceKm) > 1e-6) (distanceDifferenceKm < 0 ? pros : cons).push(`${Math.abs(distanceDifferenceKm).toFixed(2)} km ${distanceDifferenceKm < 0 ? 'shorter' : 'longer'} than the comparison baseline.`);
  const a = current.summary.minimumTwoWayMarginDb, b = baseline.summary.minimumTwoWayMarginDb;
  if (a === null || b === null || current.rfFeasibility.status === 'indeterminate' || baseline.rfFeasibility.status === 'indeterminate') unavailable.push('Minimum-margin comparison unavailable because RF evidence is incomplete.');
  else if (Math.abs(a - b) > 1e-6) (a > b ? pros : cons).push(`${Math.abs(a - b).toFixed(2)} dB ${a > b ? 'greater' : 'lower'} minimum two-way margin than the comparison baseline.`);
  const energyA = current.summary.energy?.totalWh, energyB = baseline.summary.energy?.totalWh;
  if (energyA === undefined || energyB === undefined) unavailable.push('Electrical-energy comparison unavailable because one or both energy estimates are missing.');
  else if (Math.abs(energyA - energyB) > 1e-6) (energyA < energyB ? pros : cons).push(`${Math.abs(energyA - energyB).toFixed(2)} Wh ${energyA < energyB ? 'less' : 'more'} estimated electrical energy on the evaluated geometry.`);
  return { pros, cons, unavailable };
}
