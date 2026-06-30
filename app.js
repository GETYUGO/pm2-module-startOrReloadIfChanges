
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
 * @returns {[{script: string, name: string}[], {script: string, name: string}[]], {script: string, name: string}[]}
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

const connectToPM2 = () => new Promise((resolve, reject) => {
  pm2.connect((err) => {
    if (err) reject(err);
    else resolve();
  });
});

const startPM2Processes = (toRestart, cwd = undefined) => new Promise((resolve, reject) => {
  pm2.start({ cwd, ...toRestart }, (err, apps) => {
    if (err) reject(err);
    else resolve(apps);
  });
});

const restartPM2Processes = (toReload, cwd = undefined) => new Promise((resolve, reject) => {
  pm2.restart(toReload, { updateEnv: true }, (err, apps) => {
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

const killPM2Process = (toKill) => new Promise((resolve, reject) => {
  pm2.delete(toKill, (err) => {
    if (err) reject(err);
    else resolve();
  })
});

const managePM2Processes = async (toRestart, toStop, toStart, cwd = undefined) => {
  if (toStop.length > 0) {
    for (const arg of toStop) {
      await deletePM2Process(arg.name);
    }
  }
  if (toRestart.length > 0) {
    for (const arg of toRestart) {
      await restartPM2Processes(arg.name, cwd)
    }
  }
  if (toStart.length > 0) {
    for (const arg of toStart) {
      await startPM2Processes(arg, cwd)
    }
  }
}

const loadParams = (param) => {
  return JSON.parse(param);
}

const removeAndStartServices = async (toRestart, toStop, toStart, cwd = undefined) => {
  for (const arg of toStop) {
    console.log('Will stop', arg, cwd);
    await deletePM2Process(arg.name).catch(() => { });
  }
  for (const arg of toRestart) {
    console.log('Will kill', arg, cwd);
    await killPM2Process(arg.name).catch(() => { });
    console.log('Will start');
    await startPM2Processes(arg, cwd);
    console.log('Finish', arg);
  }
  for (const arg of toStart) {
    console.log('Will start new', arg, cwd);
    await startPM2Processes(arg, cwd);
    console.log('Finish new', arg);
  }
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

  const getMd5Path = (ecosystemPath) => `${startOrReloadPath}/${toMd5(ecosystemPath)}.json`;
  const getEcosystemPaths = (appPath, allowSingleton = false) => {
    const paths = [
      `${appPath}/${conf.replicated_ecosystem_file}`
    ]
    if (allowSingleton) {
      paths.push(`${appPath}/${conf.singleton_ecosystem_file}`);
    }
    return paths;
  };

  if (!fileExists(startOrReloadPath)) {
    makeFolder(startOrReloadPath);
  }

  pmx.action('reloads', async (param, reply) => {
    console.log('Reloads action called with param:', param);
    try {
      const allRestarted = [];
      const allStopped = [];
      const allStarted = [];
      const params = loadParams(param);
      const ecosystemPaths = getEcosystemPaths(params.appPath, params.allowSingleton);

      console.log('Params:', params);
      console.log('Ecosystem paths:', ecosystemPaths);

      try {
        await connectToPM2();

        for (const ecosystemPath of ecosystemPaths) {
          const md5Path = getMd5Path(ecosystemPath);
          const ecosystem = JSON.parse(getFileContent(ecosystemPath));
          const { apps, startOrReloadConfig } = ecosystem;
          const requireBlacklist = startOrReloadConfig?.requireBlacklist || [];

          const currentMd5 = getCurrentMd5(params.appPath, apps, requireBlacklist);

          const [toRestart, toStop, toStart] = checkMd5(apps, currentMd5, md5Path);


          if (!fileExists(md5Path)) {
            console.log('File not exists', md5Path);
            await removeAndStartServices(toRestart, toStop, toStart, params.appPath);
          } else {
            console.log('File exists', md5Path);
            await managePM2Processes(toRestart, toStop, toStart, params.appPath);
          }


          putFileContent(md5Path, JSON.stringify(currentMd5));
          allRestarted.push(...toRestart);
          allStopped.push(...toStop);
          allStarted.push(...toStart);
        }
      } finally {
        pm2.disconnect();
      }

      putFileContent(`${params.appPath}/${conf.to_restart_file}`, JSON.stringify(allRestarted));
      putFileContent(`${params.appPath}/${conf.to_stop_file}`, JSON.stringify(allStopped));
      putFileContent(`${params.appPath}/${conf.to_start_file}`, JSON.stringify(allStarted));

      return reply(`Restart ${allRestarted.map(a => a.name).join(', ')}. Stop ${allStopped.map(a => a.name).join(', ')}. Start ${allStarted.map(a => a.name).join(', ')}`);
    } catch (e) {
      console.log(e);
      return reply('ERROR');
    }
  });

  pmx.action('refresh', async (param, reply) => {
    try {
      const params = loadParams(param);
      const ecosystemPaths = getEcosystemPaths(params.appPath, params.allowSingleton);

      for (const ecosystemPath of ecosystemPaths) {
        const md5Path = getMd5Path(ecosystemPath);
        const ecosystem = JSON.parse(getFileContent(ecosystemPath).replace('module.exports = ', ''));
        const requireBlacklist = ecosystem.startOrReloadConfig?.requireBlacklist || [];

        const currentMd5 = getCurrentMd5(params.appPath, ecosystem.apps, requireBlacklist);

        putFileContent(md5Path, JSON.stringify(currentMd5));
      }

      return reply(`Successfully refreshed checksums`);
    } catch (e) {
      console.log(e);
      return reply('ERROR');
    }
  })
});
