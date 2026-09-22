import { readdir, readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(docs);
const output = path.join(docs, '.generated/content');
const github = 'https://github.com/QuaDevTeam/QuaEngine/blob/main/';
const sources = [];

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
  return nested.flat();
}
function add(source, destination, title, description, archive = false) {
  sources.push({ source, destination, title, description, archive });
}
const packages = [
  ['core/assets', 'assets', 'QuaAssets 资源系统'], ['core/store', 'store', 'Store 状态与持久化'],
  ['core/pipeline', 'pipeline', 'Pipeline 事件管线'], ['game/story-graph', 'story-graph', '故事图与章节选择'],
  ['build/script-compiler', 'quascript', 'QuaScript 语法与编译器'], ['build/quack', 'quack', 'Quack 打包参考'],
  ['build/vite-plugin', 'vite', 'Vite 集成'], ['build/create-qua-game', 'create-qua-game', '项目脚手架'],
  ['build/language-server', 'language-server', 'QuaScript 语言服务'], ['build/vscode-quascript', 'vscode', 'VS Code 剧本扩展'],
  ['platform/assets-web', 'assets-web', 'Web 资源适配器'],
  ['render/web', 'renderer-web', 'Web 渲染器'], ['render/vue', 'renderer-vue', 'Vue 渲染适配器'],
  ['render/react', 'renderer-react', 'React 渲染适配器'], ['render/svelte', 'renderer-svelte', 'Svelte 渲染适配器'],
  ['native/vscode', 'native-vscode', 'Native UI 编辑扩展'],
];
for (const [dir, slug, title] of packages) add(`packages/${dir}/README.md`, `docs/reference/${slug}.md`, title, `${title}的安装方式、公开接口、使用示例与当前约束。`);
for (const feature of ['achievement', 'animation', 'audio', 'background', 'backlog', 'fonts', 'gallery', 'inventory', 'settings', 'sprite']) {
  const names = { achievement: '成就', animation: '动画', audio: '音频', background: '背景', backlog: '回看', fonts: '字体', gallery: '图库', inventory: '物品', settings: '设置', sprite: '立绘与 UI 皮肤' };
  add(`packages/plugins/${feature}/README.md`, `docs/plugins/${feature}.md`, `${names[feature]}插件`, `${names[feature]}插件的配置、TypeScript API、QuaScript 装饰器和渲染契约。`);
}
add('packages/core/engine/docs/global-api.md', 'docs/reference/engine.md', 'Engine 全局 API', '引擎运行时、场景、对话、资源与状态访问接口。');
add('packages/core/engine/docs/plugin-system.md', 'docs/reference/plugin-system.md', '引擎插件开发', '插件生命周期、依赖关系、管线事件和引擎上下文。');
add('packages/editor/README.md', 'docs/editor/workbench.md', '编辑器工作区', '项目、Monaco、可视化剧本编辑、预览、调试、设置与快捷键。');
add('packages/editor/character/README.md', 'docs/editor/character.md', '角色编辑器', '编辑角色定义、表情与立绘资源。');
add('packages/editor/animation/README.md', 'docs/editor/animation.md', '动画编辑器', '可视化时间轴、数值关键帧与场景预览。');
add('services/plugin-registry/README.md', 'docs/editor/registry.md', '插件市场与发布', '插件注册、npm 所有权验证、审查与注册服务部署。');
const designTitles = { 'mobile-rendering-adaptation': '逻辑舞台与屏幕适配', 'web-asset-loading': 'Web 资源加载流程', 'editor-plugins': '编辑器插件契约', 'background-composition-animation': '背景合成与动画', 'background-transitions': '背景转场', 'cocos-integration-audit': 'Cocos 集成审查', 'dynamic-runtime-qpk': '动态 Runtime QPK', 'native-text-layout': 'Native 文字排版', 'native-jsc-runtime': 'JavaScriptCore 运行时' };
for (const folder of ['design', 'reviews', 'security', 'guides']) {
  for (const file of (await files(path.join(docs, folder))).sort()) {
    if (!file.endsWith('.md')) continue;
    const name = path.basename(file, '.md');
    const content = await readFile(file, 'utf8');
    const originalTitle = content.match(/^# (.+)/m)?.[1] ?? name;
    add(path.relative(root, file), `docs/${folder}/${name}.md`, designTitles[name] ?? originalTitle,
      folder === 'reviews' ? `历史验证记录：${originalTitle}。请结合日期、环境和证据限制阅读。` : `${designTitles[name] ?? originalTitle}的实现设计、使用约定与验证要求。`, folder === 'reviews');
  }
}
for (const file of await files(path.join(docs, 'content'))) {
  if (!file.endsWith('.md')) continue;
  add(path.relative(root, file), path.relative(path.join(docs, 'content'), file));
}
const route = destination => '/' + destination.replace(/\.md$/, '').replace(/\/index$/, '').replace(/^pages\/?/, '').replace(/\/$/, '');
const routes = new Map(sources.map(source => [source.source, route(source.destination)]));

function rewriteLinks(content, source) {
  // Keep code fences byte-for-byte; only authored prose links need relocation.
  return content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g).map((part, index) => {
    if (index % 2) return part;
    return part.replace(/(!?\[[^\]\n]*\]\()([^\s)]+)([^)]*\))/g, (all, prefix, target, suffix) => {
      if (/^(?:[a-z]+:|\/|#)/i.test(target)) return all;
      const [pathname, hash] = target.split('#');
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), pathname));
      const mapped = routes.get(resolved);
      const url = mapped ?? github + resolved;
      return prefix + url + (hash ? '#' + hash : '') + suffix;
    });
  }).join('');
}

await rm(output, { recursive: true, force: true });
for (const source of sources) {
  let body = await readFile(path.join(root, source.source), 'utf8');
  if (source.title) {
    body = body.replace(/^# [^\n]*\n/, '');
    if (source.archive) body = `> 本页保留当时的验证结论，不代表当前完整平台能力。当前状态见[项目进展](/docs/project/status)，运行时说明见[JavaScriptCore](/docs/design/native-jsc-runtime)。\n\n${body}`;
    body = `---\ntitle: ${JSON.stringify(source.title)}\ndescription: ${JSON.stringify(source.description)}\nsource: ${source.source}\nimage: /brand/quaengine-social.png\n---\n\n${body}`;
  } else {
    body = body.replace(/^---\n/, `---\nsource: ${source.source}\nimage: /brand/quaengine-social.png\n`);
  }
  body = rewriteLinks(body, source.source);
  const target = path.join(output, source.destination);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}
await mkdir(path.join(docs, 'static/brand'), { recursive: true });
for (const name of ['mascot.webp', 'avatar-96.webp', 'quaengine-icon.png', 'quaengine-favicon.png', 'quaengine-banner.png', 'quaengine-social.png', 'quadevteam-icon.png', 'quadevteam-logo.png']) {
  await cp(path.join(root, 'assets/brand', name), path.join(docs, 'static/brand', name));
}
await writeFile(path.join(docs, '.generated/sources.json'), JSON.stringify(sources.map(item => ({ ...item, route: route(item.destination) })), null, 2) + '\n');
console.log(`Prepared ${sources.length} documentation pages and 8 brand assets.`);
