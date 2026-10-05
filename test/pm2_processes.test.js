const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createPM2Processes } = require('../pm2_processes');

let calls;
let failOn;
let pm2;
const silent = { log: () => { } };

const fake = (name) => (...args) => {
  const cb = args.pop();
  calls.push([name, ...args]);
  if (failOn === name) cb(new Error(`${name} failed`));
  else cb(null, `${name} ok`);
};

beforeEach(() => {
  calls = [];
  failOn = undefined;
  pm2 = {
    connect: fake('connect'),
    start: fake('start'),
    restart: fake('restart'),
    stop: fake('stop'),
    delete: fake('delete'),
  };
});

const svc = (name) => ({ name, script: `${name}.js` });

describe('basic wrappers', () => {
  test('start passes cwd merged into the app config', async () => {
    await createPM2Processes(pm2, silent).start(svc('a'), '/srv');

    assert.deepEqual(calls, [['start', { cwd: '/srv', name: 'a', script: 'a.js' }]]);
  });

  test('restart passes updateEnv', async () => {
    await createPM2Processes(pm2, silent).restart('a');

    assert.deepEqual(calls, [['restart', 'a', { updateEnv: true }]]);
  });

  test('rejects when pm2 returns an error', async () => {
    failOn = 'connect';

    await assert.rejects(createPM2Processes(pm2, silent).connect(), /connect failed/);
  });
});

describe('managePM2Processes', () => {
  test('stops, then restarts, then starts', async () => {
    await createPM2Processes(pm2, silent)
      .managePM2Processes([svc('r')], [svc('s')], [svc('n')], '/srv');

    assert.deepEqual(calls.map(([name, arg]) => [name, arg.name ?? arg]), [
      ['stop', 's'],
      ['restart', 'r'],
      ['start', 'n'],
    ]);
  });

  test('propagates errors', async () => {
    failOn = 'stop';

    await assert.rejects(
      createPM2Processes(pm2, silent).managePM2Processes([], [svc('s')], []),
      /stop failed/,
    );
  });
});

describe('removeAndStartServices', () => {
  test('stops, kills + starts changed services, then starts new ones', async () => {
    await createPM2Processes(pm2, silent)
      .removeAndStartServices([svc('r')], [svc('s')], [svc('n')], '/srv');

    assert.deepEqual(calls.map(([name, arg]) => [name, arg.name ?? arg]), [
      ['stop', 's'],
      ['delete', 'r'],
      ['start', 'r'],
      ['start', 'n'],
    ]);
  });

  test('ignores stop and delete errors but not start errors', async () => {
    failOn = 'stop';
    await createPM2Processes(pm2, silent).removeAndStartServices([], [svc('s')], []);

    failOn = 'start';
    await assert.rejects(
      createPM2Processes(pm2, silent).removeAndStartServices([], [], [svc('n')]),
      /start failed/,
    );
  });
});
