import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quaCodeBlocks } from '../src/lib/markdown/qua-code.ts';

const text = node => node.value ?? (node.children ?? []).map(text).join('');
const descendants = node => [node, ...(node.children ?? []).flatMap(descendants)];
async function render(source, language) {
  const code = { type: 'element', tagName: 'code', properties: { className: [`language-${language}`] }, children: [{ type: 'text', value: source }] };
  const pre = { type: 'element', tagName: 'pre', children: [code] };
  await quaCodeBlocks()({ type: 'root', children: [pre] });
  return { pre, code };
}

for (const alias of ['qs', 'quascript']) {
  test(`${alias}: native syntax and embedded TypeScript keep source and dual-theme colors`, async () => {
    const source = [
      '<script lang="ts">',
      'export interface Scope { playerName: string }',
      '</script>', '', '// 一封信', '@Wait(300)',
      '小葵: 你好，${scope.playerName}。',
      '- 一起出发 -> scene:letter',
      '信上写着 <img src=x onerror="alert(1)">。', ''
    ].join('\n');
    const { pre, code } = await render(source, alias);
    assert.equal(pre.properties['data-copy'], source);
    assert.equal(code.children.map(text).join('\n'), source.replace(/\n$/, ''));
    const tokens = descendants(code).filter(node => node.properties?.style);
    const styleOf = word => tokens.find(node => text(node).trim() === word)?.properties.style;
    for (const word of ['export', 'Wait', '300', '小葵', 'scope', '一起出发', '->', 'scene:letter']) {
      assert.match(styleOf(word), /--shiki-light:.*--shiki-dark:/, word);
    }
    assert.notEqual(styleOf('export'), styleOf('scope'));
    assert.notEqual(styleOf('Wait'), styleOf('300'));
    assert.notEqual(styleOf('一起出发'), styleOf('->'));
    assert.ok(descendants(code).every(node => !['img', 'script'].includes(node.tagName)), 'Code remains inert text');
  });
}

test('Unknown DSL stays plain text and uses the accessible icon copy control', async () => {
  const source = '<Panel> ${literal} </Panel>\n';
  const { pre, code } = await render(source, 'qui');
  assert.equal(text(code), source);
  assert.equal(pre.properties['data-copy'], source);
  const button = descendants(pre).find(node => node.tagName === 'button');
  assert.equal(button.properties['aria-label'], '复制代码');
  assert.equal(text(button), '');
  assert.ok(button.children.some(node => node.tagName === 'svg'));
});

test('Empty QuaScript and existing svedocs highlighting remain valid', async () => {
  const { pre } = await render('', 'qs');
  assert.equal(pre.properties['data-copy'], '');
  const enhanced = { type: 'element', tagName: 'pre', properties: { dataEnhanced: 'true' }, children: [{ type: 'element', tagName: 'code', children: [{ type: 'text', value: 'const x = 1;' }] }] };
  const original = structuredClone(enhanced);
  await quaCodeBlocks()({ type: 'root', children: [enhanced] });
  assert.deepEqual(enhanced, original);
});
