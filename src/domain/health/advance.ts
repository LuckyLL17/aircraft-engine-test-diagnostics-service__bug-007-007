import { invariant } from '../errors.ts';
import type { ComponentHealth, HealthInterval } from '../types.ts';

export function initialHealth(): ComponentHealth { return { compressorEfficiency: 1, turbineFlowCapacity: 1, bearingFriction: 0, hotSectionMargin: 1, elapsedHours: 0, version: 0 }; }

function validateInterval(interval: HealthInterval, index: number): void {
  invariant(interval.durationHours > 0 && Number.isFinite(interval.durationHours), 'INVALID_HEALTH_INTERVAL', 'Health interval duration must be positive', { index });
  invariant(interval.temperatureK > 0 && interval.vibrationRms >= 0 && interval.operatingLoad >= 0, 'INVALID_HEALTH_INPUT', 'Health interval contains invalid physical values', { index });
}

function degradationFor(interval: HealthInterval): Pick<ComponentHealth, 'compressorEfficiency' | 'turbineFlowCapacity' | 'bearingFriction' | 'hotSectionMargin'> {
  const thermal = Math.max(0, interval.temperatureK - 700) / 500;
  const load = Math.min(2, interval.operatingLoad);
  const vibration = Math.max(0, interval.vibrationRms);
  const dt = interval.durationHours;
  return {
    compressorEfficiency: dt * (0.00001 * thermal + 0.000003 * load),
    turbineFlowCapacity: dt * (0.000008 * thermal + 0.000002 * load),
    bearingFriction: dt * (0.000004 * vibration + 0.000001 * load),
    hotSectionMargin: dt * 0.00001 * thermal,
  };
}

function applyInterval(state: ComponentHealth, interval: HealthInterval): ComponentHealth {
  const loss = degradationFor(interval);
  return {
    ...state,
    compressorEfficiency: Math.max(0, state.compressorEfficiency - loss.compressorEfficiency),
    turbineFlowCapacity: Math.max(0, state.turbineFlowCapacity - loss.turbineFlowCapacity),
    bearingFriction: state.bearingFriction + loss.bearingFriction,
    hotSectionMargin: Math.max(0, state.hotSectionMargin - loss.hotSectionMargin),
    elapsedHours: state.elapsedHours + interval.durationHours,
    version: state.version + 1,
  };
}

export function advanceHealth(state: ComponentHealth, intervals: HealthInterval[]): ComponentHealth {
  let next = structuredClone(state);
  for (const [index, interval] of intervals.entries()) {
    validateInterval(interval, index);
    const baseline = structuredClone(state);
    const updated = applyInterval(baseline, interval);
    next = { ...updated, elapsedHours: next.elapsedHours + interval.durationHours, version: next.version + 1 };
  }
  return next;
}
