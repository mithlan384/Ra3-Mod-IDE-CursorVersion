//build.js

const { BrowserWindow } = require("electron");
const path = require("path");

function openBuildWindow(parentWindow) {
  if (!parentWindow) return;
  let buildWin = new BrowserWindow({
    width: 520,
    height: 580,
    resizable: false,
    parent: parentWindow,
    modal: true,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "..", "preload", "preload.js") },
  });
  buildWin.loadFile(path.join(__dirname, "..", "renderer", "build-dialog.html"));
  buildWin.on("closed", () => { buildWin = null; });
}

module.exports = { openBuildWindow };