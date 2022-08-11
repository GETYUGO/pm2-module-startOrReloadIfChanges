
const pmx = require('pmx');
const pm2 = require('pm2');
const fs = require('fs');

const { fileExists, putFileContent, getFileJson, getFileContent } = require('./file_utilities');
const { getCurrentMd5 } = require('./md5');

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
  console.log('current md5:', currentMd5);
  console.log('last md5', lastMd5);
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
    await Promise.all(toStop.map((arg) => deletePM2Process(arg.name)));
  }
  if (toRestart.length > 0) {
    await startPM2Processes(toRestart, cwd);
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
  pmx.action('reloads', async (param, reply) => {
    try {
      const pm2Path = `${process.env.HOME}/.pm2`
      const md5Path = `${pm2Path}/${conf.services_md5_file}`;
      const ecosystemPath = `${param}/${conf.ecosystem_file}`
      const ecosystem = JSON.parse(getFileContent(ecosystemPath).replace('module.exports = ', ''));

      const currentMd5 = getCurrentMd5(param, ecosystem.apps);

      const [toRestart, toStop] = checkMd5(ecosystem.apps, currentMd5, md5Path);

      console.log('ToRestart:', toRestart);
      console.log('ToStop:', toStop);

      await managePM2Processes(toRestart, toStop, param);

      putFileContent(md5Path, JSON.stringify(currentMd5));
      putFileContent(`${param}/${conf.to_restart_file}`, JSON.stringify(toRestart));
      putFileContent(`${param}/${conf.to_stop_file}`, JSON.stringify(toRestart));

      console.log('\n\nEND\n\n');

      return reply(`Start ${toRestart.map(a => a.name).join(', ')}. Stop ${toStop.map(a => a.name).join(', ')}`);
    } catch (e) {
      console.log(e);
      return reply('ERROR');
    }
  });
});
