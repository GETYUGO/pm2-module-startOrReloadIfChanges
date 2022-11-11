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

const toFilename = (requireEntry) => requireEntry.endsWith('.js') ? requireEntry : requireEntry + '.js';

const parseRequires = (fileContent) => {
  const re = /(?:require\('?"?)(.*?)(?:'?"?\))/gm;
  const requirements = [];
  let matches;

  while ((matches = re.exec(fileContent)) !== null) {
    requirements.push(matches[1]);
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

const getFileAndRequirements = (filePath, nodeModulesPath) => {
  const fileContent = getFileContent(filePath);
  const requirements = parseRequires(fileContent);

  return requirements.reduce(
    (prev, cur) => {
      if (!cur.startsWith('.')) {
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
      const curPath = getFileBasePath(filePath) + toFilename(cur);

      return {
        ...prev,
        ...getFileAndRequirements(curPath, nodeModulesPath),
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

module.exports = {
  fileExists,
  getFileContent,
  getFileJson,
  getFileAndRequirements,
  putFileContent,
};
