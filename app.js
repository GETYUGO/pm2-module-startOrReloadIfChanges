
const pmx = require('pmx');
const pm2 = require('pm2');

const { fileExists, putFileContent, makeFolder } = require('./file_utilities');
const { getCurrentMd5, toMd5 } = require('./md5');
const { checkMd5, loadParams, getEcosystemPaths: findEcosystemPaths, loadEcosystem } = require('./ecosystem');
const { createPM2Processes } = require('./pm2_processes');

const pm2Processes = createPM2Processes(pm2);
const { connect: connectToPM2, managePM2Processes, removeAndStartServices } = pm2Processes;

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

  const getEcosystemPaths = (appPath, allowSingleton = false) => findEcosystemPaths(conf, appPath, allowSingleton);

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
          const { apps, requireBlacklist } = loadEcosystem(ecosystemPath);

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
        const { apps, requireBlacklist } = loadEcosystem(ecosystemPath);

        const currentMd5 = getCurrentMd5(params.appPath, apps, requireBlacklist);

        putFileContent(md5Path, JSON.stringify(currentMd5));
      }

      return reply(`Successfully refreshed checksums`);
    } catch (e) {
      console.log(e);
      return reply('ERROR');
    }
  })
});
