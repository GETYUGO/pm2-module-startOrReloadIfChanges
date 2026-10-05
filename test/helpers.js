const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Creates a temporary project directory from a {relativePath: content} map.
 * @returns {string} absolute path of the directory
 */
const makeProject = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sori-'));

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
};

const removeProject = (dir) => fs.rmSync(dir, { recursive: true, force: true });

module.exports = { makeProject, removeProject };
