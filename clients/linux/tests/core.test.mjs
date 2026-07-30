import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCompatibleMeta, createDashboardViewModel, resolveRuntimeStatePath } from '../src/core.mjs';

test('resolves XDG runtime and state paths', () => {
  assert.equal(resolveRuntimeStatePath({ XDG_RUNTIME_DIR: '/run/user/1000' }, '/home/test'), '/run/user/1000/praxis-control/service.json');
  assert.equal(resolveRuntimeStatePath({ XDG_STATE_HOME: '/home/test/.state' }, '/home/test'), '/home/test/.state/praxis-control/service.json');
  assert.equal(resolveRuntimeStatePath({}, '/home/test'), '/home/test/.local/state/praxis-control/service.json');
});

test('rejects incompatible API versions', () => {
  assert.equal(assertCompatibleMeta({ apiVersion: 1 }).apiVersion, 1);
  assert.throws(() => assertCompatibleMeta({ apiVersion: 2 }), /仅支持 1/);
});

test('maps dashboard and graph responses to native labels', () => {
  assert.deepEqual(createDashboardViewModel({
    activeWip: 2,
    wipLimit: 4,
    awaitingReview: 3,
    reviewedLast7Days: 4,
    latestCheckin: { main_action: '完成 Linux 原生壳' },
  }, { nodes: [{}, {}], edges: [{}] }), {
    activeWip: '2 / 4',
    awaitingReview: '3',
    reviewedLast7Days: '4',
    graphSummary: '2 点 · 1 边',
    latestAction: '完成 Linux 原生壳',
  });
});
