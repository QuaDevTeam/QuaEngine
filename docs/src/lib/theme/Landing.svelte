<script lang="ts">
  import { ArrowRight, ArrowUpRight, BookOpen, Braces, GitBranch, Layers, Monitor, Sparkles, Terminal, PencilLine, Package, Check, Copy } from '@lucide/svelte';
  import { resolveLocalizedHref } from 'svedocs/theme/headless';
  import type { SvedocsThemeContext } from 'svedocs/theme/types';
  let { context }: { context: SvedocsThemeContext } = $props();
  let example = $state(0);
  let copied = $state(false);
  let copyError = $state(false);
  const examples = [
    { label: '写下对白', title: '故事，始于一次相遇。', lines: ['// opening.qs', '', '午后的风，翻过还没写完的一页。', '小葵: 终于等到你啦。', '小葵: 今天，我们来写一个怎样的故事？'], dialogue: '今天，我们来写一个怎样的故事？' },
    { label: '做出选择', title: '每个选择，都有回声。', lines: ['// choices.qs', '', '小葵: 接下来，要去哪里呢？', '', '- 去海边听风 -> seaside', '- 在书店停留 -> bookshop'], dialogue: '接下来，要去哪里呢？' },
    { label: '编排演出', title: '让字句，拥有温度。', lines: ['// atmosphere.qs · 启用背景与音频插件', '', "@SetBackground('backgrounds/sunset.png')", "@PlayBGM('audio/evening.ogg', { loop: true })", '整座小城，慢慢染上了晚霞。'], dialogue: '整座小城，慢慢染上了晚霞。' }
  ];
  const features = [
    { icon: PencilLine, number: '01', title: '像写故事一样写游戏', text: '对白、分支、演出指令，让 QuaScript 把创作的节奏留在纸面上。复杂逻辑交给 TypeScript。', href: '/docs/authoring/quascript', label: '认识 QuaScript', tone: 'pink' },
    { icon: Layers, number: '02', title: '你的故事，不止一种舞台', text: 'Web、Cocos 与 Native 共享引擎状态。为不同平台选择渲染器，保持故事本身的完整。', href: '/docs/platforms', label: '探索渲染平台', tone: 'mint' },
    { icon: Sparkles, number: '03', title: '把创作工具放在一起', text: '独立编辑器、角色与动画面板、即时预览，还有内置 AI 写作助手，陪你完成下一幕。', href: '/docs/editor', label: '打开创作工作区', tone: 'lilac' }
  ];
  const paths = [
    { icon: BookOpen, title: '第一次见面？', text: '从安装到第一段可玩的对白。', href: '/docs/getting-started', label: '快速开始' },
    { icon: Braces, title: '带着灵感来写作', text: '角色、分支、音画与故事图。', href: '/docs/authoring', label: '创作指南' },
    { icon: Package, title: '想把引擎再拓展一点', text: '插件、QPK 和完整包参考。', href: '/docs/reference', label: '参考手册' }
  ];
  const href = (path: string) => resolveLocalizedHref(path, context);
  async function copyCommand() {
    try { await navigator.clipboard.writeText('pnpm create qua-game my-story'); copied = true; copyError = false; }
    catch { copyError = true; }
  }
</script>

