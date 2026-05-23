// main/project-state.js
// 项目路径状态管理（独立模块，避免循环依赖）
let currentFolder = "";
let projectConventions = null;

function setCurrentFolder(newPath) {
  currentFolder = newPath.replace(/\\/g, '/');
  projectConventions = null;
}

function getCurrentFolder() {
  return currentFolder;
}

function setProjectConventions(conventions) {
  projectConventions = conventions || null;
}

function getProjectConventions() {
  return projectConventions;
}

module.exports = {
  setCurrentFolder,
  getCurrentFolder,
  setProjectConventions,
  getProjectConventions,
};