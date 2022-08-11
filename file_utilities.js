const fs = require('fs');

const fileExists = (filePath) => fs.existsSync(filePath);

const getFileContent = (filePath) => {
  if (!fileExists(filePath)) {
    throw new Error(`${filePath}: File not found`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

const getFileJson = (filePath) => JSON.parse(getFileContent(filePath));

const putFileContent = (filePath, content) => {
  fs.writeFileSync(filePath, content);
}

module.exports = {
  fileExists,
  getFileContent,
  getFileJson,
  putFileContent,
};
