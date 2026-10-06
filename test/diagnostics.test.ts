import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseVibration } from '../src/domain/vibration/fuse.ts';
import { estimateRemainingLife } from '../src/domain/life/estimate.ts';
import { evaluatePerformance } from '../src/domain/performance/evaluate.ts';
import { replayTelemetry } from '../src/domain/timeline/replay.ts';
import { advanceHealth, initialHealth } from '../src/domain/health/advance.ts';

test('replay is deterministic and removes duplicate event ids', () => {
  const events = [
    { runId: 'run-1', eventId: 'b', sampleTimeMs: 2, receivedTimeMs: 4, sequence: 2, sensor: 'rpm', value: 900, unit: 'rpm' },
    { runId: 'run-1', eventId: 'a', sampleTimeMs: 1, receivedTimeMs: 3, sequence: 1, sensor: 'rpm', value: 800, unit: 'rpm' },
    { runId: 'run-1', eventId: 'b', sampleTimeMs: 2, receivedTimeMs: 4, sequence: 2, sensor: 'rpm', value: 900, unit: 'rpm' },
  ] as any;
  assert.deepEqual(replayTelemetry(events).map((item) => item.eventId), ['a', 'b']);
});

test('performance produces physical normalized indicators', () => {
  const result = evaluatePerformance({ rpm: 9_000, fuelFlowKgPerSecond: 2, compressorOutletPressureKpa: 900, turbineInletTemperatureK: 1_000, ambientPressureKpa: 101.3, ambientTemperatureK: 288, inletPressureKpa: 100, referenceRpm: 10_000, referenceTemperatureK: 288, referencePressureKpa: 101.3 });
  assert.ok(result.pressureRatio > 1);
  assert.ok(result.compressorEfficiency >= 0 && result.compressorEfficiency <= 1);
});

test('vibration evidence is grouped by correlated source', () => {
  const result = diagnoseVibration([
    { evidenceId: 'a', sensorId: 's1', sourceGroup: 'g1', windowStartMs: 0, windowEndMs: 100, feature: 'bearing-envelope', fault: 'bearing', likelihoodRatio: 4, amplitude: 2 },
    { evidenceId: 'b', sensorId: 's1', sourceGroup: 'g1', windowStartMs: 20, windowEndMs: 80, feature: 'broadband', fault: 'bearing', likelihoodRatio: 4, amplitude: 2 },
    { evidenceId: 'c', sensorId: 's2', sourceGroup: 'g2', windowStartMs: 200, windowEndMs: 300, feature: 'bearing-envelope', fault: 'bearing', likelihoodRatio: 3, amplitude: 2 },
  ]);
  assert.equal(result[0].evidenceIds.length, 2);
});

test('life estimate is reproducible for a fixed seed', () => {
  const input = { initialHealth: { compressorEfficiency: 0.95, turbineFlowCapacity: 0.96, bearingFriction: 0.02, hotSectionMargin: 0.9, elapsedHours: 100, version: 1 }, horizonHours: 10_000, samples: 100, seed: 42, meanDegradationPerHour: 0.0002, deviation: 0.00003, temperatureStress: 0.2, vibrationStress: 0.1, failureThreshold: 0.4, correlation: [[1, 0.3], [0.3, 1]] as [[number, number], [number, number]] };
  assert.deepEqual(estimateRemainingLife(input), estimateRemainingLife(input));
});

test('health advancement accumulates intervals and resumes from non-zero state', () => {
  const intervals = [
    { durationHours: 2, temperatureK: 1200, vibrationRms: 3, operatingLoad: 1 },
    { durationHours: 4, temperatureK: 950, vibrationRms: 1, operatingLoad: 0.5 },
  ];
  const initial = { compressorEfficiency: 0.9, turbineFlowCapacity: 0.8, bearingFriction: 0.1, hotSectionMargin: 0.7, elapsedHours: 50, version: 7 };
  const batched = advanceHealth(initial, intervals);
  const afterFirst = advanceHealth(initial, [intervals[0]]);
  const resumed = advanceHealth(afterFirst, [intervals[1]]);

  const expected = {
    compressorEfficiency: 0.899948,
    turbineFlowCapacity: 0.79996,
    bearingFriction: 0.100044,
    hotSectionMargin: 0.69996,
    elapsedHours: 56,
    version: 9,
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.ok(Math.abs((batched as unknown as Record<string, number>)[key] - value) < 1e-12);
  }
  assert.deepEqual(resumed, batched);
  assert.equal(afterFirst.elapsedHours, 52);
  assert.equal(afterFirst.version, 8);
  assert.deepEqual(initial, { compressorEfficiency: 0.9, turbineFlowCapacity: 0.8, bearingFriction: 0.1, hotSectionMargin: 0.7, elapsedHours: 50, version: 7 });
});

test('health advancement preserves bounded monotonic state at extreme degradation', () => {
  const initial = { compressorEfficiency: 0.001, turbineFlowCapacity: 0.001, bearingFriction: 0.999, hotSectionMargin: 0.001, elapsedHours: 10, version: 1 };
  const result = advanceHealth(initial, [{ durationHours: 1_000, temperatureK: 2_000, vibrationRms: 1_000, operatingLoad: 10 }]);

  assert.deepEqual(result, { compressorEfficiency: 0, turbineFlowCapacity: 0, bearingFriction: 1, hotSectionMargin: 0, elapsedHours: 1010, version: 2 });
});

test('health advancement without intervals returns a restored state copy', () => {
  const initial = { compressorEfficiency: 0.5, turbineFlowCapacity: 0.6, bearingFriction: 0.2, hotSectionMargin: 0.4, elapsedHours: 25, version: 3 };
  assert.deepEqual(advanceHealth(initial, []), initial);
  assert.notEqual(advanceHealth(initial, []), initial);
  assert.deepEqual(initialHealth(), { compressorEfficiency: 1, turbineFlowCapacity: 1, bearingFriction: 0, hotSectionMargin: 1, elapsedHours: 0, version: 0 });
});
