const { fileExists, getFileJson, getFileContent } = require('./file_utilities');

const arrayDiff = (arr1, arr2, compareFct) => [
  arr1.filter((elem) => compareFct(elem, arr2)),
  arr2.filter((elem) => compareFct(elem, arr1)),
];

/**
 * Compares current checksums with the last stored ones.
 * @param {{script: string, name: string}[]} apps
 * @param {{[K:string]:string}} currentMd5
 * @param {string} md5Path
 * @returns {[{script: string, name: string}[], {script: string, name: string}[], {script: string, name: string}[]]}
 * [toRestart, toStop, toStart]
 */
const checkMd5 = (apps, currentMd5, md5Path) => {
  if (!fileExists(md5Path)) {
    return [apps, [], []];
  }
  const lastMd5 = getFileJson(md5Path);
  const [olds, news] = arrayDiff(
    Object.keys(lastMd5),
    Object.keys(currentMd5),
    (elem, arr) => !arr.includes(elem),
  );
  const toReload = Object.keys(currentMd5)
    .filter((key) => !news.includes(key) && currentMd5[key] !== lastMd5[key]);

  return [
    apps.filter((app) => toReload.includes(app.name)),
    olds.map((key) => ({ name: key, script: '' })),
    apps.filter((app) => news.includes(app.name)),
  ];
};

const loadParams = (param) => {
  try {
    return JSON.parse(param);
  } catch (e) {
    return {
      appPath: param,
    };
  }
};

/**
 * @param {{ecosystem_file: string, singleton_ecosystem_file: string, replicated_ecosystem_file: string}} conf
 * @param {string} appPath
 * @param {boolean} allowSingleton
 * @returns {string[]}
 */
const getEcosystemPaths = (conf, appPath, allowSingleton = false) => {
  if (fileExists(`${appPath}/${conf.replicated_ecosystem_file}`)) {
    const paths = [`${appPath}/${conf.replicated_ecosystem_file}`];

    if (allowSingleton) {
      paths.push(`${appPath}/${conf.singleton_ecosystem_file}`);
    }
    return paths;
  }
  return [`${appPath}/${conf.ecosystem_file}`];
};

/**
 * Reads an ecosystem file and extracts its apps and the require blacklist.
 * Accepts both plain JSON and a `module.exports = {...}` prefixed JSON.
 * @param {string} ecosystemPath
 * @returns {{apps: {script: string, name: string}[], requireBlacklist: string[]}}
 */
const loadEcosystem = (ecosystemPath) => {
  const ecosystem = JSON.parse(getFileContent(ecosystemPath).replace('module.exports = ', ''));

  return {
    apps: ecosystem.apps,
    requireBlacklist: ecosystem.startOrReloadConfig?.requireBlacklist || [],
  };
};

module.exports = {
  loadEcosystem,
  arrayDiff,
  checkMd5,
  loadParams,
  getEcosystemPaths,
};
