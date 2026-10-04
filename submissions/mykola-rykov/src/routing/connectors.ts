import type { MotionState, Primitive } from './motion';
import { bearing, primitiveState } from './motion';
const rad = (n: number) => n * Math.PI / 180;
/** Circle tangencies found by bracketing a scalar cross product; endpoints are never snapped. */
export function goalConnectors(start: MotionState, goal: Omit<MotionState, 'headingDeg'>, radiusM: number, leg: Primitive['leg']): Primitive[][] {
  const distance = Math.hypot(goal.xM - start.xM, goal.yM - start.yM), result: Primitive[][] = [];
  if (distance < 1e-6) return result;
  const direct = bearing(goal.xM - start.xM, goal.yM - start.yM);
  if (Math.abs(((direct - start.headingDeg + 540) % 360) - 180) < 1e-5) result.push([{ start, lengthM: distance, turnDeg: 0, altitudeChangeM: goal.altitudeM - start.altitudeM, leg }]);
  for (const sign of [-1, 1]) {
    function arc(angle: number): Primitive { return { start, lengthM: radiusM * rad(angle), turnDeg: sign * angle, altitudeChangeM: 0, leg }; }
    const residual = (angle: number) => {
      const end = primitiveState(arc(angle), 1), theta = rad(end.headingDeg);
      return (goal.xM - end.xM) * Math.cos(theta) - (goal.yM - end.yM) * Math.sin(theta);
    };
    let left = .001, fLeft = residual(left);
    for (let right = 5; right <= 355; right += 5) {
      const fRight = residual(right);
      if (fLeft * fRight <= 0) {
        let lo = left, hi = right;
        for (let iteration = 0; iteration < 40; iteration++) { const mid = (lo + hi) / 2; if (residual(lo) * residual(mid) <= 0) hi = mid; else lo = mid; }
        const curve = arc((lo + hi) / 2), end = primitiveState(curve, 1), theta = rad(end.headingDeg);
        const remaining = (goal.xM - end.xM) * Math.sin(theta) + (goal.yM - end.yM) * Math.cos(theta);
        if (remaining > 1e-6) result.push([curve, { start: end, lengthM: remaining, turnDeg: 0, altitudeChangeM: goal.altitudeM - start.altitudeM, leg }]);
      }
      left = right; fLeft = fRight;
    }
  }
  return result.sort((a, b) => a.reduce((s, p) => s + p.lengthM, 0) - b.reduce((s, p) => s + p.lengthM, 0));
}
