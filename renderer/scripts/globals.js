// globals.js - 全局状态变量
let editor = null;
let currentFile = null;

const dirtyFiles = new Map();        // filePath -> boolean
const fileContents = new Map();      // filePath -> 最新内容
let openFiles = [];                  // 标签顺序
let isLoadingFile = false;

let autoSaveTimer = null;
let isExiting = false;
let clickTimer = null;

let spellcheckEnabled = false;
let autoSaveInterval = null;
let autoSaveIntervalSeconds = 0;

let dragSrcPath = null, dragIndicator = null, lastTarget = null;
let statusUpdateTimer = null;

let contextMenuTargetPath = null;
let currentRootFolder = '';

let spellCheckTimer = null;
let spellDecorations = [];

// 分屏相关
let splitEditor = null;
let splitCurrentFile = null;
let isSplitVisible = false;

// 书签相关
let bookmarks = new Map();       // filePath -> Set<lineNumber>
let bookmarkDecorations = [];

window.normalizePath = function(filePath) {
  if (!filePath) return '';
  let normalized = filePath.replace(/\\/g, '/');
  if (typeof currentRootFolder !== 'undefined' && currentRootFolder) {
    const root = currentRootFolder.replace(/\\/g, '/');
    if (normalized.toLowerCase().startsWith(root.toLowerCase())) {
      const relative = normalized.substring(root.length).replace(/^\//, '');
      normalized = root + '/' + relative;
    }
  }
  return normalized;
};