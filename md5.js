const md5 = require('md5');
const { getFileAndRequirements } = require('./file_utilities');

const getCurrentMd5 = (basePath, apps) => apps.reduce((prev, app) => ({
  ...prev,
  [app.name]: md5(JSON.stringify(getFileAndRequirements(
    `${basePath}/${app.script}`,
    `${basePath}/node_modules/`,
  ), undefined, 0)),
}), {});

module.exports = {
  getCurrentMd5,
};
