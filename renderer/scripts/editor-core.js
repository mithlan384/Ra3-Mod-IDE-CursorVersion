// editor-core.js - Monaco 编辑器初始化及编辑功能
require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });
require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '',
    language: 'plaintext', theme: 'vs-dark', automaticLayout: true,
    bracketPairColorization: { enabled: true }, autoClosingBrackets: 'always', autoClosingQuotes: 'always',
    autoIndent: 'full', formatOnPaste: true, folding: true, foldingStrategy: 'auto', showFoldingControls: 'always',
    matchBrackets: 'always', occurrencesHighlight: true, selectionHighlight: true,
    wordBasedSuggestions: false, renderWhitespace: 'none', wordWrap: 'off'
  });

  editor.onDidChangeCursorPosition(() => { if (!statusUpdateTimer) { statusUpdateTimer = setTimeout(() => { updateStatusBar(); statusUpdateTimer = null; }, 50); } });
  let contentSyncTimer = null;
  let dirtyMarkerTimer = null;

  editor.onDidChangeModelContent(() => {
    if (currentFile && !isLoadingFile && !window.currentPreviewMode) {
      dirtyFiles.set(currentFile, true);
      if (!dirtyMarkerTimer) {
        dirtyMarkerTimer = setTimeout(() => {
          updateFileTreeDirtyMarkerForFile(currentFile);
          dirtyMarkerTimer = null;
        }, 80);
      }
      if (!contentSyncTimer) {
        contentSyncTimer = setTimeout(() => {
          if (currentFile && editor) fileContents.set(currentFile, editor.getValue());
          contentSyncTimer = null;
        }, 350);
      }
      scheduleAutoSaveSession();
      updateStatusBarDebounced();
    }
    if (spellcheckEnabled) { clearTimeout(spellCheckTimer); spellCheckTimer = setTimeout(performSpellCheck, 500); }
  });
  updateStatusBar();
  if (typeof AppTheme !== 'undefined' && AppTheme.onMonacoReady) {
    AppTheme.onMonacoReady();
  }
  if (!currentFile && typeof showEditorWelcome === 'function') {
    showEditorWelcome();
  }

  // XML 自动闭合（修复 getLanguageIdentifier → getLanguageId）
  editor.onDidChangeModelContent((e) => {
    const model = editor.getModel();
    if (!model) return;
    // 修复：使用 getLanguageId() 代替 getLanguageIdentifier().language
    const langId = model.getLanguageId ? model.getLanguageId() : (model.getLanguageIdentifier ? model.getLanguageIdentifier().language : '');
    if (langId !== 'xml') return;
    if (e.changes.length !== 1) return;
    const change = e.changes[0];
    if (change.text === '</') {
      const position = change.range.getEndPosition();
      const scanFromLine = Math.max(1, position.lineNumber - 150);
      const textBefore = model.getValueInRange({
        startLineNumber: scanFromLine,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const openTags = [];
      const regex = /<(\w+)(?:\s[^>]*)?>|<\/(\w+)>/g;
      let match;
      while ((match = regex.exec(textBefore)) !== null) {
        if (match[1] && !match[0].endsWith('/>')) openTags.push(match[1]);
        else if (match[2]) { if (openTags.length > 0 && openTags[openTags.length-1] === match[2]) openTags.pop(); }
      }
      if (openTags.length > 0) {
        const lastTag = openTags[openTags.length-1];
        editor.executeEdits('auto-close', [{ range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: '>' }]);
        setTimeout(() => { const pos = editor.getPosition(); editor.executeEdits('auto-close-end', [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: lastTag + '>' }]); }, 0);
      }
    }
  });

  // XML 补全
  monaco.languages.registerCompletionItemProvider('xml', {
    triggerCharacters: ['<'], provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      return { suggestions: [
        { label: 'Include', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'Include source="${1:file.xml}" />', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '包含其他XML文件', range },
        { label: 'GameObject', kind: monaco.languages.CompletionItemKind.Snippet, insertText: ['<GameObject','  id="${1:UnitName}"','  inheritFrom="${2:ParentUnit}">','  <!-- $0 -->','</GameObject>'].join('\n'), insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '游戏对象模板', range },
        { label: 'Comment', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '<!-- ${1:comment} -->', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'XML注释', range }
      ]};
    }
  });

  // 行操作
  editor.addAction({ id: 'duplicate-line', label: '复制行', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD], run: ed => { const pos = ed.getPosition(); const model = ed.getModel(); const line = model.getLineContent(pos.lineNumber); const rg = new monaco.Range(pos.lineNumber,1,pos.lineNumber,model.getLineMaxColumn(pos.lineNumber)); ed.executeEdits('',[{range:rg, text:line+'\n',forceMoveMarkers:true}]); } });
  editor.addAction({ id: 'delete-line', label: '删除行', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK], run: ed => { const pos = ed.getPosition(); const model = ed.getModel(); const rg = new monaco.Range(pos.lineNumber,1,pos.lineNumber,model.getLineMaxColumn(pos.lineNumber)); ed.executeEdits('',[{range:rg, text:''}]); } });
  editor.addAction({ id: 'move-line-up', label: '上移行', keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow], run: ed => { const pos = ed.getPosition(); if(pos.lineNumber<=1)return; const model = ed.getModel(); const line = model.getLineContent(pos.lineNumber); const rg = new monaco.Range(pos.lineNumber,1,pos.lineNumber+1,1); ed.executeEdits('',[{range:rg, text:''}]); ed.executeEdits('',[{range:new monaco.Range(pos.lineNumber-1,1,pos.lineNumber-1,1),text:line+'\n'}]); ed.setPosition(new monaco.Position(pos.lineNumber-1, model.getLineMaxColumn(pos.lineNumber-1))); } });
  editor.addAction({ id: 'move-line-down', label: '下移行', keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow], run: ed => { const pos = ed.getPosition(); const model = ed.getModel(); if(pos.lineNumber>=model.getLineCount())return; const line = model.getLineContent(pos.lineNumber); const rg = new monaco.Range(pos.lineNumber,1,pos.lineNumber+1,1); ed.executeEdits('',[{range:rg, text:''}]); ed.executeEdits('',[{range:new monaco.Range(pos.lineNumber+1,1,pos.lineNumber+1,1),text:line+'\n'}]); ed.setPosition(new monaco.Position(pos.lineNumber+1, model.getLineMaxColumn(pos.lineNumber+1))); } });
  editor.addAction({ id: 'custom.duplicate-line', label: '复制行', contextMenuGroupId:'custom', contextMenuOrder:2, run:ed=>ed.getAction('duplicate-line').run() });
  editor.addAction({ id: 'custom.delete-line', label: '删除行', contextMenuGroupId:'custom', contextMenuOrder:3, run:ed=>ed.getAction('delete-line').run() });
  editor.addAction({ id: 'custom.move-line-up', label: '上移行', contextMenuGroupId:'custom', contextMenuOrder:4, run:ed=>ed.getAction('move-line-up').run() });
  editor.addAction({ id: 'custom.move-line-down', label: '下移行', contextMenuGroupId:'custom', contextMenuOrder:5, run:ed=>ed.getAction('move-line-down').run() });
  editor.addAction({ id: 'toggle-comment', label: '注释切换', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyQ], run: (ed) => { const sel = ed.getSelection(); if (sel.isEmpty()) { const line = ed.getPosition().lineNumber; const model = ed.getModel(); const lc = model.getLineContent(line); if (lc.trim().startsWith('<!--') && lc.trim().endsWith('-->')) { ed.executeEdits('', [{ range: new monaco.Range(line, lc.indexOf('<!--')+1, line, lc.lastIndexOf('-->')+3), text: '' }]); } else { ed.executeEdits('', [{ range: new monaco.Range(line, 1, line, lc.length+1), text: `<!-- ${lc} -->` }]); } } else { const model = ed.getModel(); const t = model.getValueInRange(sel); if (t.startsWith('<!--') && t.endsWith('-->')) { ed.executeEdits('', [{ range: sel, text: t.substring(4, t.length-3) }]); } else { ed.executeEdits('', [{ range: sel, text: `<!-- ${t} -->` }]); } } } });
  editor.addAction({ id: 'goto-line', label: '转到行...', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG], run: (ed) => { const line = prompt('请输入行号 (1 - ' + ed.getModel().getLineCount() + ')'); if (line) { const ln = parseInt(line); if (!isNaN(ln) && ln > 0 && ln <= ed.getModel().getLineCount()) { ed.revealLineInCenter(ln); ed.setPosition({ lineNumber: ln, column: 1 }); } } } });
  editor.addAction({ id: 'toggle-bookmark', label: '切换书签', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F2], run: () => { toggleBookmark(); } });
  editor.addAction({ id: 'next-bookmark', label: '下一个书签', keybindings: [monaco.KeyCode.F2], run: () => { gotoNextBookmark(); } });

  setTimeout(async () => {
    if (window.api) {
      if (typeof AppTheme !== 'undefined') await AppTheme.initAppThemeFromPreferences();
      const prefs = await window.api.getPreferences();
      if (typeof setupAutoSave === 'function' && typeof prefs.autoSaveInterval === 'number') setupAutoSave(prefs.autoSaveInterval);
      if (prefs.spellcheckEnabled && typeof performSpellCheck === 'function') { spellcheckEnabled = true; performSpellCheck(); }
    }
  }, 200);
});

// ... 原有 editor-core.js 代码 ...

// 追加函数：热更新指定文件的编辑器内容
window.reloadFileInEditor = async function(filePath) {
  if (!editor) return;
  try {
    const content = await window.api.readFile(filePath);
    if (content == null) return;
    if (editor.getModel()) {
      editor.setValue(content);
    }
  } catch (e) {
    console.error('reloadFileInEditor error:', e);
  }
};