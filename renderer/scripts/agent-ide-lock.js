// renderer/scripts/agent-ide-lock.js —— AI 写入时锁定文件树、标签页与编辑器

let agentIdeLockDepth = 0;
let agentUiDrivingDepth = 0;
let savedEditorReadOnly = null;
let savedSplitReadOnly = null;

function isAgentIdeLocked() {
  return agentIdeLockDepth > 0;
}

function isAgentUiDriving() {
  return agentUiDrivingDepth > 0;
}

function withAgentUiDriving(fn) {
  agentUiDrivingDepth += 1;
  const release = () => {
    agentUiDrivingDepth = Math.max(0, agentUiDrivingDepth - 1);
  };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      return out.finally(release);
    }
    release();
    return out;
  } catch (e) {
    release();
    throw e;
  }
}

function setMonacoReadOnly(locked) {
  if (typeof editor !== 'undefined' && editor) {
    if (locked) {
      if (savedEditorReadOnly === null) {
        savedEditorReadOnly = !!editor.getOption(monaco.editor.EditorOption.readOnly);
      }
      editor.updateOptions({ readOnly: true });
    } else if (savedEditorReadOnly !== null) {
      editor.updateOptions({ readOnly: savedEditorReadOnly });
      savedEditorReadOnly = null;
    }
  }
  if (typeof splitEditor !== 'undefined' && splitEditor) {
    if (locked) {
      if (savedSplitReadOnly === null) {
        const ed = splitEditor.getOriginalEditor
          ? splitEditor.getOriginalEditor()
          : splitEditor;
        savedSplitReadOnly = ed ? !!ed.getOption(monaco.editor.EditorOption.readOnly) : false;
      }
      if (splitEditor.getOriginalEditor) {
        splitEditor.getOriginalEditor().updateOptions({ readOnly: true });
        splitEditor.getModifiedEditor().updateOptions({ readOnly: true });
      } else {
        splitEditor.updateOptions({ readOnly: true });
      }
    } else if (savedSplitReadOnly !== null) {
      if (splitEditor.getOriginalEditor) {
        splitEditor.getOriginalEditor().updateOptions({ readOnly: savedSplitReadOnly });
        splitEditor.getModifiedEditor().updateOptions({ readOnly: savedSplitReadOnly });
      } else {
        splitEditor.updateOptions({ readOnly: savedSplitReadOnly });
      }
      savedSplitReadOnly = null;
    }
  }
}

function applyAgentIdeLockUI(reason) {
  document.documentElement.setAttribute('data-agent-ide-lock', 'on');
  const banner = document.getElementById('agent-ide-lock-banner');
  if (banner) {
    banner.classList.remove('hidden');
    const label = banner.querySelector('.agent-ide-lock-text');
    if (label) {
      label.textContent = reason || 'AI 正在写入文件，请稍候…';
    }
  }
  setMonacoReadOnly(true);
}

function removeAgentIdeLockUI() {
  if (agentIdeLockDepth > 0) return;
  document.documentElement.removeAttribute('data-agent-ide-lock');
  const banner = document.getElementById('agent-ide-lock-banner');
  if (banner) banner.classList.add('hidden');
  setMonacoReadOnly(false);
}

function acquireAgentIdeLock(reason) {
  agentIdeLockDepth += 1;
  if (agentIdeLockDepth === 1) applyAgentIdeLockUI(reason);
}

function releaseAgentIdeLock() {
  agentIdeLockDepth = Math.max(0, agentIdeLockDepth - 1);
  if (agentIdeLockDepth === 0) removeAgentIdeLockUI();
}

function handleAgentIdeLockEvent(data) {
  if (!data) return;
  if (data.locked) {
    acquireAgentIdeLock(data.reason || 'AI 正在写入文件，请稍候…');
  } else {
    releaseAgentIdeLock();
  }
}

window.isAgentIdeLocked = isAgentIdeLocked;
window.isAgentStreamWriting = isAgentIdeLocked;
window.isAgentUiDriving = isAgentUiDriving;
window.withAgentUiDriving = withAgentUiDriving;
window.acquireAgentIdeLock = acquireAgentIdeLock;
window.releaseAgentIdeLock = releaseAgentIdeLock;
window.handleAgentIdeLockEvent = handleAgentIdeLockEvent;
