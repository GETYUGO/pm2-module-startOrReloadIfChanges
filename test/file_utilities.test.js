const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  fileExists, getFileContent, getFileJson, putFileContent, makeFolder, getFileAndRequirements,
} = require('../file_utilities');
const { makeProject, removeProject } = require('./helpers');

const dirs = [];
const project = (files) => {
  const dir = makeProject(files);
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach(removeProject));

const analyse = (dir, entry, blacklist = []) => getFileAndRequirements(
  `${dir}/${entry}`,
  `${dir}/node_modules/`,
  blacklist,
);

describe('basic file helpers', () => {
  test('fileExists / getFileContent / getFileJson', () => {
    const dir = project({ 'a.json': '{"x":1}' });

    assert.equal(fileExists(`${dir}/a.json`), true);
    assert.equal(fileExists(`${dir}/nope.json`), false);
    assert.equal(getFileContent(`${dir}/a.json`), '{"x":1}');
    assert.deepEqual(getFileJson(`${dir}/a.json`), { x: 1 });
  });

  test('getFileContent throws when the file is missing', () => {
    const dir = project({});
    assert.throws(() => getFileContent(`${dir}/nope`), /File not found/);
  });

  test('putFileContent and makeFolder', () => {
    const dir = project({});
    makeFolder(`${dir}/sub`);
    putFileContent(`${dir}/sub/f.txt`, 'hello');

    assert.equal(fs.readFileSync(path.join(dir, 'sub/f.txt'), 'utf8'), 'hello');
  });
});

describe('getFileAndRequirements', () => {
  test('includes the file itself', () => {
    const dir = project({ 'main.js': 'var a = 1;' });

    assert.deepEqual(Object.keys(analyse(dir, 'main.js')), ['main.js']);
  });

  test('follows relative requires, with or without extension', () => {
    const dir = project({
      'main.js': "require('./lib/a'); require('./b.js'); require('./data.json');",
      'lib/a.js': 'module.exports = 1;',
      'b.js': 'module.exports = 2;',
      'data.json': '{"k":1}',
    });
    const result = analyse(dir, 'main.js');

    assert.deepEqual(Object.keys(result).sort(), ['a.js', 'b.js', 'data.json', 'main.js']);
  });

  test('records the version of external node modules', () => {
    const dir = project({
      'main.js': "require('lodash');",
      'node_modules/lodash/package.json': '{"version":"4.17.21"}',
    });

    assert.equal(analyse(dir, 'main.js').lodash, '4.17.21');
  });

  test('ignores external modules that are not installed (e.g. builtins)', () => {
    const dir = project({ 'main.js': "require('fs');" });

    assert.deepEqual(Object.keys(analyse(dir, 'main.js')), ['main.js']);
  });

  test('follows @yegows modules through their main file', () => {
    const dir = project({
      'main.js': "require('@yegows/core');",
      'node_modules/@yegows/core/package.json': '{"version":"1.0.0","main":"index.js"}',
      'node_modules/@yegows/core/index.js': 'module.exports = 1;',
    });

    assert.ok('index.js' in analyse(dir, 'main.js'));
  });

  test('respects the require blacklist', () => {
    const dir = project({
      'main.js': "require('./skipped'); require('./kept');",
      'skipped.js': 'x',
      'kept.js': 'y',
    });
    const result = analyse(dir, 'main.js', ['skipped']);

    assert.ok(!('skipped.js' in result));
    assert.ok('kept.js' in result);
  });

  test('does not loop forever on circular requires', () => {
    const dir = project({
      'a.js': "require('./b');",
      'b.js': "require('./a');",
    });
    const originalError = console.error;
    console.error = () => { };
    try {
      assert.deepEqual(Object.keys(analyse(dir, 'a.js')).sort(), ['a.js', 'b.js']);
    } finally {
      console.error = originalError;
    }
  });
});

describe('<name>.config.json sibling', () => {
  test('is added when it exists next to the script', () => {
    const dir = project({
      'main.js': 'var a = 1;',
      'main.config.json': '{"port":3000}',
    });
    const result = analyse(dir, 'main.js');

    assert.equal(result['main.config.json'], '{"port":3000}');
  });

  test('is not added when absent', () => {
    const dir = project({ 'main.js': 'var a = 1;' });

    assert.ok(!('main.config.json' in analyse(dir, 'main.js')));
  });

  test('is added for required local files too', () => {
    const dir = project({
      'main.js': "require('./lib');",
      'lib.js': 'x',
      'lib.config.json': '{"a":1}',
    });

    assert.equal(analyse(dir, 'main.js')['lib.config.json'], '{"a":1}');
  });

  test('is not looked up for a config.json file itself', () => {
    const dir = project({
      'main.js': "require('./main.config.json');",
      'main.config.json': '{"a":1}',
    });
    const result = analyse(dir, 'main.js');

    assert.deepEqual(Object.keys(result).sort(), ['main.config.json', 'main.js']);
  });
});
