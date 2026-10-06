import { invariant } from '../errors.ts';
import type { ComponentHealth, HealthInterval } from '../types.ts';

export function initialHealth(): ComponentHealth {
  return {
    compressorEfficiency: 1,
    turbineFlowCapacity: 1,
    bearingFriction: 0,
    hotSectionMargin: 1,
    elapsedHours: 0,
    version: 0,
  };
}

function validateInterval(interval: HealthInterval, index: number): void {
  invariant(
    Number.isFinite(interval.durationHours) && interval.durationHours > 0,
    'INVALID_HEALTH_INTERVAL',
    'Health interval duration must be positive and finite',
    { index },
  );
  invariant(
    Number.isFinite(interval.temperatureK) && interval.temperatureK > 0
      && Number.isFinite(interval.vibrationRms) && interval.vibrationRms >= 0
      && Number.isFinite(interval.operatingLoad) && interval.operatingLoad >= 0,
    'INVALID_HEALTH_INPUT',
    'Health interval contains invalid physical values',
    { index },
  );
}

function validateState(state: ComponentHealth): void {
  const bounded = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
  invariant(
    bounded(state.compressorEfficiency)
      && bounded(state.turbineFlowCapacity)
      && bounded(state.bearingFriction)
      && bounded(state.hotSectionMargin),
    'INVALID_HEALTH_STATE',
    'Component health indicators must be finite values between zero and one',
  );
  invariant(
    Number.isFinite(state.elapsedHours) && state.elapsedHours >= 0,
    'INVALID_HEALTH_STATE',
    'Elapsed hours must be finite and non-negative',
  );
  invariant(
    Number.isSafeInteger(state.version) && state.version >= 0,
    'INVALID_HEALTH_STATE',
    'Health version must be a non-negative safe integer',
  );
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

function clampHealthMetric(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function applyInterval(state: ComponentHealth, interval: HealthInterval): ComponentHealth {
  const loss = degradationFor(interval);
  const elapsedHours = state.elapsedHours + interval.durationHours;
  invariant(Number.isFinite(elapsedHours), 'INVALID_ELAPSED_HOURS', 'Accumulated elapsed hours must remain finite');
  invariant(state.version < Number.MAX_SAFE_INTEGER, 'HEALTH_VERSION_OVERFLOW', 'Health version cannot exceed the maximum safe integer');
  return {
    compressorEfficiency: clampHealthMetric(state.compressorEfficiency - loss.compressorEfficiency),
    turbineFlowCapacity: clampHealthMetric(state.turbineFlowCapacity - loss.turbineFlowCapacity),
    bearingFriction: clampHealthMetric(state.bearingFriction + loss.bearingFriction),
    hotSectionMargin: clampHealthMetric(state.hotSectionMargin - loss.hotSectionMargin),
    elapsedHours,
    version: state.version + 1,
  };
}

export function advanceHealth(state: ComponentHealth, intervals: HealthInterval[]): ComponentHealth {
  let next = structuredClone(state);
  validateState(next);
  for (const [index, interval] of intervals.entries()) {
    validateInterval(interval, index);
    next = applyInterval(next, interval);
  }
  return next;
}
