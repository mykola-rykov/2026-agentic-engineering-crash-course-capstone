import type { MissionConfig } from '../contracts/mission';
import { linkBudgetSchema } from '../contracts/result';
import type { z } from 'zod';
type Radio = MissionConfig['equipment'][number]['uplink'];
export type LinkBudget = z.infer<typeof linkBudgetSchema>;
export function directionalBudget(radio: Radio, transmitGainDbi: number, receiveGainDbi: number, freeSpaceLossDb: number, diffractionLossDb: number, uncertaintyAllowanceDb: number): LinkBudget {
  const receivedPowerDbm = radio.transmitPowerDbm + transmitGainDbi + receiveGainDbi - freeSpaceLossDb - diffractionLossDb - radio.cableLossDb - radio.polarizationLossDb - radio.installationLossDb;
  return linkBudgetSchema.parse({ transmitPowerDbm: radio.transmitPowerDbm, transmitGainDbi, receiveGainDbi, freeSpaceLossDb, diffractionLossDb, cableLossDb: radio.cableLossDb, polarizationLossDb: radio.polarizationLossDb, installationLossDb: radio.installationLossDb, receivedPowerDbm, receiverSensitivityDbm: radio.receiverSensitivityDbm, uncertaintyAllowanceDb, availableMarginDb: receivedPowerDbm - radio.receiverSensitivityDbm - uncertaintyAllowanceDb });
}
export function twoWayBudget(equipment: MissionConfig['equipment'][number], groundGainDbi: number | null, airborneGainDbi: number | null, propagation: { freeSpaceLossDb: number; diffractionLossDb: number } | null, uncertaintyAllowanceDb: number, requiredMarginDb: number) {
  if (!Number.isFinite(requiredMarginDb) || requiredMarginDb < 0 || !Number.isFinite(uncertaintyAllowanceDb) || uncertaintyAllowanceDb < 0) throw new Error('Required margin and RF allowance must be finite and nonnegative.');
  if (groundGainDbi === null || airborneGainDbi === null || propagation === null) return { status: 'indeterminate' as const, reason: 'Missing terrain propagation or antenna-pattern support.' };
  const uplink = directionalBudget(equipment.uplink, groundGainDbi, airborneGainDbi, propagation.freeSpaceLossDb, propagation.diffractionLossDb, uncertaintyAllowanceDb);
  const downlink = directionalBudget(equipment.downlink, airborneGainDbi, groundGainDbi, propagation.freeSpaceLossDb, propagation.diffractionLossDb, uncertaintyAllowanceDb);
  const minimumMarginDb = Math.min(uplink.availableMarginDb, downlink.availableMarginDb);
  return { status: minimumMarginDb >= requiredMarginDb ? 'feasible' as const : 'infeasible' as const, uplink, downlink, minimumMarginDb, limitingDirection: uplink.availableMarginDb <= downlink.availableMarginDb ? 'uplink' as const : 'downlink' as const };
}
