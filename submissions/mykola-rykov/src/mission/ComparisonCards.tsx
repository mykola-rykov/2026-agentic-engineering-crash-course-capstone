import type { ScenarioResult } from '../contracts/result';
import { metricColor } from '../scene/scales';
import { compareMetrics } from './comparison';
interface Props { results: ScenarioResult[]; selected: number; requiredMarginDb: number; onSelect: (index: number) => void }
const number = (value: number | null, unit: string) => value === null ? 'Unavailable' : `${value.toFixed(2)} ${unit}`;
export default function ComparisonCards({ results, selected, requiredMarginDb, onSelect }: Props) {
  return <section aria-label="Scenario comparisons" className="comparison-cards">
    <p>Shared margin scale relative to {requiredMarginDb.toFixed(1)} dB required: red below requirement, amber up to 10 dB above, green ≥10 dB above. Grey means incomplete RF evidence.</p>
    {results.map((result, index) => { const comparison = compareMetrics(result, results[0]!); return <article data-testid="scenario-card" key={result.scenarioId} style={{ borderColor: metricColor(result.rfFeasibility.status === 'indeterminate' ? null : result.summary.minimumTwoWayMarginDb, 'margin', requiredMarginDb) }}>
      <button aria-pressed={selected === index} onClick={() => onSelect(index)}>Inspect {result.equipmentId}</button>
      <p>Overall: {result.feasibility.status} · RF: {result.rfFeasibility.status} · Energy/motion: {result.energyFeasibility.status}</p>
      <dl>
        <dt>Minimum two-way / uplink / downlink available margin</dt><dd>{number(result.summary.minimumTwoWayMarginDb, 'dB')} / {number(result.summary.minimumUplinkMarginDb, 'dB')} / {number(result.summary.minimumDownlinkMarginDb, 'dB')}{result.rfFeasibility.status === 'indeterminate' && ' · known samples only; incomplete route'}</dd>
        <dt>Distance / duration / climb</dt><dd>{number(result.summary.distanceM / 1000, 'km')} / {number(result.summary.durationS === null ? null : result.summary.durationS / 60, 'min')} / {number(result.summary.climbM, 'm')}</dd>
        <dt>Total electrical energy</dt><dd>{number(result.summary.energy?.totalWh ?? null, 'Wh')}</dd>
        <dt>Propulsion / avionics / radio / takeoff and landing</dt><dd>{number(result.summary.energy?.propulsionWh ?? null, 'Wh')} / {number(result.summary.energy?.avionicsWh ?? null, 'Wh')} / {number(result.summary.energy?.radioWh ?? null, 'Wh')} / {number(result.summary.energy?.takeoffLandingWh ?? null, 'Wh')}</dd>
        <dt>Remaining battery reserve</dt><dd>{number(result.summary.energy ? result.summary.energy.remainingReserveFraction * 100 : null, '%')}</dd>
      </dl>
      {index > 0 && <div aria-label="Computed tradeoffs"><p>Compared with {results[0]!.equipmentId}; numerical tradeoffs do not override feasibility.</p>{comparison.pros.map(value => <p key={value}>Pro: {value}</p>)}{comparison.cons.map(value => <p key={value}>Con: {value}</p>)}{comparison.unavailable.map(value => <p key={value}>{value}</p>)}</div>}
      {[...new Set([...result.feasibility.reasons, ...result.rfFeasibility.reasons, ...result.energyFeasibility.reasons, ...result.constraintViolations.map(v => v.reason)])].map(reason => <p key={reason}>{reason}</p>)}
      <details><summary>Scenario assumptions</summary>{result.assumptions.map(assumption => <p key={assumption}>{assumption}</p>)}</details>
    </article>; })}
  </section>;
}
