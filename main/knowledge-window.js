// main/knowledge-window.js
const { BrowserWindow } = require("electron");
const path = require("path");

function openKnowledgeWindow(parentWindow) {
  if (!parentWindow) return;
  let knowledgeWin = new BrowserWindow({
    width: 700,
    height: 550,
    resizable: true,
    parent: parentWindow,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  knowledgeWin.loadFile(
    path.join(__dirname, "..", "renderer", "knowledge-panel.html")
  );
  knowledgeWin.on("closed", () => {
    knowledgeWin = null;
  });
}

module.exports = { openKnowledgeWindow };