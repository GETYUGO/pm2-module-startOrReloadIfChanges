
const pmx = require('pmx');
const pm2 = require('pm2');

const { fileExists, putFileContent, getFileJson, getFileContent, makeFolder } = require('./file_utilities');
const { getCurrentMd5, toMd5 } = require('./md5');

const arrayDiff = (arr1, arr2, compareFct) => [
  arr1.filter((elem) => compareFct(elem, arr2)),
  arr2.filter((elem) => compareFct(elem, arr1)),
];

/**
 * 
 * @param {{script: string, name: string}[]} apps 
 * @param {{[K:string]:string}} currentMd5
 * @param {string} md5Path 
 * @returns {[{script: string, name: string}[], {script: string, name: string}[]]}
 */
const checkMd5 = (apps, currentMd5, md5Path) => {
  if (!fileExists(md5Path)) {
    return [apps, []];
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
    apps.filter((app) => news.includes(app.name) || toReload.includes(app.name)),
    olds.map((key) => ({ name: key, script: '' })),
  ];
};

const connectToPM2 = () => new Promise((resolve, reject) => {
  pm2.connect((err) => {
    if (err) reject(err);
    else resolve();
  });
});

const startPM2Processes = (toRestart, cwd = undefined) => new Promise((resolve, reject) => {
  pm2.start(toRestart, { cwd }, (err, apps) => {
    if (err) reject(err);
    else resolve(apps);
  });
});

const deletePM2Process = (toStop) => new Promise((resolve, reject) => {
  pm2.stop(toStop, (err) => {
    if (err) reject(err);
    else resolve();
  });
});

const managePM2Processes = async (toRestart, toStop, cwd = undefined) => {
  await connectToPM2();
  if (toStop.length > 0) {
    for (const arg of toStop) {
      await deletePM2Process(arg.name);
    }
  }
  if (toRestart.length > 0) {
    for (const arg of toRestart) {
      await startPM2Processes(arg, cwd)
    }
  }
  pm2.disconnect();
}

pmx.initModule({
  widget: {
    logo: 'https://app.keymetrics.io/img/logo/keymetrics-300.png',

    // Module colors
    // 0 = main element
    // 1 = secondary
    // 2 = main border
    // 3 = secondary border
    theme: ['#141A1F', '#222222', '#3ff', '#3ff'],

    // Section to show / hide
    el: {
      probes: false,
      actions: true
    },

    // Main block to show / hide
    block: {
      actions: true,
      issues: false,
      meta: false,
    }
  }
}, (err, conf) => {
  const pm2Path = `${process.env.HOME}/.pm2`;
  const startOrReloadPath = `${pm2Path}/start_or_reload`

  const getMd5Path = (param) => `${startOrReloadPath}/${toMd5(param)}.json`;
  const getEcosystemPath = (param) => `${param}/${conf.ecosystem_file}`;

  if (!fileExists(startOrReloadPath)) {
    makeFolder(startOrReloadPath);
  }

  pmx.action('reloads', async (param, reply) => {
    try {
      const md5Path = getMd5Path(param);
      const ecosystemPath = getEcosystemPath(param);
      const ecosystem = JSON.parse(getFileContent(ecosystemPath));
      const requireBlacklist = ecosystem.startOrReloadConfig?.requireBlacklist || [];

      const currentMd5 = getCurrentMd5(param, ecosystem.apps, requireBlacklist);

      const [toRestart, toStop] = checkMd5(ecosystem.apps, currentMd5, md5Path);

      await managePM2Processes(toRestart, toStop, param);

      putFileContent(md5Path, JSON.stringify(currentMd5));
      putFileContent(`${param}/${conf.to_restart_file}`, JSON.stringify(toRestart));
      putFileContent(`${param}/${conf.to_stop_file}`, JSON.stringify(toStop));

      return reply(`Start ${toRestart.map(a => a.name).join(', ')}. Stop ${toStop.map(a => a.name).join(', ')}`);
    } catch (e) {
      console.log(e);
      return reply('ERROR');
    }
  });

  pmx.action('refresh', async (param, reply) => {
    try {
      const md5Path = getMd5Path(param);
      const ecosystemPath = getEcosystemPath(param);
      const ecosystem = JSON.parse(getFileContent(ecosystemPath).replace('module.exports = ', ''));
      const requireBlacklist = ecosystem.startOrReloadConfig?.requireBlacklist || [];

      const currentMd5 = getCurrentMd5(param, ecosystem.apps, requireBlacklist);

      putFileContent(md5Path, JSON.stringify(currentMd5));

      return reply(`Successfully refreshed checksums`);
    } catch (e) {
      console.log(e);
      return reply('ERROR');
    }
  })
});
