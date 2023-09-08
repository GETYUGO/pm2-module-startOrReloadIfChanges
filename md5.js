const md5 = require('md5');
const { getFileAndRequirements } = require('./file_utilities');

const toMinimalJSON = (data) => JSON.stringify(data, undefined, 0);

const getCurrentMd5 = (basePath, apps, requireBlacklist) => apps.reduce((prev, app) => ({
  ...prev,
  [app.name]: md5(toMinimalJSON(getFileAndRequirements(
    `${basePath}/${app.script}`,
    `${basePath}/node_modules/`,
    requireBlacklist
  ))),
}), {});

const toMd5 = md5;

module.exports = {
  getCurrentMd5,
  toMd5,
};
