// renderer/scripts/agent-ui/06-init.js
document.addEventListener('DOMContentLoaded', () => {
  if (typeof UserAvatar !== 'undefined') {
    UserAvatar.refreshUserAvatarCache().then(() => UserAvatar.refreshAllUserMessageAvatars());
    UserAvatar.bindUserAvatarListeners();
  }
  const input = document.getElementById('ai-panel-input');
  if (input) {
    // Enter 发送，Shift+Enter 换行
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage();
      }
    });
    // 自动调整高度
    input.addEventListener('input', () => autoResizeTextarea(input));
  }
  initDeepThinkingToggle();
  initSearchToggle();
});
