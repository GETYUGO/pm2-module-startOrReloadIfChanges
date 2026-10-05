const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { arrayDiff, checkMd5, loadParams, getEcosystemPaths, loadEcosystem } = require('../ecosystem');
const { makeProject, removeProject } = require('./helpers');

const dirs = [];
const project = (files) => {
  const dir = makeProject(files);
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach(removeProject));

const conf = {
  ecosystem_file: 'ecosystem.config.json',
  singleton_ecosystem_file: 'ecosystem.singleton.json',
  replicated_ecosystem_file: 'ecosystem.replicated.json',
};

describe('arrayDiff', () => {
  test('returns the elements of each array matching the predicate against the other', () => {
    const notIn = (elem, arr) => !arr.includes(elem);

    assert.deepEqual(arrayDiff(['a', 'b'], ['b', 'c'], notIn), [['a'], ['c']]);
  });
});

describe('checkMd5', () => {
  const apps = [
    { name: 'a', script: 'a.js' },
    { name: 'b', script: 'b.js' },
    { name: 'c', script: 'c.js' },
  ];

  test('restarts everything when there is no stored checksum file', () => {
    const dir = project({});

    assert.deepEqual(checkMd5(apps, { a: '1', b: '2', c: '3' }, `${dir}/missing.json`), [apps, [], []]);
  });

  test('detects changed, removed and new services', () => {
    const dir = project({ 'md5.json': JSON.stringify({ a: '1', b: 'old', gone: '9' }) });
    const [toRestart, toStop, toStart] = checkMd5(apps, { a: '1', b: 'new', c: '3' }, `${dir}/md5.json`);

    assert.deepEqual(toRestart, [apps[1]]);
    assert.deepEqual(toStop, [{ name: 'gone', script: '' }]);
    assert.deepEqual(toStart, [apps[2]]);
  });

  test('returns nothing to do when checksums are identical', () => {
    const md5 = { a: '1', b: '2', c: '3' };
    const dir = project({ 'md5.json': JSON.stringify(md5) });

    assert.deepEqual(checkMd5(apps, md5, `${dir}/md5.json`), [[], [], []]);
  });

  test('a new service is not also reported as changed', () => {
    const dir = project({ 'md5.json': JSON.stringify({ a: '1' }) });
    const [toRestart, , toStart] = checkMd5(apps, { a: '1', b: '2' }, `${dir}/md5.json`);

    assert.deepEqual(toRestart, []);
    assert.deepEqual(toStart, [apps[1]]);
  });
});

describe('loadParams', () => {
  test('parses a JSON string', () => {
    assert.deepEqual(loadParams('{"appPath":"/srv/app","allowSingleton":true}'), {
      appPath: '/srv/app',
      allowSingleton: true,
    });
  });

  test('treats a non-JSON string as the app path', () => {
    assert.deepEqual(loadParams('/srv/app'), { appPath: '/srv/app' });
  });
});

describe('getEcosystemPaths', () => {
  test('falls back to the single ecosystem file', () => {
    const dir = project({});

    assert.deepEqual(getEcosystemPaths(conf, dir), [`${dir}/ecosystem.config.json`]);
  });

  test('uses the replicated file when it exists', () => {
    const dir = project({ 'ecosystem.replicated.json': '{}' });

    assert.deepEqual(getEcosystemPaths(conf, dir), [`${dir}/ecosystem.replicated.json`]);
  });

  test('adds the singleton file when allowed', () => {
    const dir = project({ 'ecosystem.replicated.json': '{}' });

    assert.deepEqual(getEcosystemPaths(conf, dir, true), [
      `${dir}/ecosystem.replicated.json`,
      `${dir}/ecosystem.singleton.json`,
    ]);
  });

  test('ignores allowSingleton when there is no replicated file', () => {
    const dir = project({});

    assert.deepEqual(getEcosystemPaths(conf, dir, true), [`${dir}/ecosystem.config.json`]);
  });
});

describe('loadEcosystem', () => {
  const content = {
    apps: [{ name: 'a', script: 'a.js' }],
    startOrReloadConfig: { requireBlacklist: ['utils', '@scope/'] },
  };

  test('reads apps and requireBlacklist', () => {
    const dir = project({ 'eco.json': JSON.stringify(content) });

    assert.deepEqual(loadEcosystem(`${dir}/eco.json`), {
      apps: content.apps,
      requireBlacklist: ['utils', '@scope/'],
    });
  });

  test('defaults requireBlacklist to an empty list', () => {
    const dir = project({ 'eco.json': JSON.stringify({ apps: content.apps }) });

    assert.deepEqual(loadEcosystem(`${dir}/eco.json`).requireBlacklist, []);
  });

  test('accepts a `module.exports = ` prefix', () => {
    const dir = project({ 'eco.js': `module.exports = ${JSON.stringify(content)}` });

    assert.deepEqual(loadEcosystem(`${dir}/eco.js`).apps, content.apps);
  });

  test('throws when the file is missing', () => {
    const dir = project({});

    assert.throws(() => loadEcosystem(`${dir}/nope.json`), /File not found/);
  });
});
