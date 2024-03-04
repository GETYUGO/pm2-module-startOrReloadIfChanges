const fs = require('fs');
const uglify = require('uglify-js');

const getFileName = (filePath) => {
  const lastIndex = filePath.lastIndexOf('/');

  return filePath.slice(lastIndex - filePath.length + 1);
}

const getFileBasePath = (filePath) => {
  const lastIndex = filePath.lastIndexOf('/');

  return filePath.slice(0, lastIndex + 1);
}

const toFilename = (requireEntry) => requireEntry.endsWith('.js') || requireEntry.endsWith('.json') ? requireEntry : requireEntry + '.js';

const parseRequires = (fileContent, blacklist) => {
  const re = /(?:require\(['"])(.*?)(?:['"]\))/gm;
  const requirements = [];
  let matches;

  console.log('blacklist:', blacklist);

  while ((matches = re.exec(fileContent)) !== null) {
    console.log(matches[1]);
    const blacklisted = blacklist.reduce((prev, cur) => (
      prev || cur.startsWith('@') ? matches[1].startsWith(cur) : matches[1].endsWith(cur)
    ), false);
    blacklisted || requirements.push(matches[1]);
  }
  return requirements;
}

const fileExists = (filePath) => fs.existsSync(filePath);

const getFileContent = (filePath) => {
  if (!fileExists(filePath)) {
    throw new Error(`${filePath}: File not found`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

const getFileJson = (filePath) => JSON.parse(getFileContent(filePath));

const getModulePackageVersion = (nodeModulesPath, moduleName) => {
  const modulePath = nodeModulesPath + moduleName + '/';
  const packageContent = getFileContent(modulePath + 'package.json');

  return JSON.parse(packageContent).version;
}

const getModuleMainPath = (nodeModulesPath, moduleName) => {
  const modulePath = nodeModulesPath + moduleName + '/';
  const packageContent = getFileContent(modulePath + 'package.json');

  return modulePath + JSON.parse(packageContent).main;
};

const getFileAndRequirements = (filePath, nodeModulesPath, requireBlacklist, depth = 0) => {
  const fileContent = getFileContent(filePath);

  if (depth > 10) { // prevent infinite loop
    console.error('TOO MUCH DEPTH:', filePath);
    return {
      [getFileName(filePath)]: uglify.minify(fileContent).code,
    }
  }
  const requirements = parseRequires(fileContent, requireBlacklist);

  return requirements.reduce(
    (prev, cur) => {
      let curPath;
      if (cur.startsWith('.')) {
        curPath = getFileBasePath(filePath) + toFilename(cur);
      } else if (cur.startsWith('@yegows/')) {
        curPath = getModuleMainPath(nodeModulesPath, cur);
      } else {
        try {
          const packageVersion = getModulePackageVersion(nodeModulesPath, cur);

          return {
            ...prev,
            [cur]: packageVersion,
          }
        } catch (e) {
          return prev;
        }
      }

      return {
        ...prev,
        ...getFileAndRequirements(curPath, nodeModulesPath, requireBlacklist, depth + 1),
      }

    },
    {
      [getFileName(filePath)]: uglify.minify(fileContent).code,
    },
  );
}

const putFileContent = (filePath, content) => {
  fs.writeFileSync(filePath, content);
}

const makeFolder = (folderPath) => {
  fs.mkdirSync(folderPath)
}

module.exports = {
  fileExists,
  getFileContent,
  getFileJson,
  getFileAndRequirements,
  putFileContent,
  makeFolder,
};
