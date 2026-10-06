import { invariant } from '../errors.ts';
import type { ComponentHealth, HealthInterval } from '../types.ts';

export function initialHealth(): ComponentHealth { return { compressorEfficiency: 1, turbineFlowCapacity: 1, bearingFriction: 0, hotSectionMargin: 1, elapsedHours: 0, version: 0 }; }

function validateInterval(interval: HealthInterval, index: number): void {
  invariant(interval.durationHours > 0 && Number.isFinite(interval.durationHours), 'INVALID_HEALTH_INTERVAL', 'Health interval duration must be positive and finite', { index });
  invariant(Number.isFinite(interval.temperatureK) && interval.temperatureK > 0, 'INVALID_HEALTH_INPUT', 'Health interval temperature must be positive and finite', { index });
  invariant(Number.isFinite(interval.vibrationRms) && interval.vibrationRms >= 0, 'INVALID_HEALTH_INPUT', 'Health interval vibration must be non-negative and finite', { index });
  invariant(Number.isFinite(interval.operatingLoad) && interval.operatingLoad >= 0, 'INVALID_HEALTH_INPUT', 'Health interval operating load must be non-negative and finite', { index });
}

function validateState(state: ComponentHealth): void {
  for (const key of ['compressorEfficiency', 'turbineFlowCapacity', 'bearingFriction', 'hotSectionMargin'] as const) {
    invariant(Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 1, 'INVALID_HEALTH_STATE', `${key} must be between zero and one`, { key, value: state[key] });
  }
  invariant(Number.isFinite(state.elapsedHours) && state.elapsedHours >= 0, 'INVALID_HEALTH_STATE', 'Elapsed hours must be non-negative and finite', { value: state.elapsedHours });
  invariant(Number.isSafeInteger(state.version) && state.version >= 0, 'INVALID_HEALTH_STATE', 'Version must be a non-negative safe integer', { value: state.version });
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
    bearingFriction: Math.min(1, state.bearingFriction + loss.bearingFriction),
    hotSectionMargin: Math.max(0, state.hotSectionMargin - loss.hotSectionMargin),
    elapsedHours: state.elapsedHours + interval.durationHours,
    version: state.version + 1,
  };
}

export function advanceHealth(state: ComponentHealth, intervals: HealthInterval[]): ComponentHealth {
  validateState(state);
  let next = structuredClone(state);
  for (const [index, interval] of intervals.entries()) {
    validateInterval(interval, index);
    invariant(Number.isFinite(next.elapsedHours + interval.durationHours), 'INVALID_HEALTH_INTERVAL', 'Health interval would overflow elapsed hours', { index });
    invariant(next.version < Number.MAX_SAFE_INTEGER, 'INVALID_HEALTH_STATE', 'Version cannot exceed the maximum safe integer', { index });
    next = applyInterval(next, interval);
  }
  return next;
}
