// main/sdk-build.js —— 后台调用 SDK 工具链编译（不启动 EALAModStudio 图形界面）

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { app } = require('electron');

const DEFAULT_SDK_CANDIDATES = [
  path.join(process.env.USERPROFILE || '', 'RA3 MODSDK-X'),
  path.join('D:', 'Ra3ModEditTool', 'RA3 MODSDK-X'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'RA3 MODSDK-X'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'RA3 MODSDK-X'),
];

const { classifyBuildLogLine } = require('./build-log-classify');

function normalize(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function resolveSdkRoot(sdkPath) {
  const root = normalize(sdkPath) || guessSdkPath();
  if (!root) return null;
  if (fs.existsSync(path.join(root, 'EALAModStudio.exe'))) return root;
  return null;
}

function guessSdkPath() {
  for (const c of DEFAULT_SDK_CANDIDATES) {
    if (c && fs.existsSync(path.join(c, 'EALAModStudio.exe'))) return normalize(c);
  }
  return null;
}

function getModsDir(sdkPath) {
  const root = normalize(sdkPath);
  const upper = path.join(root, 'Mods');
  const lower = path.join(root, 'mods');
  if (fs.existsSync(upper)) return upper;
  if (fs.existsSync(lower)) return lower;
  return upper;
}

function resolveModBuildContext(projectPath, sdkPath) {
  const proj = normalize(projectPath);
  const sdk = normalize(sdkPath);
  const modsDir = normalize(getModsDir(sdk));
  const projLower = proj.toLowerCase();
  const modsLower = modsDir.toLowerCase();

  let modName = path.basename(proj);
  let modSdkDir = proj;
  let underSdkMods = false;

  if (projLower === modsLower || projLower.startsWith(modsLower + '/')) {
    underSdkMods = true;
    const rel = proj.slice(modsDir.length).replace(/^\//, '');
    modName = rel.split('/')[0] || modName;
    modSdkDir = path.join(modsDir, modName);
  } else {
    modSdkDir = path.join(modsDir, modName);
  }

  return { modName, modSdkDir, underSdkMods, modsDir, sdkPath: sdk };
}

function findModXmlPath(dataDir) {
  for (const name of ['mod.xml', 'Mod.xml']) {
    const p = path.join(dataDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function validateModXmlAtProject(projectRoot) {
  const { assessModXml } = require('./mod-xml-repair');
  return assessModXml(projectRoot);
}

function createBuildLogger(onLog) {
  const emit = (channel, text) => {
    if (text && typeof onLog === 'function') onLog({ channel, text });
  };

  return {
    build(text) {
      emit('build', text);
    },
    warning(text) {
      emit('warning', text);
    },
    error(text) {
      emit('error', text);
    },
    step(n, title) {
      emit('build', `\n[Step ${n}] ${title}\n`);
    },
    appendToolOutput(text, preferError = false) {
      const chunks = String(text || '').split(/\r?\n/);
      for (const line of chunks) {
        if (!line.trim()) continue;
        const channel = preferError
          ? 'error'
          : classifyBuildLogLine(line);
        emit(channel, line + '\n');
      }
    },
  };
}

function copyDirRecursive(src, dest, log) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDirRecursive(s, d, log);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      if (log) log.build(`  同步: ${ent.name}\n`);
    }
  }
}

function syncProjectToSdkMod(projectPath, ctx, log) {
  const src = normalize(projectPath);
  const dest = ctx.modSdkDir;
  if (normalize(src) === normalize(dest)) {
    log.build('项目已在 SDK Mods 目录内，无需同步。\n');
    return;
  }

  log.build(`正在同步项目到 SDK Mods：\n  ${dest}\n`);
  fs.mkdirSync(dest, { recursive: true });

  const folders = ['data', 'Data', 'Art', 'Audio', 'assets', 'Assets', 'Additional', 'additional'];
  const copied = new Set();
  for (const folder of folders) {
    const key = folder.toLowerCase();
    if (copied.has(key)) continue;
    const srcDir = path.join(projectPath, folder);
    if (!fs.existsSync(srcDir)) continue;
    copied.add(key);
    const destDir = path.join(dest, folder === 'data' || folder === 'Data' ? 'data' : folder);
    copyDirRecursive(srcDir, destDir, log);
  }

  for (const file of ['mod.babproj', 'Mod.babproj', '.ra3proj']) {
    const s = path.join(projectPath, file);
    if (fs.existsSync(s)) {
      fs.copyFileSync(s, path.join(dest, file));
    }
  }
}

function writeTmpBuildConfig(modSdkDir, buildConfig, ctx) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<BuildConfig>
  <ModPath>${normalize(modSdkDir)}</ModPath>
  <Version>${buildConfig.version}</Version>
  <SkudefName>${buildConfig.skudefName}</SkudefName>
  <CleanTemp>${!!buildConfig.opt1}</CleanTemp>
  <ClearCache>${!!buildConfig.opt2}</ClearCache>
  <BuildAptUI>${!!buildConfig.opt3}</BuildAptUI>
  <BuildGlobalData>${!!buildConfig.opt4}</BuildGlobalData>
  <BuildAssetData>${!!buildConfig.opt5}</BuildAssetData>
  <MergeAssets>${!!buildConfig.opt6}</MergeAssets>
  <FixNeutralAssets>${!!buildConfig.opt7}</FixNeutralAssets>
  <CopyExtraFiles>${!!buildConfig.opt8}</CopyExtraFiles>
  <BuildBig>${!!buildConfig.opt9}</BuildBig>
  <BuildSkudef>${!!buildConfig.opt10}</BuildSkudef>
  <BuildFullscreenIni>${!!buildConfig.opt11}</BuildFullscreenIni>
  <BuildWindowedIni>${!!buildConfig.opt12}</BuildWindowedIni>
</BuildConfig>
`;
  fs.writeFileSync(path.join(modSdkDir, '.tmp_build_config.xml'), xml, 'utf-8');
}

function getDocumentsDir() {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('documents');
    }
  } catch (e) {}
  return path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents');
}

function getRa3ModsInstallPath(modName) {
  const docs = getDocumentsDir();
  const bases = [
    path.join(docs, 'Red Alert 3', 'Mods'),
    path.join(docs, 'Red Alert 3 Uprising', 'Mods'),
  ];
  for (const base of bases) {
    const dir = path.join(base, modName);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const fallback = path.join(docs, 'Red Alert 3', 'Mods', modName);
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function runCmdLine(cmdLine, cwd, log) {
  return new Promise((resolve) => {
    const child = exec(
      cmdLine,
      { cwd, maxBuffer: 1024 * 1024 * 30, windowsHide: true },
      (err, stdout, stderr) => {
        if (stdout) log.appendToolOutput(stdout);
        if (stderr) log.appendToolOutput(stderr, true);
        if (err) {
          log.error(`命令退出码: ${err.code ?? '—'}\n`);
          if (err.message) log.error(`${err.message}\n`);
        }
        resolve({ code: err && err.code != null ? err.code : 0 });
      }
    );
    if (child.stdout) {
      child.stdout.on('data', (d) => log.appendToolOutput(d.toString()));
    }
    if (child.stderr) {
      child.stderr.on('data', (d) => log.appendToolOutput(d.toString(), true));
    }
    child.on('error', (err) => {
      log.error(`进程错误: ${err.message}\n`);
      resolve({ code: -1 });
    });
  });
}

/**
 * 按 defaultscript.cs / IDE 勾选项在后台逐步编译
 */
async function runHeadlessModBuild(ctx, buildConfig, log) {
  const sdk = ctx.sdkPath;
  const mod = ctx.modName;
  const modPath = ctx.modSdkDir;
  const modDataPath = fs.existsSync(path.join(modPath, 'data'))
    ? path.join(modPath, 'data')
    : path.join(modPath, 'Data');
  const modXml = findModXmlPath(modDataPath) || path.join(modDataPath, 'mod.xml');
  const modAssetsPath = fs.existsSync(path.join(modPath, 'assets'))
    ? path.join(modPath, 'assets')
    : path.join(modPath, 'Assets');
  const modAdditionalPath = path.join(modPath, 'Additional');
  const builtModsPath = path.join(sdk, 'builtmods');
  const builtModPath = path.join(builtModsPath, 'mods', mod);
  const builtModDataPath = path.join(builtModPath, 'data');
  const modInstallPath = getRa3ModsInstallPath(mod);
  const modBig = `${mod}_${buildConfig.version}.big`;
  const skudefName = buildConfig.skudefName;
  const skudefFile =
    !skudefName || skudefName === '中文限五字'
      ? `${mod}_${buildConfig.version}.skudef`
      : `${skudefName}_${buildConfig.version}.skudef`;

  const cmd = process.env.ComSpec || 'cmd.exe';
  const bab = path.join(sdk, 'tools', 'binaryassetbuilder.exe');
  const assetMerger = path.join(sdk, 'tools', 'assetmerge.exe');
  const hashFix = path.join(sdk, 'tools', 'hashfix.exe');
  const assetResolver = path.join(sdk, 'tools', 'modassetresolver.exe');
  const lodStream = path.join(sdk, 'tools', 'lodstreambuilder.exe');
  const makeBig = path.join(sdk, 'tools', 'makebig.exe');

  const artPaths = `.;.\\Mods\\${mod}\\Art;.\\Mods;.\\Art`;
  const audioPaths = `.;.\\Mods\\${mod}\\Audio;.\\Mods;.\\Audio`;
  const dataPaths = `.;.\\Mods\\${mod}\\Data;.\\Mods;.\\SageXml`;
  const babCommon = `/od:"${builtModsPath}" /iod:"${builtModsPath}" /csc:false /ls:true /osh:false /pc:true /res:true /slowclean:true /ss:true /art:"${artPaths}" /audio:"${audioPaths}" /data:"${dataPaths}"`;

  let lastCode = 0;

  if (buildConfig.opt1) {
    log.step(1, '清理 MOD 暂存文件');
    const r = await runCmdLine(
      `"${cmd}" /C cd /D "${sdk}" && for /R "${builtModPath}" %I in ("*.*") do @if not "%~xI"==".asset" del "%I" /F /Q`,
      sdk,
      log
    );
    if (r.code !== 0) lastCode = r.code;
  }

  if (buildConfig.opt2) {
    log.step(2, '清空缓存');
    const r = await runCmdLine(
      `"${cmd}" /C cd /D "${sdk}" && (if exist "${builtModsPath}\\builtmods" rd "${builtModsPath}\\builtmods" /S /Q) && (if exist "${builtModsPath}\\cache" rd "${builtModsPath}\\cache" /S /Q) && (for /R "${builtModPath}" %I in (*.asset) do @del "%I" /F /Q) && (if exist "${builtModsPath}\\binaryassetbuilder.sessioncache.xml" del "${builtModsPath}\\binaryassetbuilder.sessioncache.xml" /F /Q) && (if exist "${builtModsPath}\\stringhashes.xml" del "${builtModsPath}\\stringhashes.xml" /F /Q)`,
      sdk,
      log
    );
    if (r.code !== 0) lastCode = r.code;
  }

  if (buildConfig.opt3) {
    log.step(3, '建立 AptUI');
    const aptuiSrc = path.join(modDataPath, 'aptui');
    if (!fs.existsSync(aptuiSrc)) {
      log.build('  （无 aptui 目录，跳过）\n');
    } else {
      const r = await runCmdLine(
        `"${cmd}" /C cd /D "${sdk}" && (for %I in ("${builtModDataPath}\\aptui\\*") do @del "%I" /F /Q 2>nul) && (for %I in ("${aptuiSrc}\\*.xml") do @("${bab}" "%I" ${babCommon}))`,
        sdk,
        log
      );
      if (r.code !== 0) lastCode = r.code;
    }
  }

  if (buildConfig.opt4) {
    log.step(4, '建立全局数据');
    const mapsDir = path.join(modDataPath, 'additionalmaps');
    if (!fs.existsSync(mapsDir)) {
      log.build('  （无 additionalmaps，跳过）\n');
    } else {
      const r = await runCmdLine(
        `"${cmd}" /C cd /D "${sdk}" && (for %I in ("${builtModDataPath}\\additionalmaps\\mapmetadata_*") do @del "%I" /F /Q 2>nul) && (for %I in ("${mapsDir}\\mapmetadata_*.xml") do @("${bab}" "%I" ${babCommon}))`,
        sdk,
        log
      );
      if (r.code !== 0) lastCode = r.code;
    }
  }

  if (buildConfig.opt5) {
    log.step(5, '建立基础数据 (mod.xml)');
    if (!fs.existsSync(modXml)) {
      log.error(`找不到 ${modXml}\n`);
      return { code: 1 };
    }
    let babCmd = `"${cmd}" /C cd /D "${sdk}" && (if exist "${builtModDataPath}\\mod.bin" del "${builtModDataPath}\\mod.bin" /F /Q) && (if exist "${builtModDataPath}\\mod.manifest" del "${builtModDataPath}\\mod.manifest" /F /Q) && ("${bab}" "${modXml}" ${babCommon})`;
    if (!buildConfig.opt6 && !buildConfig.opt7 && fs.existsSync(lodStream)) {
      babCmd += ` && ("${lodStream}" "${path.join(builtModDataPath, 'mod.manifest')}")`;
    }
    const r = await runCmdLine(babCmd, sdk, log);
    if (r.code !== 0) lastCode = r.code;
  }

  if (buildConfig.opt6 && fs.existsSync(assetMerger) && fs.existsSync(modAssetsPath)) {
    log.step(6, '合并 Assets');
    let mergeCmd = `"${cmd}" /V:ON /C cd /D "${sdk}" && (for /R "${modAssetsPath}" %I in ("") do @if exist "%~dpI*.asset" "${assetMerger}" "${path.join(builtModDataPath, 'mod')}" "%~dpI")`;
    if (!buildConfig.opt7 && fs.existsSync(lodStream)) {
      mergeCmd += ` && ("${lodStream}" "${path.join(builtModDataPath, 'mod.manifest')}")`;
    }
    const r = await runCmdLine(mergeCmd, sdk, log);
    if (r.code !== 0) lastCode = r.code;
  }

  if (buildConfig.opt7 && fs.existsSync(hashFix)) {
    log.step(7, '修复中立资产');
    const manifest = path.join(builtModDataPath, 'mod.manifest');
    const r = await runCmdLine(
      `"${cmd}" /C cd /D "${sdk}" && ("${hashFix}" "${manifest}") && ("${assetResolver}" "${manifest}") && ("${lodStream}" "${manifest}")`,
      sdk,
      log
    );
    if (r.code !== 0) lastCode = r.code;
  }

  if (buildConfig.opt8) {
    log.step(8, '复制额外文件');
    const sdkAdditional = path.join(sdk, 'additional');
    if (fs.existsSync(sdkAdditional)) copyDirRecursive(sdkAdditional, builtModPath, log);
    if (fs.existsSync(modAdditionalPath)) copyDirRecursive(modAdditionalPath, builtModPath, log);
    log.build('  复制完成\n');
  }

  if (buildConfig.opt9 && fs.existsSync(makeBig)) {
    log.step(9, '建立 Big 文件');
    const r = await runCmdLine(
      `"${cmd}" /C cd /D "${sdk}" && ("${makeBig}" -f "${builtModPath}" -x:*.asset -o:"${path.join(modInstallPath, modBig)}")`,
      sdk,
      log
    );
    if (r.code !== 0) lastCode = r.code;
  }

  if (buildConfig.opt10) {
    log.step(10, '建立 Skudef');
    try {
      const skudefPath = path.join(modInstallPath, skudefFile);
      fs.writeFileSync(skudefPath, `mod-game 1.12\r\nadd-big ${modBig}\r\n`, 'utf-8');
      log.build(`  已写入: ${skudefPath}\n`);
    } catch (e) {
      log.error(`写入 Skudef 失败: ${e.message}\n`);
      lastCode = 1;
    }
  }

  if (buildConfig.opt11) {
    log.step(11, '建立全屏 INI (CurrentMOD.ini)');
    fs.writeFileSync(
      path.join(sdk, 'CurrentMOD.ini'),
      `"${path.join(modInstallPath, skudefFile)}"\r\n`,
      'utf-8'
    );
    log.build(`  ${path.join(sdk, 'CurrentMOD.ini')}\n`);
  }

  if (buildConfig.opt12) {
    log.step(12, '建立窗口 INI (CurrentMOD.ini -win)');
    fs.writeFileSync(
      path.join(sdk, 'CurrentMOD.ini'),
      `"${path.join(modInstallPath, skudefFile)}" -win\r\n`,
      'utf-8'
    );
    log.build(`  ${path.join(sdk, 'CurrentMOD.ini')}\n`);
  }

  const manifest = path.join(builtModDataPath, 'mod.manifest');
  if (!fs.existsSync(manifest)) {
    log.error('\n未生成 mod.manifest，编译未成功。请查看 ErrorLog 中的工具输出。\n');
    return { code: lastCode || 1 };
  }

  log.build('\n编译流程已结束。\n');
  return { code: lastCode };
}

/**
 * @param {object} opts
 * @param {(payload:{channel:'build'|'error',text:string})=>void} opts.onLog
 */
async function runModBuild({ projectPath, sdkPath, buildConfig, onLog }) {
  const log = createBuildLogger(onLog);
  const sdk = resolveSdkRoot(sdkPath);

  if (!sdk) {
    log.error('错误：未设置有效 SDK 路径。请在「设置 → 首选项」中选择含 EALAModStudio.exe 的 RA3 MODSDK-X 目录。\n');
    return { code: 1 };
  }

  if (!projectPath) {
    log.error('错误：未打开 MOD 项目。\n');
    return { code: 1 };
  }

  const ctx = resolveModBuildContext(projectPath, sdk);
  syncProjectToSdkMod(projectPath, ctx, log);
  writeTmpBuildConfig(ctx.modSdkDir, buildConfig, ctx);

  const modCheck = validateModXmlAtProject(ctx.modSdkDir);
  if (modCheck.status === 'missing') {
    log.error(`错误：缺少 data/Mod.xml\n  ${ctx.modSdkDir}\n`);
    log.error('提示：可在 AI 对话中粘贴本错误并发送「修复编译错误」，将自动生成 Mod.xml。\n');
    return { code: 1 };
  }
  if (modCheck.status === 'empty') {
    log.error(`错误：data/Mod.xml 存在但为空或过短\n  ${modCheck.path || ctx.modSdkDir}\n`);
    log.error('提示：使用 AI「修复编译错误」可自动重建 Mod.xml 并注册单位 XML。\n');
    return { code: 1 };
  }
  if (modCheck.status === 'invalid') {
    log.error(`错误：Mod.xml 格式无效（${modCheck.hint}）\n  ${modCheck.path}\n`);
    return { code: 1 };
  }

  log.build('—— 后台编译（与 IDE 编译选项一致，不打开 EALAModStudio）——\n');
  log.build(`SDK: ${sdk}\n`);
  log.build(`Mod: ${ctx.modName}\n`);
  log.build(`路径: ${ctx.modSdkDir}\n`);
  log.build(`版本: ${buildConfig.version}  |  Skudef: ${buildConfig.skudefName}\n`);
  log.build(
    `选项: clean=${!!buildConfig.opt1} cache=${!!buildConfig.opt2} aptui=${!!buildConfig.opt3} global=${!!buildConfig.opt4} data=${!!buildConfig.opt5} merge=${!!buildConfig.opt6} fix=${!!buildConfig.opt7} extra=${!!buildConfig.opt8} big=${!!buildConfig.opt9} skudef=${!!buildConfig.opt10} fs=${!!buildConfig.opt11} win=${!!buildConfig.opt12}\n`
  );

  return runHeadlessModBuild(ctx, buildConfig, log);
}

module.exports = {
  guessSdkPath,
  resolveSdkRoot,
  resolveModBuildContext,
  syncProjectToSdkMod,
  runModBuild,
  runHeadlessModBuild,
  createBuildLogger,
};