<div class="qua-landing">
  <section class="qua-hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <a class="hero-kicker" href={href('/docs/project/status')}><span class="status-dot"></span> 为热爱故事的你而造 <ArrowUpRight size={13} /></a>
      <h1 id="hero-title">让故事，<br /><span>在这里发生</span><span class="title-period">。</span><span class="title-sparkle" aria-hidden="true">✦</span></h1>
      <p class="hero-intro">一点灵感，一段对白，一个属于你的世界。<br />用 <strong>QuaEngine</strong>，把心里的故事变成可以相遇的视觉小说。</p>
      <div class="hero-actions"><a class="qua-button primary" href={href('/docs/getting-started')}>{context.t('home.primaryAction')} <ArrowRight size={18} /></a><a class="qua-button secondary" href={href('/docs')}><BookOpen size={17} /> 翻开文档</a></div>
      <div class="install-command"><Terminal size={15} /><code>pnpm create qua-game my-story</code><button onclick={copyCommand} aria-label={copied ? '已复制安装命令' : '复制安装命令'}>{#if copied}<Check size={15} />{:else}<Copy size={15} />{/if}</button></div>
      <span class="copy-feedback" aria-live="polite">{copyError ? '请选中上方命令手动复制。' : copied ? '命令已复制，去终端开始吧。' : ''}</span>
      <div class="hero-footnote"><span>开源引擎</span><i></i><span>TypeScript 原生</span><i></i><span>为创作而生</span></div>
    </div>
    <div class="hero-art">
      <span class="art-orbit orbit-one" aria-hidden="true"></span><span class="art-orbit orbit-two" aria-hidden="true"></span>
      <span class="art-sparkle sparkle-one" aria-hidden="true">✦</span><span class="art-sparkle sparkle-two" aria-hidden="true">✧</span>
      <div class="mascot-card"><div class="postcard-top"><span>HELLO, STORYTELLER!</span><span aria-hidden="true">♡</span></div><img class="hero-mascot" src="/brand/mascot.webp" alt="QuaEngine 的粉发小小向导，戴着薄荷星形发夹，微笑着探过头来" width="640" height="640" fetchpriority="high" /><div class="postcard-bottom"><span>你的下一篇故事，从这里开始。</span><span aria-hidden="true">✦</span></div></div>
      <div class="art-tag"><span class="tag-dot"></span> imagination.ts <span aria-hidden="true">↗</span></div>
    </div>
  </section>

  <div class="platform-ribbon"><span>A LITTLE ENGINE. A WORLD OF STORIES.</span><div><span>TypeScript</span><span>QuaScript</span><span class="ribbon-star" aria-hidden="true">✦</span><span>Web</span><span>Cocos</span><span>Native</span></div></div>

  <section class="features-section" aria-labelledby="features-title">
    <div class="section-heading"><div><p class="eyebrow">MADE FOR YOUR IMAGINATION</p><h2 id="features-title">专注于故事，其余交给我们<span aria-hidden="true"> ✧</span></h2></div><a class="text-link" href={href('/docs/getting-started/concepts')}>看看它如何工作 <ArrowUpRight size={16} /></a></div>
    <div class="feature-grid">{#each features as feature}<a href={href(feature.href)} class="feature-card {feature.tone}"><div class="feature-top"><span class="feature-icon"><feature.icon size={24} strokeWidth={1.6} /></span><span class="feature-number">{feature.number}</span></div><h3>{feature.title}</h3><p>{feature.text}</p><span class="feature-link">{feature.label}<ArrowRight size={16} /></span></a>{/each}</div>
  </section>

  <section class="story-section" aria-labelledby="story-title">
    <div class="story-description"><p class="eyebrow">A FEW LINES. A NEW BEGINNING.</p><h2 id="story-title">不如，<br />从一句「你好」开始。</h2><p>QuaScript 让剧本保持剧本的样子。<br />写下对白，放入选项，再为这一刻添上背景与音乐。</p><a class="text-link" href={href('/docs/getting-started/first-story')}>一起写下第一幕 <ArrowRight size={17} /></a><div class="story-mini-note"><GitBranch size={18} /> 小小的选择，也可以通向很远的地方。</div></div>
    <div class="example-workbench"><div class="workbench-bar"><div class="window-dots" aria-hidden="true"><i></i><i></i><i></i></div><span>your-first-story</span><Braces size={15} /></div><div class="example-tabs" aria-label="QuaScript 示例">{#each examples as item, i}<button aria-pressed={example === i} onclick={() => example = i}>{item.label}</button>{/each}</div><div class="example-code" aria-live="polite"><p class="code-caption">{examples[example].title}</p><pre><code>{#each examples[example].lines as line, i}<span class:comment={line.startsWith('//')} class:decorator={line.startsWith('@')} class:choice={line.startsWith('-')}><em aria-hidden="true">{i + 1}</em>{line || ' '}</span>{/each}</code></pre></div><div class="example-dialogue"><img src="/brand/avatar-96.webp" alt="" width="44" height="44" /><div><span>故事的一角</span><p>{examples[example].dialogue}</p></div><span class="dialogue-next" aria-hidden="true">✦</span></div></div>
  </section>

  <section class="tool-section" aria-labelledby="tools-title"><div class="tool-heading"><Monitor size={22} /><p class="eyebrow">YOUR CREATIVE WORKSPACE</p></div><div class="tool-content"><div><h2 id="tools-title">从灵感到下一幕，<br />在同一个工作区。</h2><p>在独立编辑器中管理项目、编排角色与动画、编辑 QuaScript，并排预览 Web 与 Native 效果。</p><a class="qua-button secondary" href={href('/docs/editor')}>认识 QuaEngine Editor <ArrowUpRight size={17} /></a></div><div class="tool-list">{#each [['剧本与代码', 'Monaco 语言服务 · 可视化语句编辑'], ['角色与演出', '角色面板 · 动画时间轴 · 资源浏览'], ['预览与调试', 'Web / Native 预览 · 故事定位 · 存储检查'], ['创作伙伴', '内置 Novel Writer · 项目上下文 · 草稿审核']] as item, i}<div><span>0{i + 1}</span><div><h3>{item[0]}</h3><p>{item[1]}</p></div><ArrowUpRight size={16} /></div>{/each}</div></div></section>

  <section class="reading-section" aria-labelledby="reading-title"><div class="section-heading"><div><p class="eyebrow">FIND YOUR NEXT CHAPTER</p><h2 id="reading-title">从你感兴趣的地方，翻开下一页。</h2></div><span class="reading-flower" aria-hidden="true">✿</span></div><div class="reading-grid">{#each paths as path}<a href={href(path.href)}><path.icon size={22} strokeWidth={1.6} /><h3>{path.title}</h3><p>{path.text}</p><span>{path.label}<ArrowRight size={16} /></span></a>{/each}</div></section>

  <section class="closing-note"><span aria-hidden="true">✦</span><p>世界已经有很多故事了。<br /><strong>但还没有你的这一个。</strong></p><a href={href('/docs/getting-started')}>现在，就写下第一页 <ArrowRight size={17} /></a></section>
</div>
