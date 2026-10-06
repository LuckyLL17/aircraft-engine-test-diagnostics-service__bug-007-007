import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceHealth, initialHealth } from '../src/domain/health/advance.ts';
import type { ComponentHealth, HealthInterval } from '../src/domain/types.ts';

const intervals: HealthInterval[] = [
  { durationHours: 10, temperatureK: 1_200, vibrationRms: 5, operatingLoad: 1.5 },
  { durationHours: 20, temperatureK: 900, vibrationRms: 2, operatingLoad: 0.5 },
];

test('health advancement accumulates each interval from the preceding state', () => {
  const batched = advanceHealth(initialHealth(), intervals);
  const sequential = intervals.reduce(
    (state, interval) => advanceHealth(state, [interval]),
    initialHealth(),
  );

  assert.deepEqual(sequential, batched);
  assert.equal(batched.elapsedHours, 30);
  assert.equal(batched.version, 2);
  assert.ok(batched.compressorEfficiency < 1);
  assert.ok(batched.turbineFlowCapacity < 1);
  assert.ok(batched.hotSectionMargin < 1);
  assert.ok(batched.bearingFriction > 0);
});

test('health advancement can resume from a non-zero recovered state', () => {
  const recovered: ComponentHealth = {
    compressorEfficiency: 0.9,
    turbineFlowCapacity: 0.92,
    bearingFriction: 0.08,
    hotSectionMargin: 0.85,
    elapsedHours: 125,
    version: 7,
  };
  const recoveredSnapshot = structuredClone(recovered);

  const batched = advanceHealth(recovered, intervals);
  const sequential = intervals.reduce(
    (state, interval) => advanceHealth(state, [interval]),
    structuredClone(recovered),
  );

  assert.deepEqual(recovered, recoveredSnapshot);
  assert.deepEqual(sequential, batched);
  assert.equal(batched.elapsedHours, 155);
  assert.equal(batched.version, 9);
  assert.ok(batched.compressorEfficiency < recovered.compressorEfficiency);
  assert.ok(batched.turbineFlowCapacity < recovered.turbineFlowCapacity);
  assert.ok(batched.hotSectionMargin < recovered.hotSectionMargin);
  assert.ok(batched.bearingFriction > recovered.bearingFriction);
});

test('health metrics remain within their normalized bounds', () => {
  const severe: HealthInterval = {
    durationHours: 100_000,
    temperatureK: 2_000,
    vibrationRms: 1_000,
    operatingLoad: 2,
  };
  const result = advanceHealth(initialHealth(), [severe]);

  for (const value of [
    result.compressorEfficiency,
    result.turbineFlowCapacity,
    result.bearingFriction,
    result.hotSectionMargin,
  ]) {
    assert.ok(value >= 0 && value <= 1);
  }
  assert.equal(result.version, 1);
});

test('empty advancement preserves a recovered state', () => {
  const recovered: ComponentHealth = {
    compressorEfficiency: 0.9,
    turbineFlowCapacity: 0.92,
    bearingFriction: 0.08,
    hotSectionMargin: 0.85,
    elapsedHours: 125,
    version: 7,
  };

  assert.deepEqual(advanceHealth(recovered, []), recovered);
});

test('invalid recovered state is rejected', () => {
  assert.throws(
    () => advanceHealth({ ...initialHealth(), compressorEfficiency: 1.5 }, intervals),
    /Component health indicators/,
  );
  assert.throws(
    () => advanceHealth({ ...initialHealth(), version: -1 }, intervals),
    /Health version/,
  );
});
