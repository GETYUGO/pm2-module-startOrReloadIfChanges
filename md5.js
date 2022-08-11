const md5 = require('md5');
const { getFileContent } = require('./file_utilities');

const getCurrentMd5 = (basePath, apps) => apps.reduce((prev, app) => ({
  ...prev,
  [app.name]: md5(getFileContent(`${basePath}/${app.script}`)),
}), {});

module.exports = {
  getCurrentMd5,
};
