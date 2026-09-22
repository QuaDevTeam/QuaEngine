import { createHighlighter, type LanguageRegistration } from 'shiki';
import quaScriptGrammar from '../../../../packages/build/vscode-quascript/syntaxes/quascript.tmLanguage.json' with { type: 'json' };

export const quaCodeThemes = { light: 'github-light', dark: 'github-dark' } as const;

// Build-time only, shared across pages. Reuse the editor's grammar and its TS
// embedding rather than classifying the entire narrative language as TypeScript.
let highlighter: ReturnType<typeof createHighlighter> | undefined;
function getHighlighter() {
  return highlighter ??= createHighlighter({
    themes: Object.values(quaCodeThemes),
    langs: ['typescript', { ...quaScriptGrammar, name: 'quascript', aliases: ['qs'] } as LanguageRegistration]
  });
}

interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

export function quaCodeBlocks() {
  return async (tree: unknown) => {
    async function visit(node: Node) {
      if (node.type === 'element' && node.tagName === 'pre') {
        const code = node.children?.find(child => child.tagName === 'code');
        if (!code || node.properties?.['data-enhanced'] || node.properties?.dataEnhanced) return;
        const classes = String(code.properties?.className ?? '');
        const language = String(code.properties?.['data-language'] ?? code.properties?.dataLanguage ?? node.properties?.['data-language'] ?? /language-([\w-]+)/.exec(classes)?.[1] ?? 'text');
        const text = (part: Node): string => part.value ?? (part.children ?? []).map(text).join('');
        const raw = text(code);
        const isQuaScript = language === 'qs' || language === 'quascript';
        let highlighted: Node | undefined;
        if (isQuaScript) {
          const hast = (await getHighlighter()).codeToHast(raw.replace(/\n$/, ''), {
            lang: 'quascript', themes: quaCodeThemes, defaultColor: false
          });
          highlighted = hast.children.find(child => child.type === 'element' && child.tagName === 'pre') as Node | undefined;
          const highlightedCode = highlighted?.children?.find(child => child.tagName === 'code');
          if (!highlightedCode) throw new Error('QuaScript highlighter did not produce a code block');
          // Match svedocs' line structure so blank lines and token whitespace
          // survive its flex-based line styles without doubling line breaks.
          code.children = highlightedCode.children?.filter(child => child.tagName === 'span').map((line, index) => ({
            ...line,
            properties: { className: ['line'], 'data-line': index + 1 },
            children: [{ type: 'element', tagName: 'span', properties: { className: ['sd-line-content'] }, children: line.children }]
          }));
        }
        const metadata = Object.fromEntries(Object.entries(code.properties ?? {}).filter(([key]) => /^data[-A-Z]/.test(key)));
        node.properties = { ...metadata, ...node.properties,
          ...(highlighted ? { style: highlighted.properties?.style } : {}),
          className: isQuaScript ? ['sd-code', 'shiki'] : ['sd-code'],
          'data-language': language, 'data-copy': raw, 'data-enhanced': 'true', 'data-qua-dsl': 'true' };
        // Fallback highlighting put pre-level decoration on code; remove that
        // duplicate frame while retaining the original text and language.
        code.properties = { className: [`language-${language}`] };
        node.children = [
          { type: 'element', tagName: 'span', properties: { className: ['sd-code-header'] }, children: [
            { type: 'element', tagName: 'span', properties: { className: ['sd-code-language'], 'data-language': language }, children: [{ type: 'text', value: isQuaScript ? 'QuaScript' : language.toUpperCase() }] },
            { type: 'element', tagName: 'button', properties: { type: 'button', className: ['sd-code-copy'], 'data-sd-copy': '', 'aria-label': '复制代码', title: '复制代码' }, children: [
              { type: 'element', tagName: 'svg', properties: { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, children: [
                { type: 'element', tagName: 'path', properties: { d: 'M9 5h9v14H9zM6 8v12h10' } }
              ] }
            ] }
          ] }, code
        ];
        return;
      }
      await Promise.all(node.children?.map(visit) ?? []);
    }
    await visit(tree as Node);
  };
}
