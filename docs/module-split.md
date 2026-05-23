# 大文件拆分说明

为降低维护成本，以下模块已从单文件拆分为目录结构（2026-05）。

## `main/agent-ipc/`（原 `agent-ipc.js` ~1700 行）

| 文件 | 职责 |
|------|------|
| `context.js` | 共享状态、路由门闩、消息通道辅助函数 |
| `chat-handler.js` | `agent:chat` 主流程（意图路由、工具循环） |
| `register.js` | IPC 注册入口、会话/扫描、回调绑定 |
| `misc-handlers.js` | 确认条、素材向导、工具直调 |
| `knowledge-skills.js` | 知识库与 Skill 安装 IPC |

入口：`main/agent-ipc.js` → `require('./agent-ipc/register')`

## `renderer/scripts/agent-ui/`（原 `agent-ui.js` ~2200 行）

| 文件 | 职责 |
|------|------|
| `01-state.js` | 全局状态变量 |
| `02-panel.js` | 面板开关、发送消息、会话、消息渲染核心 |
| `03-messages.js` | 深度思考/搜索开关 |
| `04-bars.js` | 确认条、格式选择、素材向导、IPC 回调 |
| `05-stream.js` | 流式写入、打开文件、`getIdeState` |
| `06-init.js` | `DOMContentLoaded` 初始化 |

`index.html` 按上述顺序加载；勿打乱顺序。

## 尚未拆分（后续可做）

- `ipc-handlers.js` — 建议按「项目 / 文件 / 首选项 / 编译」四块拆
- `insurrection-migrate.js`、`agent-tools.js`、`agent-planner.js`

重新拆分可运行：`node scripts/split-large-modules.js`（需人工检查生成结果）。
