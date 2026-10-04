export type Objective = 'shortest' | 'energy' | 'margin';
export interface Resources { distanceM: number; energyWh: number; marginDb: number }
export interface SearchEdge<S, G> { state: S; geometry: G; resources: Resources }
export interface SearchLabel<S, G> { state: S; resources: Resources; parent: SearchLabel<S, G> | null; geometry: G | null }
export function dominates(a: Resources, b: Resources) {
  // Suppress floating-point noise rather than inventing a 10^-14 dB advantage.
  const distanceToleranceM = 1e-6, energyToleranceWh = 1e-9, marginToleranceDb = 1e-9;
  return a.distanceM <= b.distanceM + distanceToleranceM && a.energyWh <= b.energyWh + energyToleranceWh && a.marginDb >= b.marginDb - marginToleranceDb && (a.distanceM < b.distanceM - distanceToleranceM || a.energyWh < b.energyWh - energyToleranceWh || a.marginDb > b.marginDb + marginToleranceDb);
}
export function equivalent(a: Resources, b: Resources) { return Math.abs(a.distanceM - b.distanceM) < 1e-6 && Math.abs(a.energyWh - b.energyWh) < 1e-9 && Math.abs(a.marginDb - b.marginDb) < 1e-9; }
export function priority(r: Resources, objective: Objective, distanceLowerBoundM = 0) {
  return objective === 'shortest' ? r.distanceM + distanceLowerBoundM : objective === 'energy' ? r.energyWh : -r.marginDb;
}
/** Resource labels preserve distance/energy/margin tradeoffs; all caps are explicit outcomes. */
export async function searchLabels<S, G>(options: {
  start: S; objective: Objective; bucket: (state: S) => string; goal: (state: S) => boolean;
  neighbors: (state: S) => Promise<SearchEdge<S, G>[]>; lowerBoundM: (state: S) => number;
  lowerBoundEnergyWh?: (state: S) => number; upperBoundMarginDb?: (state: S) => number;
  maximumDistanceM: number; maximumEnergyWh: number; requiredMarginDb: number;
  checkpoint: () => Promise<void>; maximumExpansions: number; maximumLabels: number; labelsPerBucket: number;
}) {
  const start: SearchLabel<S, G> = { state: options.start, parent: null, geometry: null, resources: { distanceM: 0, energyWh: 0, marginDb: Infinity } };
  const buckets = new Map<string, SearchLabel<S, G>[]>(), open = [start], goals: SearchLabel<S, G>[] = [];
  let expansions = 0, retained = 1, limited = false;
  const score = (label: SearchLabel<S, G>) => options.objective === 'energy' ? label.resources.energyWh + (options.lowerBoundEnergyWh?.(label.state) ?? 0) : options.objective === 'margin' ? -Math.min(label.resources.marginDb, options.upperBoundMarginDb?.(label.state) ?? Infinity) : priority(label.resources, options.objective, options.lowerBoundM(label.state));
  buckets.set(options.bucket(start.state), [start]);
  if (options.maximumEnergyWh < 0 || options.lowerBoundM(start.state) > options.maximumDistanceM || (options.upperBoundMarginDb?.(start.state) ?? Infinity) < options.requiredMarginDb) return { goals, expansions, retained, limited };
  while (open.length && expansions < options.maximumExpansions && retained < options.maximumLabels) {
    await options.checkpoint();
    let best = 0;
    for (let i = 1; i < open.length; i++) if (score(open[i]!) < score(open[best]!) || (score(open[i]!) === score(open[best]!) && options.lowerBoundM(open[i]!.state) < options.lowerBoundM(open[best]!.state))) best = i;
    const current = open.splice(best, 1)[0]!;
    if (!buckets.get(options.bucket(current.state))?.includes(current)) continue;
    if (goals.length && score(current) >= priority(goals[0]!.resources, options.objective) - 1e-9) break;
    if (options.goal(current.state)) { goals.push(current); if (goals.length >= 8) { limited = true; break; } continue; }
    expansions++;
    for (const edge of await options.neighbors(current.state)) {
      const resources = { distanceM: current.resources.distanceM + edge.resources.distanceM, energyWh: current.resources.energyWh + edge.resources.energyWh, marginDb: Math.min(current.resources.marginDb, edge.resources.marginDb) };
      if (resources.distanceM + options.lowerBoundM(edge.state) > options.maximumDistanceM || resources.energyWh > options.maximumEnergyWh || resources.marginDb < options.requiredMarginDb) continue;
      const key = options.bucket(edge.state), previous = buckets.get(key) ?? [];
      if (previous.some(label => dominates(label.resources, resources) || equivalent(label.resources, resources))) continue;
      const kept = previous.filter(label => !dominates(resources, label.resources));
      if (kept.length >= options.labelsPerBucket) { limited = true; continue; }
      const next: SearchLabel<S, G> = { state: edge.state, resources, parent: current, geometry: edge.geometry };
      kept.push(next); buckets.set(key, kept); retained++;
      if (options.goal(next.state)) {
        goals.push(next); goals.sort((a, b) => priority(a.resources, options.objective) - priority(b.resources, options.objective));
        if (goals.length > 8) { goals.pop(); limited = true; }
      } else open.push(next);
      if (retained >= options.maximumLabels) break;
    }
  }
  limited ||= open.length > 0;
  goals.sort((a, b) => priority(a.resources, options.objective) - priority(b.resources, options.objective));
  return { goals, expansions, retained, limited };
}
export function labelGeometry<S, G>(label: SearchLabel<S, G>): G[] {
  const result: G[] = [];
  for (let node: SearchLabel<S, G> | null = label; node; node = node.parent) if (node.geometry !== null) result.push(node.geometry);
  return result.reverse();
}
