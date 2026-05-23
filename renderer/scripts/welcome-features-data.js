// renderer/scripts/welcome-features-data.js —— 欢迎页功能一览与详情文案

/** @type {{ id: string, icon: string, title: string, summary: string, detailHtml: string }[]} */
const WELCOME_FEATURES = [
  {
    id: 'project',
    icon: '📁',
    title: '项目管理',
    summary: '打开/切换 MOD 根目录；最近项目；按项目保存标签与 AI 会话；路径沙箱；文件菜单备份恢复。',
    detailHtml: `
<h2>项目管理</h2>
<p>RA3 MOD IDE 以<strong>单个 MOD 文件夹</strong>为工作区。文件树、编辑器、属性面板、AI 助手、编译与备份均限定在该根目录内，避免误改其他 MOD 或系统目录。</p>

<h3>如何打开项目</h3>
<ul>
  <li>菜单 <strong>文件 → 打开项目</strong>，或启动时的<strong>项目管理器</strong>（见「项目管理器」卡片）。</li>
  <li>在列表中选择<strong>最近打开</strong>的工程，或「浏览文件夹」选中 MOD 根目录（常见路径：<code>RA3 MODSDK-X\\Mods\\你的MOD名</code>）。</li>
  <li>打开后：左侧文件树标题显示项目名；欢迎页显示「当前项目」徽章；状态栏与 AI 会话切换到该项目上下文。</li>
</ul>

<h3>项目内应包含什么</h3>
<p>典型 RA3 MOD 根目录包括：</p>
<ul>
  <li><code>Mod.xml</code> —— 总入口，通过 <code>&lt;Include&gt;</code> 聚合单位、武器、LogicCommand 等 XML。</li>
  <li><code>data/</code> —— GameObject、Weapon、PlayerTemplate 等数据；标准格式下常按阵营分子目录。</li>
  <li><code>mod.babproj</code>（部分模板）—— SDK 工程描述，<kbd>Ctrl+B</kbd> 编译时使用。</li>
  <li>可选：<code>Art/</code>、<code>Audio/</code>、<code>gamestrings*.csf</code>、<code>movies/</code> 等资源与本地化。</li>
</ul>

<h3>会话与记忆</h3>
<ul>
  <li><strong>编辑器标签页</strong>：同一项目再次打开时，可恢复上次打开的文件列表（需首选项「记住设置」）。</li>
  <li><strong>会话自动保存</strong>：仅在有未保存改动时、约 2 秒防抖后写入磁盘索引，减轻大项目卡顿。</li>
  <li><strong>AI 多会话 Tab</strong>：每个项目独立存储多个对话；切换项目即切换会话，互不覆盖。</li>
  <li><strong>项目扫描缓存</strong>：AI「扫描项目」后记住目录结构、Include 关系、<code>compileHealth</code> 摘要与 XML 写入格式偏好。</li>
</ul>

<h3>路径安全（沙箱）</h3>
<ul>
  <li>读文件、保存、AI 工具写入、备份恢复目标均经主进程校验：路径必须落在<strong>当前项目根目录</strong>内。</li>
  <li>越界路径（如其它 MOD、<code>..</code> 跳出根目录）会被拒绝；编辑器读文件返回空并提示，防止改错工程。</li>
  <li>切换项目后，旧项目里仍打开的标签若路径越界，保存/读取同样会被拦截。</li>
</ul>

<h3>备份与恢复（菜单）</h3>
<ul>
  <li><strong>文件 → 从备份恢复（最近）</strong>：一键还原<strong>时间戳最新</strong>的一份完整 MOD 副本到当前项目路径（覆盖前请确认）。</li>
  <li><strong>文件 → 从备份恢复…</strong>：从备份目录挑选指定时间戳文件夹恢复。</li>
  <li>定时自动备份在<strong>首选项 → 自动保存 → 项目自动备份</strong>配置（详见「项目备份」卡片）。</li>
</ul>

<h3>与 AI 的配合</h3>
<p>建议打开新项目后先让 AI「扫描当前项目全部文件，理解项目结构和 XML 引用规范」，再创建单位或批量改 XML。扫描结果会写入 Agent 上下文，减少 Include 路径与 ID 冲突。</p>
`,
  },
  {
    id: 'project-manager',
    icon: '🏠',
    title: '项目管理器',
    summary: '启动/切换 MOD；圆形 Logo；MOD 开发要点列表；每次打开随机军事名言。',
    detailHtml: `
<h2>项目管理器</h2>
<p>首次启动或未打开项目时显示的<strong>独立欢迎窗口</strong>，用于选择最近 MOD、浏览新文件夹，并快速了解 IDE 能做什么。</p>

<h3>界面组成</h3>
<ul>
  <li><strong>左侧</strong>：最近项目列表（名称、路径、上次打开时间）；「打开文件夹」创建或选中 MOD 根目录。</li>
  <li><strong>中央</strong>：RA3 MOD 开发能力摘要（GameObject / Mod.xml / CSF / SDK 编译 / 遭遇战 AI 等要点列表，替代旧版阵营肖像卡片）。</li>
  <li><strong>顶部 Logo</strong>：从项目或内置 <code>Art/Logo1.png</code> 加载，<strong>圆形裁切</strong>显示 MOD 图标（经 <code>getArtFileUrl</code> 安全解析 Art 路径）。</li>
  <li><strong>名言区</strong>：每次打开窗口从大型语录池<strong>随机一条</strong>（中国古典兵家语录 + 西方/苏联/日本战略名言 + MOD 制作小贴士），增添氛围。</li>
</ul>

<h3>操作流程</h3>
<ol>
  <li>在列表中双击或选中后点「打开」进入主 IDE。</li>
  <li>若无最近项，点「浏览」选中含 <code>Mod.xml</code> 的文件夹。</li>
  <li>打开后主窗口加载文件树；若曾从简介页离开，可用「← 返回继续编辑」回到上次标签。</li>
</ol>

<h3>与主 IDE 的关系</h3>
<p>项目管理器只负责<strong>选目录</strong>，不替代编辑器。配置 SDK、AI Key、主题等仍在主窗口「设置 → 首选项」。Logo 加载失败时会尝试备用 Art 路径，不影响打开项目。</p>
`,
  },
  {
    id: 'file-tree',
    icon: '🌲',
    title: '文件树与搜索',
    summary: '异步索引；≥2 字模糊搜 12 条；面板 × 关闭；右键新建/对比/外部工具；脏标记标签。',
    detailHtml: `
<h2>文件树与快速搜索</h2>
<p>左侧<strong>文件</strong>面板是日常导航核心。大型 MOD 采用<strong>异步文件索引</strong>，避免每次刷新都全量扫描磁盘导致界面卡顿。</p>

<h3>浏览与打开</h3>
<ul>
  <li>单击 <code>.xml</code>：中央 Monaco 编辑区打开，并加入顶部标签栏。</li>
  <li>单击 <code>.tga</code>、<code>.dds</code>、<code>.w3x</code>、<code>.csf</code>：进入<strong>资源预览</strong>（CSF 为专用表格编辑器）。</li>
  <li>文件夹展开/折叠；首次打开大项目时索引在后台构建，搜索框稍后即可用。</li>
  <li>欢迎简介页：关闭所有编辑标签且未开预览时自动显示；菜单 <strong>帮助 → 关于 RA3 IDE</strong> 可随时返回，并保留「返回继续编辑」。</li>
</ul>

<h3>文件名搜索</h3>
<ul>
  <li>文件面板标题右侧搜索框：输入<strong>至少 2 个字符</strong>触发（避免一次列出数千文件）。</li>
  <li><strong>模糊匹配</strong>文件名，最多 <strong>12 条</strong>；点击即打开；下拉可横向滚动长路径。</li>
  <li>输入变化时实时更新列表；清空或失焦收起。索引基于当前项目根，与 AI grep 工具共用同一文件列表缓存。</li>
</ul>

<h3>面板关闭与恢复</h3>
<ul>
  <li>文件树标题栏右侧 <kbd>×</kbd>：<strong>关闭整个左侧文件面板</strong>（非仅关闭搜索下拉）。</li>
  <li>菜单 <strong>窗口</strong> 可重新显示文件树、属性、输出面板；与 <code>panel-layout.js</code> 状态同步。</li>
  <li>AI 写入文件时文件树会被<strong>锁定</strong>（见「安全与写入锁定」），防止写入过程中误切换文件。</li>
</ul>

<h3>右键菜单（常用）</h3>
<ul>
  <li><strong>新建文件 / 新建文件夹</strong>：在选中目录下创建。</li>
  <li><strong>复制路径、在资源管理器中显示</strong>：与 Windows 资源管理器协作。</li>
  <li><strong>与当前文件对比</strong>：对已打开的 XML，与树中另一文件开 Monaco Diff（见「分屏与对比」）。</li>
  <li><strong>在新视图中打开</strong>：右侧分屏第二份可编辑副本。</li>
  <li><strong>用外部工具打开</strong>：W3X 查看器、CSF 编辑器等（首选项 SDK 工具路径）。</li>
  <li><strong>删除</strong>：请谨慎；AI 删除在 T1 下通常需确认，T3 可自动执行。</li>
</ul>

<h3>标签页</h3>
<ul>
  <li>多文件并行；未保存 tab 有<strong>脏标记</strong>。</li>
  <li>标签右键：关闭、关闭其他、关闭右侧等。</li>
  <li>编辑器对打开文件采用<strong>懒加载内容</strong>与单节点脏标记，减少大文件与多标签时的内存与重绘开销。</li>
</ul>

<h3>布局</h3>
<p>文件树与编辑区之间竖条可拖拽宽度；竖条 <kbd>◀</kbd> 可收起整个侧栏以扩大编辑区。</p>
`,
  },
  {
    id: 'xml-editor',
    icon: '📝',
    title: 'XML 编辑器',
    summary: 'Monaco 高亮/折叠/查找；自动与手动保存；标准或项目 XML 格式；拼写检查；AI 流式写入预览。',
    detailHtml: `
<h2>XML 编辑器</h2>
<p>中央编辑区基于 <strong>Monaco Editor</strong>（VS Code 同源），针对 RA3 的 SAGE XML 做了主题、折叠与协作写入优化。</p>

<h3>编辑能力</h3>
<ul>
  <li><strong>语法高亮</strong>：标签、属性、注释分层着色（随 Dark/Light/阵营主题变化）。</li>
  <li><strong>代码折叠</strong>：收起 <code>&lt;GameObject&gt;</code>、<code>&lt;WeaponTemplate&gt;</code> 等大段节点。</li>
  <li><strong>括号匹配与自动缩进</strong>：维护深层嵌套时可读性更好。</li>
  <li><strong>撤销 / 重做</strong>：<kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd>。</li>
  <li><strong>查找与替换</strong>：<kbd>Ctrl+F</kbd>、<kbd>Ctrl+H</kbd>；<strong>跳转到行</strong> <kbd>Ctrl+G</kbd>。</li>
  <li><strong>自动换行</strong>：菜单可切换；状态栏显示当前状态。</li>
</ul>

<h3>保存</h3>
<ul>
  <li><kbd>Ctrl+S</kbd> 保存当前；<kbd>Ctrl+Shift+S</kbd> 保存所有已修改的打开文件。</li>
  <li>首选项<strong>编辑器自动保存</strong>（分钟，0=关）：仅写回<strong>已打开且脏</strong>的文件，不是整包备份。</li>
  <li>保存路径若不在当前项目根内会被主进程拒绝。</li>
</ul>

<h3>XML 写入格式（与 AI 联动）</h3>
<p>首选项 → <strong>AI 设置 → XML 写入格式</strong>：</p>
<ul>
  <li><strong>标准 MOD 格式（SDK / Insurrection 目录规范，推荐）</strong>：单位按阵营分子目录；<code>Mod.xml</code> 使用 type=reference/all/instance；AI「新建单位」走 <code>create-unit-pipeline</code>，自动维护 Include 与 unitId 命名。</li>
  <li><strong>当前项目已有结构</strong>：AI 模仿您 MOD 已有目录；首次需「扫描并学习」项目结构。</li>
</ul>
<p>AI 面板标题旁徽章显示当前模式（如「写入：标准 MOD 格式」）。</p>

<h3>AI 流式写入</h3>
<ul>
  <li>创建或大块改写 XML 时，编辑器可<strong>实时显示生成内容</strong>；完成后刷新文件树与属性摘要。</li>
  <li>写入期间界面进入<strong>IDE 锁定</strong>（文件树/标签/编辑区不可点，AI 面板仍可用），顶部横幅提示「AI 正在写入文件」。</li>
</ul>

<h3>拼写检查</h3>
<p>菜单可开关 XML 英文拼写检查；对中文注释无影响。</p>

<h3>适用文件</h3>
<p><code>data/**/*.xml</code>、<code>Mod.xml</code>、GlobalData、PlayerTemplate 等文本 XML。二进制资源请用预览或外部工具。</p>
`,
  },
  {
    id: 'ai-assistant',
    icon: '🤖',
    title: 'AI 助手',
    summary: '多会话；扫项目/建单位/修 BAE；T1–T3 权限；tool_plan 先读后写；联网+知识库；写入时 IDE 锁定。',
    detailHtml: `
<h2>AI 助手</h2>
<p>状态栏 <kbd>AI</kbd> 打开右侧对话面板。助手理解 GameObject、WeaponSet、LogicCommand、OCL、KindOf 等术语，并通过<strong>主进程工具</strong>读写项目（带权限与路径沙箱）。</p>

<h3>多会话 Tab</h3>
<ul>
  <li>每项目多个会话 Tab（如「新单位」「修编译」），各自保留上下文与标题。</li>
  <li>「清空当前会话」只清聊天记录，不删磁盘 XML。</li>
  <li>会话数据按项目路径存储，换项目即换会话集。</li>
</ul>

<h3>常用指令示例</h3>
<ul>
  <li>「扫描当前项目全部文件，理解项目结构和 XML 引用规范」</li>
  <li>「列出项目中所有单位 ID」</li>
  <li>「新建苏联重型坦克，血量 5000，造价 2000，用标准 MOD 格式」</li>
  <li>「把 XXX 的移动速度改成 50」</li>
  <li>「根据输出面板最新 BAE 错误修复」</li>
  <li>「评估本项目是否符合标准 MOD 目录规范」</li>
</ul>

<h3>Agent 工具能力</h3>
<ul>
  <li><strong>只读</strong>：读文件、grep、列单位、继承链、compileHealth、查 knowledge-docs、联网搜索。</li>
  <li><strong>写入</strong>：创建单位/建筑、改属性、Weapon、修 Mod.xml Include、目录迁移、按 BAE 改 XML。</li>
  <li><strong>tool_plan</strong>：复杂任务可先自动读/扫（T1 下<strong>不弹确认</strong>），真正写入前再逐次确认方案。</li>
  <li><strong>流式写入</strong>：大段 XML 生成时编辑器实时更新，见「XML 编辑器」。</li>
</ul>

<h3>权限等级（首选项 → AI 设置）</h3>
<ul>
  <li><strong>T1 · 读取自动（默认推荐）</strong>：所有<strong>只读</strong>工具（含 <code>tool_plan</code> 中的读/扫阶段）<strong>无需逐次确认</strong>；任何写入、删除、迁移、整包改结构前弹出方案确认。</li>
  <li><strong>T2 · 部分自主</strong>：可自动改 XML；<strong>删除、移动、迁移</strong>等破坏性操作仍要确认。</li>
  <li><strong>T3 · 完全自主</strong>：自动执行读写，结束后汇报修改文件列表；适合熟练用户，请自行做好备份。</li>
</ul>
<p>工具调用经 <code>agent:tool-call</code> IPC 在主进程执行，并校验项目路径与权限位。</p>

<h3>写入时 IDE 锁定</h3>
<ul>
  <li>AI 通过 <code>stream-write</code> 等写入时，<code>agent-ide-lock</code> 锁定左侧文件树、标签栏与编辑区，避免中途改错文件。</li>
  <li><strong>AI 面板、输出面板、编译按钮区域</strong>仍可使用；锁定结束自动解除。</li>
  <li>顶栏显示「AI 正在写入文件，请稍候…」动画提示。</li>
</ul>

<h3>联网与知识库</h3>
<ul>
  <li>输入框可勾选「联网搜索」；「强制搜索」仅查资料不写文件。</li>
  <li>搜索源：自动（DuckDuckGo / 公共 SearXNG + 内置文档）、仅离线、Google CSE、自建 SearXNG。</li>
  <li>离线时优先 <strong>关键词 + 向量混合检索</strong> <code>knowledge-docs/</code>，降低幻觉。</li>
  <li>API Key 存用户目录，支持<strong>加密存储</strong>（<code>enc:</code> 前缀），界面不回显明文。</li>
</ul>

<h3>配置与个性化</h3>
<ul>
  <li>须配置 API 地址、Key、模型；未配置时无法调用大模型，仍可手动编辑 XML。</li>
  <li>可选盟军/苏联/帝国情报官语气；可上传<strong>用户头像</strong>（圆形裁剪，显示在您消息旁）。</li>
</ul>
`,
  },
  {
    id: 'knowledge',
    icon: '📚',
    title: '内置知识库',
    summary: '30+ 专题教程；独立阅读窗口；向量+关键词混合检索；AI 与「仅离线」模式共用。',
    detailHtml: `
<h2>内置知识库</h2>
<p>IDE 自带 <code>knowledge-docs/</code> Markdown 教程库，启动时编入检索索引，供人工阅读与 Agent 自动引用。</p>

<h3>如何打开</h3>
<ul>
  <li>AI 面板工具栏 <strong>📚 知识库</strong> → 独立窗口浏览、全文搜索标题与正文。</li>
  <li>Agent 回答技术问题时自动检索相关章节，并尽量使用准确 XML 标签名。</li>
</ul>

<h3>文档分类（完整列表见 README）</h3>
<ul>
  <li><strong>标准 MOD 格式</strong>：Insurrection 目录、Mod.xml Include、单位分包、迁移注意。</li>
  <li><strong>入门与流程</strong>：<code>mod-development-workflow.md</code> 五阶段总览。</li>
  <li><strong>GameObject</strong>：核心参考、MyTank 模板、属性词典、KindOf、护甲、Locomotor、Behaviors。</li>
  <li><strong>武器</strong>：WeaponTemplate、Nuggets、WeaponSetUpdate、高级模板。</li>
  <li><strong>LogicCommand / SpecialPower</strong>：命令集、技能按钮、注册表。</li>
  <li><strong>阵营与玩家</strong>：faction 蓝本、子阵营 PlayerTemplate、科技树与升级。</li>
  <li><strong>遭遇战 AI</strong>：GlobalData、战略状态、Skirmish AI。</li>
  <li><strong>OCL 与特效</strong>：动态单位、守护单位、粒子实用指南。</li>
  <li><strong>模型与 UI</strong>：W3X 制作、建造栏 TGA、肖像、experience/维修机。</li>
  <li><strong>建筑、音频视频、机密协议</strong>等专题文档。</li>
  <li><strong>社区资料整合</strong>：<code>ziliao-integration-notes.md</code> 记录 PDF 抽取与去重来源。</li>
</ul>

<h3>检索技术</h3>
<ul>
  <li>本地 <strong>all-MiniLM-L6-v2</strong> embedding + 关键词打分混合排序。</li>
  <li>AI「仅离线」模式只查内置库，适合无网或保密环境。</li>
  <li>可自行添加 <code>.md</code> 到 <code>knowledge-docs/</code> 后重启 IDE 重建索引。</li>
</ul>
`,
  },
  {
    id: 'build',
    icon: '🔨',
    title: '编译与输出',
    summary: 'Ctrl+B 调 SDK；输出分编译/警告/错误 Tab；compileHealth；AI 按 BAE 日志改 XML。',
    detailHtml: `
<h2>SDK 编译与输出面板</h2>

<h3>编译项目</h3>
<ul>
  <li><strong>编译 → 编译项目</strong> 或 <kbd>Ctrl+B</kbd>。</li>
  <li>调用首选项配置的 <strong>RA3 MOD SDK</strong>（含 <code>EALAModStudio.exe</code>、<code>tools/binaryassetbuilder.exe</code>）。</li>
  <li>编译针对<strong>当前打开的 MOD 根目录</strong>；请确认已保存关键 XML 再编译。</li>
</ul>

<h3>输出面板</h3>
<ul>
  <li>底部<strong>输出</strong>区，Tab：<strong>编译</strong> / <strong>警告</strong> / <strong>错误</strong>。</li>
  <li>拖拽上边缘调高度；「清空」只清显示缓冲。标题栏 <kbd>×</kbd> 可关闭面板，菜单「窗口」可再开。</li>
  <li>调整高度时仅在<strong>松开鼠标</strong>后重算布局，避免拖动过程卡顿。</li>
</ul>

<h3>compileHealth（扫描摘要）</h3>
<p>项目扫描会生成非致命风险摘要：Mod.xml Include 缺失、重复 ID、路径大小写等，供 AI 修复前参考。<strong>编译通过 ≠ 目录符合标准 MOD 格式</strong>，结构规范化需专用评估或 AI「按标准格式整理」。</p>

<h3>AI 修复 BAE 报错</h3>
<ol>
  <li>复制输出面板错误，或说「根据最新编译错误修复」；</li>
  <li>Agent 解析行号与文件，读取 XML，必要时查知识库/联网；</li>
  <li>在 T1 下展示修改方案确认后写入；T3 可直接改；</li>
  <li>再次 <kbd>Ctrl+B</kbd> 验证，直至错误 Tab 为空或仅剩可忽略警告。</li>
</ol>
`,
  },
  {
    id: 'backup',
    icon: '💾',
    title: '项目备份',
    summary: '定时完整复制 MOD 根目录；保留份数上限；立即备份；菜单从备份恢复（最近/自选）。',
    detailHtml: `
<h2>项目自动备份与恢复</h2>
<p>与「编辑器自动保存」不同：本项目备份是<strong>整包复制</strong>当前 MOD 根目录到您指定的备份文件夹，用于灾难恢复或回滚大改。</p>

<h3>在哪里配置</h3>
<p><strong>设置 → 首选项 → 自动保存</strong> 下半部分「项目自动备份」：</p>
<ul>
  <li><strong>启用项目完整备份</strong>：开关定时任务。</li>
  <li><strong>备份目录</strong>：浏览选择磁盘位置（建议非系统盘、空间充足）。</li>
  <li><strong>备份周期</strong>：天 + 时 + 分组合（不能全为 0）；例 0 天 1 时 30 分 = 每 90 分钟。</li>
  <li><strong>保留备份份数</strong>：超出后删<strong>最早</strong>的；0 表示不限制。</li>
  <li><strong>立即备份当前项目</strong>：手动触发一次，状态文字显示进度与结果。</li>
</ul>

<h3>备份时会发生什么</h3>
<ul>
  <li>备份前主进程会尽量<strong>保存已修改的打开文件</strong>到 MOD 目录，再递归复制整个项目根。</li>
  <li>文件夹命名：<code>项目名-备份-时间戳</code>，便于按时间辨认。</li>
  <li>仅复制当前打开的项目；不会备份其它 MOD 或 IDE 程序本身。</li>
</ul>

<h3>如何恢复</h3>
<ul>
  <li><strong>文件 → 从备份恢复（最近）</strong>：选最新时间戳文件夹，覆盖还原到<strong>当前项目路径</strong>（对话框会警告）。</li>
  <li><strong>文件 → 从备份恢复…</strong>：手动挑选某一版备份。</li>
  <li>恢复同样受路径沙箱约束：目标必须在当前项目根内。恢复后建议重新扫描项目并编译验证。</li>
</ul>

<h3>建议</h3>
<ul>
  <li>大规模让 AI「迁移目录」「批量删除」前，先<strong>立即备份</strong>或确认定时备份已开。</li>
  <li>备份目录与 MOD 工程不要放在同一物理盘且无冗余时，磁盘故障仍可能同时损失；重要版本请额外压缩存档。</li>
</ul>
`,
  },
  {
    id: 'safety',
    icon: '🔒',
    title: '安全与锁定',
    summary: '项目路径沙箱；加密 API Key；Agent 工具主进程执行；AI 写入时锁定编辑区。',
    detailHtml: `
<h2>安全、可靠性与写入锁定</h2>
<p>IDE 在方便 AI 改文件的同时，通过主进程校验降低误操作与越权访问风险。</p>

<h3>路径沙箱</h3>
<ul>
  <li><code>read-file</code>、保存、Agent 工具、流式写入、备份恢复均使用 <code>resolveWithinProject</code>：解析后的绝对路径必须在<strong>当前项目根</strong>下。</li>
  <li>渲染进程直接读盘若路径非法，返回 <code>null</code>，标签页提示无法加载。</li>
  <li>防止 <code>..</code>、符号链接或绝对路径指向其它 MOD / 用户目录。</li>
</ul>

<h3>Agent 工具与 IPC</h3>
<ul>
  <li>AI 不直接在渲染进程写盘；通过 <code>agent:tool-call</code> 在主进程 <code>executeAgentTool</code> 执行，并检查 <code>ai-permission</code> 等级。</li>
  <li>破坏性操作（删除、迁移、批量写）在 T1/T2 下需用户确认方案。</li>
</ul>

<h3>敏感配置</h3>
<ul>
  <li>搜索 API Key、部分密钥支持 <strong>enc:</strong> 加密存于用户数据目录；首选项界面不以明文长期写入 localStorage。</li>
  <li>联网搜索请求经主进程发起，带 SSRF 重定向检查，避免内网探测滥用。</li>
</ul>

<h3>AI 写入 IDE 锁定</h3>
<ul>
  <li>写入进行中：<code>html[data-agent-ide-lock="on"]</code> 禁用文件树、标签、编辑区指针事件。</li>
  <li><strong>仍可用</strong>：AI 对话、取消/继续、输出面板查看编译日志。</li>
  <li>顶栏 <code>#agent-ide-lock-banner</code> 提示；写入完成或失败后自动解锁。</li>
</ul>

<h3>备份恢复安全</h3>
<p>从备份恢复前对话框确认；恢复目标路径校验在项目内，避免误恢复到错误目录。</p>
`,
  },
  {
    id: 'properties',
    icon: '📋',
    title: '属性面板',
    summary: 'GameObject 摘要：id/继承/Side/KindOf；资源元数据；只读；× 关闭后菜单恢复。',
    detailHtml: `
<h2>属性面板</h2>
<p>主窗口右侧<strong>属性</strong>栏展示结构化摘要，减少在长 XML 中手工搜寻字段。</p>

<h3>显示与布局</h3>
<ul>
  <li>打开 <code>data</code> 下含 <code>&lt;GameObject&gt;</code> 的 XML 时，列出 id、inheritFrom、Side、EditorSorting、KindOf 等。</li>
  <li>编辑区与属性区之间的 <kbd>▶</kbd> 展开/收起；标题栏 <kbd>×</kbd> <strong>关闭整个右侧属性面板</strong>。</li>
  <li>菜单 <strong>窗口 → 属性面板</strong> 可再次显示；状态与 <code>panel-layout.js</code> 同步。</li>
</ul>

<h3>单位 XML 摘要</h3>
<ul>
  <li><strong>内部 ID</strong>（<code>id</code>）与<strong>继承</strong>（<code>inheritFrom</code>）。</li>
  <li><strong>阵营 Side</strong>、编辑器分类。</li>
  <li><strong>KindOf</strong> 标签列表（坦克/步兵/建筑等判定依据）。</li>
  <li>部分模块指针：武器集、护甲、生产逻辑等（以解析器实际提取为准）。</li>
</ul>

<h3>其它类型</h3>
<ul>
  <li>普通 XML：文件大小、路径、修改时间。</li>
  <li>TGA / W3X 预览：分辨率、LOD、贴图列表等与中央预览联动。</li>
</ul>

<h3>修改方式</h3>
<p>属性区<strong>只读</strong>。请直接改 XML 或让 AI「把 MaxHealth 改为 5000」—— 写回后重新打开文件即可刷新摘要。</p>
`,
  },
  {
    id: 'media',
    icon: '🖼️',
    title: '资源预览',
    summary: 'TGA/DDS 贴图；W3X 元信息；CSF 分类 Tab+分页 400 条；Art 协议；外部 SDK 工具。',
    detailHtml: `
<h2>资源预览</h2>
<p>中央区域除 XML 外可预览常见 MOD 资源，并与右侧属性栏、外部 SDK 工具联动。</p>

<h3>TGA 贴图</h3>
<ul>
  <li>打开 <code>.tga</code> 显示图像（建造栏、单位肖像等）。</li>
  <li>属性面板显示尺寸、路径；支持通过 Art 相对路径引用。</li>
</ul>

<h3>DDS 贴图</h3>
<ul>
  <li>内置解码器显示部分 DDS 格式缩略图。</li>
  <li>无法解码时仍显示元数据，可用首选项配置的外部查看器打开。</li>
</ul>

<h3>W3X 模型</h3>
<ul>
  <li>解析 SAGE 容器：<strong>版本、LOD、网格/骨骼数、贴图列表</strong>等元信息（非完整 3D 视口）。</li>
  <li>文件树右键 <strong>W3X Viewer</strong> 外部查看完整模型。</li>
</ul>

<h3>CSF 字符串表（重点）</h3>
<p>打开 <code>gamestrings*.csf</code> 进入专用 UI：</p>
<ul>
  <li><strong>左侧分类 Tab</strong>：按 Key 前缀（<code>TOOLTIP:</code>、<code>APT:</code>、<code>OBJECT:</code> 等）分组，大型 CSF 可达数十类。</li>
  <li><strong>右侧表格</strong>：当前分类键值；<strong>左右栏独立滚动</strong>，互不牵连。</li>
  <li><strong>分类内搜索</strong>：输入防抖后再过滤，避免每键重绘卡顿。</li>
  <li><strong>分页</strong>：单页最多 <strong>400 行</strong>，底部翻页浏览超大分类。</li>
  <li>保存写回二进制 CSF；修改前建议备份或使用「项目备份」。</li>
</ul>

<h3>Art 资源路径</h3>
<p>项目管理器 Logo、部分预览通过 <code>getArtFileUrl</code> 将 <code>Art/...</code> 解析为安全 <code>file://</code> URL，避免渲染进程随意读盘。</p>

<h3>外部工具</h3>
<p>首选项 → SDK 设置：CSF 编辑器、VP6、VirtualDub、DDS 插件等；文件树右键「用外部工具打开」。</p>
`,
  },
  {
    id: 'split-diff',
    icon: '⫘',
    title: '分屏与对比',
    summary: '左右双栏编辑；Monaco Diff 增删高亮；右键「与当前文件对比」；只读 diff 审阅。',
    detailHtml: `
<h2>分屏与文件对比</h2>

<h3>分屏编辑</h3>
<ul>
  <li>菜单 <strong>窗口 → 分屏视图</strong> 打开右侧第二编辑区。</li>
  <li>文件树 <strong>在新视图中打开</strong>：左保留当前文件，右打开另一文件，可对照修改。</li>
  <li>中间竖条拖拽比例；<strong>关闭分屏</strong> 恢复单栏。</li>
</ul>

<h3>Diff 对比</h3>
<ul>
  <li>先在一侧打开「基准」XML（如 SDK 范例单位）。</li>
  <li>树中另一 XML 右键 <strong>与当前文件对比</strong>：自动分屏并切换 <strong>Monaco Diff Editor</strong>。</li>
  <li>左原版、右修改版；增删行高亮；Diff 模式偏审阅，避免误改对比缓冲。</li>
</ul>

<h3>典型场景</h3>
<ul>
  <li>对照原版单位与 MOD 自定义版。</li>
  <li>检查 AI 批量改名/移动后的差异。</li>
  <li>合并相似 Weapon 前人工审阅。</li>
</ul>

<h3>注意</h3>
<p>若需保存右侧内容，请在普通单栏 tab 中打开该文件路径再编辑；Diff 右侧不一定是独立磁盘副本。</p>
`,
  },
  {
    id: 'preferences',
    icon: '⚙️',
    title: '主题与首选项',
    summary: 'Dark/Light/阵营主题与壁纸；SDK 与外部工具；AI/搜索/权限；自动保存与完整备份；头像。',
    detailHtml: `
<h2>主题与首选项</h2>
<p>菜单 <strong>设置 → 首选项</strong> 打开独立窗口，保存到用户目录 <code>preferences.json</code>（可选「记住设置」持久化）。</p>

<h3>主题风格</h3>
<ul>
  <li><strong>Dark / Light / 高对比度</strong>：编辑器与 chrome 配色。</li>
  <li><strong>盟军 / 苏联 / 帝国</strong>：阵营色强调 + 内置壁纸轮播；欢迎页可显示阵营背景。</li>
  <li><strong>自定义壁纸目录</strong>（Dark/Light）：多图 1–120 分钟间隔淡入淡出。</li>
</ul>

<h3>自动保存（编辑器）</h3>
<ul>
  <li>间隔分钟，0=关；只保存<strong>已打开且未保存</strong>的文件到 MOD 目录。</li>
  <li>与「项目完整备份」区分：后者复制整个项目文件夹。</li>
</ul>

<h3>项目自动备份</h3>
<ul>
  <li>开关、备份目录、周期（天/时/分）、保留份数、立即备份按钮。</li>
  <li>详见「项目备份」功能卡片。</li>
</ul>

<h3>SDK 设置</h3>
<ul>
  <li><strong>RA3 MOD SDK 路径</strong>：须含 <code>EALAModStudio.exe</code>，编译必备。</li>
  <li><strong>外部工具</strong>：W3X 查看器、CSF 编辑器、VP6、VirtualDub、DDS 等；可自动检测 <code>SDK/tools</code>。</li>
</ul>

<h3>AI 设置</h3>
<ul>
  <li>API 地址、Key、模型预设；Key 支持加密存储。</li>
  <li><strong>XML 写入格式</strong>：标准 Insurrection / 当前项目结构（界面表述为「标准 MOD 格式」，非游戏内「起义时刻」剧情用语）。</li>
  <li><strong>T1 / T2 / T3</strong> 自主权限；语气；用户头像上传。</li>
</ul>

<h3>搜索设置</h3>
<ul>
  <li>自动 / 仅离线知识库 / Google CSE / SearXNG 及密钥（加密存储）。</li>
</ul>
`,
  },
  {
    id: 'quickstart',
    icon: '🚀',
    title: '快速上手',
    summary: '配 SDK+AI → 打开 MOD → 扫描 → 编辑/AI 建单位 → Ctrl+B → 备份与简介页。',
    detailHtml: `
<h2>快速上手</h2>
<p>按下列顺序，可在较短时间内完成环境配置并做出第一个可编译改动。</p>

<h3>1. 安装与启动</h3>
<ul>
  <li>安装 <strong>RA3 MOD SDK-X</strong> 与本 IDE（开发环境 <code>npm start</code>，或使用打包版）。</li>
  <li>启动后完成<strong>项目管理器</strong>选项目，或菜单打开最近 MOD。</li>
</ul>

<h3>2. 必要配置</h3>
<ol>
  <li><strong>设置 → 首选项 → SDK 设置</strong>：SDK 根目录。</li>
  <li><strong>AI 设置</strong>：API Key 与模型（若用助手）；权限建议先用 <strong>T1</strong>。</li>
  <li>（推荐）<strong>自动保存 → 项目自动备份</strong>：指定备份盘与周期。</li>
  <li>（可选）<strong>搜索</strong> 保持「自动」；<strong>主题</strong> 任选。</li>
</ol>

<h3>3. 打开 MOD 并熟悉界面</h3>
<ul>
  <li>确认欢迎页显示「当前项目」；浏览文件树 <code>Mod.xml</code> 与 <code>data/</code>。</li>
  <li>菜单 <strong>帮助 → 关于 RA3 IDE</strong> 可随时回到本简介；有打开文件时出现「← 返回继续编辑」。</li>
</ul>

<h3>4. 扫描项目（推荐）</h3>
<ul>
  <li>状态栏 <kbd>AI</kbd> → 「扫描当前项目全部文件，理解项目结构和 XML 引用规范」。</li>
  <li>或自行阅读 knowledge-docs 中 <code>mod-development-workflow.md</code>。</li>
</ul>

<h3>5. 第一次修改</h3>
<ul>
  <li><strong>手动</strong>：打开单位 XML，改 <code>MaxHealth</code> 等，<kbd>Ctrl+S</kbd>。</li>
  <li><strong>AI</strong>：「新建测试单位…」→ T1 下确认写入方案 → 观察流式生成与 IDE 锁定横幅。</li>
  <li><strong>CSF</strong>：打开 <code>gamestrings</code>，左侧选分类，右侧编辑，注意 400 行分页。</li>
</ul>

<h3>6. 编译与进游戏</h3>
<ul>
  <li><kbd>Ctrl+B</kbd>；输出面板查看错误 Tab。</li>
  <li>有错则粘贴给 AI 修复，再编译直至通过。</li>
  <li>游戏内加载 MOD 验证。</li>
</ul>

<h3>快捷键速查</h3>
<table class="welcome-kbd-table">
  <tr><th>快捷键 / 入口</th><th>作用</th></tr>
  <tr><td><kbd>Ctrl+S</kbd></td><td>保存当前文件</td></tr>
  <tr><td><kbd>Ctrl+Shift+S</kbd></td><td>保存全部已打开修改</td></tr>
  <tr><td><kbd>Ctrl+B</kbd></td><td>编译当前 MOD</td></tr>
  <tr><td><kbd>Ctrl+F</kbd> / <kbd>Ctrl+H</kbd></td><td>查找 / 替换</td></tr>
  <tr><td>文件树搜索框</td><td>≥2 字模糊搜文件名（12 条）</td></tr>
  <tr><td>状态栏 AI</td><td>打开助手面板</td></tr>
  <tr><td>帮助 → 关于 RA3 IDE</td><td>显示本简介页</td></tr>
  <tr><td>文件 → 从备份恢复</td><td>还原完整 MOD 副本</td></tr>
</table>

<h3>常见问题</h3>
<ul>
  <li><strong>文件打不开</strong>：确认已打开正确 MOD 根目录；路径提示越界时检查是否切换了项目。</li>
  <li><strong>AI 无响应</strong>：检查 API Key、网络、模型额度；主进程改动需重启 IDE。</li>
  <li><strong>界面卡顿</strong>：大项目首次索引稍等；输出面板拖动松手后才布局；会话仅脏数据自动保存。</li>
  <li><strong>CSF 条目少</strong>：切换左侧分类；大分类用底部分页，勿以为只有前 400 条。</li>
  <li><strong>侧栏 × 无效</strong>：若曾异常，请更新到最新版（× 应关闭整栏而非只关搜索框）。</li>
  <li><strong>仅改界面</strong>：<kbd>Ctrl+R</kbd> 刷新；改 <code>main/</code> 或 <code>preload</code> 需重启 <code>npm start</code>。</li>
</ul>
`,
  },
];

if (typeof window !== 'undefined') {
  window.WELCOME_FEATURES = WELCOME_FEATURES;
}
