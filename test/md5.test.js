const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { getCurrentMd5, toMd5 } = require('../md5');
const { makeProject, removeProject } = require('./helpers');

const dirs = [];
const project = (files) => {
  const dir = makeProject(files);
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach(removeProject));

const apps = [{ name: 'svc', script: 'main.js' }];
const md5Of = (dir) => getCurrentMd5(dir, apps, []).svc;

describe('toMd5', () => {
  test('hashes a string deterministically', () => {
    assert.equal(toMd5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('getCurrentMd5', () => {
  test('returns one hash per app name', () => {
    const dir = project({ 'main.js': 'x', 'other.js': 'y' });
    const result = getCurrentMd5(dir, [
      { name: 'a', script: 'main.js' },
      { name: 'b', script: 'other.js' },
    ], []);

    assert.deepEqual(Object.keys(result), ['a', 'b']);
    assert.notEqual(result.a, result.b);
  });

  test('is stable when nothing changes', () => {
    const dir = project({ 'main.js': 'var a = 1;' });

    assert.equal(md5Of(dir), md5Of(dir));
  });

  test('ignores whitespace/comment-only changes (minified)', () => {
    const dir = project({ 'main.js': 'var a = 1;' });
    const before = md5Of(dir);
    require('fs').writeFileSync(`${dir}/main.js`, '// comment\nvar   a  =  1;\n');

    assert.equal(md5Of(dir), before);
  });

  test('changes when the code changes', () => {
    const dir = project({ 'main.js': 'var a = 1;' });
    const before = md5Of(dir);
    require('fs').writeFileSync(`${dir}/main.js`, 'var a = 2;');

    assert.notEqual(md5Of(dir), before);
  });

  test('changes when a required file changes', () => {
    const dir = project({ 'main.js': "require('./dep');", 'dep.js': 'var a = 1;' });
    const before = md5Of(dir);
    require('fs').writeFileSync(`${dir}/dep.js`, 'var a = 2;');

    assert.notEqual(md5Of(dir), before);
  });

  test('changes when main.config.json is added or edited', () => {
    const dir = project({ 'main.js': 'var a = 1;' });
    const without = md5Of(dir);
    require('fs').writeFileSync(`${dir}/main.config.json`, '{"a":1}');
    const withConfig = md5Of(dir);
    require('fs').writeFileSync(`${dir}/main.config.json`, '{"a":2}');
    const edited = md5Of(dir);

    assert.notEqual(without, withConfig);
    assert.notEqual(withConfig, edited);
  });

  test('changes when an external module version changes', () => {
    const dir = project({
      'main.js': "require('lodash');",
      'node_modules/lodash/package.json': '{"version":"1.0.0"}',
    });
    const before = md5Of(dir);
    require('fs').writeFileSync(`${dir}/node_modules/lodash/package.json`, '{"version":"1.0.1"}');

    assert.notEqual(md5Of(dir), before);
  });
});
