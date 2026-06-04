export const QUASCRIPT_LANGUAGE_ID = 'quascript'
export const QUASCRIPT_LANGUAGE_ALIASES = ['QuaScript', 'quascript', 'qs'] as const
export const QUASCRIPT_FILE_EXTENSIONS = ['.qs'] as const
export const QUASCRIPT_MIME_TYPES = ['text/x-quascript'] as const

export interface QuaScriptTextMateCapture {
  name: string
}

export interface QuaScriptTextMatePattern {
  begin?: string
  beginCaptures?: Record<string, QuaScriptTextMateCapture>
  captures?: Record<string, QuaScriptTextMateCapture>
  contentName?: string
  end?: string
  endCaptures?: Record<string, QuaScriptTextMateCapture>
  include?: string
  match?: string
  name?: string
  patterns?: readonly QuaScriptTextMatePattern[]
}

export interface QuaScriptTextMateGrammar {
  fileTypes?: readonly string[]
  name?: string
  patterns: readonly QuaScriptTextMatePattern[]
  repository: Record<string, QuaScriptTextMatePattern>
  scopeName: string
}

export interface QuaScriptShikiLanguageRegistration extends QuaScriptTextMateGrammar {
  aliases: readonly string[]
  embeddedLangs: readonly string[]
}

export interface QuaScriptSnippetCompletion {
  detail: string
  insertText: string
  label: string
}

export interface QuaScriptMonacoLike {
  Range?: new (startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) => unknown
  languages: {
    CompletionItemInsertTextRule?: Record<string, number>
    CompletionItemKind?: Record<string, number>
    register: (language: unknown) => QuaScriptMonacoDisposable | undefined
    registerCompletionItemProvider?: (languageId: string, provider: unknown) => QuaScriptMonacoDisposable | undefined
    setLanguageConfiguration: (languageId: string, configuration: unknown) => QuaScriptMonacoDisposable | undefined
    setMonarchTokensProvider: (languageId: string, language: unknown) => QuaScriptMonacoDisposable | undefined
  }
}

export interface QuaScriptMonacoDisposable {
  dispose: () => void
}

export interface RegisterQuaScriptMonacoLanguageOptions {
  languageId?: string
  registerSnippets?: boolean
}

export const quascriptMonacoLanguageConfiguration = {
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '\'', close: '\'', notIn: ['string', 'comment'] },
    { open: '`', close: '`', notIn: ['string', 'comment'] },
    { open: '${', close: '}', notIn: ['string', 'comment'] },
  ],
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  comments: {
    lineComment: '//',
  },
  folding: {
    markers: {
      start: /^<script\b/i,
      end: /^<\/script>/i,
    },
  },
  indentationRules: {
    decreaseIndentPattern: /^\s*(?:<\/script>|[}\]])/,
    increaseIndentPattern: /(?:<script\b[^>]*>|\{\s*|\[\s*)$/,
  },
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: '\'', close: '\'' },
    { open: '`', close: '`' },
  ],
  wordPattern: /(-?\d*\.\d\w*)|([^\s`~!%^&*()=+[{\]}\\|;:'",.<>/?]+)/g,
} as const

export const quascriptMonarchLanguage = {
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],
  defaultToken: '',
  keywords: ['if'],
  targetHelpers: ['node', 'label', 'scene', 'script', 'packageNode', 'checkpoint', 'image', 'Entry'],
  tokenPostfix: '.quascript',
  tokenizer: {
    root: [
      ['^\\s*//.*$', 'comment'],
      ['<script\\b(?=[^>]*\\blang\\s*=\\s*([\\\'"]ts[\\\'"]|ts\\b))[^>]*>', { token: 'tag', next: '@script', nextEmbedded: 'typescript' }],
      ['^\\s*(@)([A-Z_$][\\w$]*)', ['delimiter.annotation', 'annotation']],
      ['^\\s*(-)(\\s+)', { token: 'delimiter', next: '@choice' }],
      ['\\b(node|label|scene|script|packageNode|checkpoint|image|Entry)(?=\\s*\\()', 'predefined'],
      ['^\\s*([^:@-][^:]*)(:)', ['type.identifier', 'delimiter']],
      ['\\$\\{', { token: 'delimiter.bracket', next: '@typescriptInterpolation', nextEmbedded: 'typescript' }],
      ['"', { token: 'string.quote', next: '@stringDouble' }],
      ['\'', { token: 'string.quote', next: '@stringSingle' }],
      ['[{}()[\\]]', '@brackets'],
    ],
    choice: [
      ['\\$\\{', { token: 'delimiter.bracket', next: '@typescriptInterpolation', nextEmbedded: 'typescript' }],
      ['(->)(\\s*)(scene:\\S+|package:\\S+#\\S+|script:\\S+|#\\S+|\\S+)', ['operator', 'white', { token: 'type.identifier', next: '@choiceTarget' }]],
      ['.+', 'string'],
    ],
    choiceTarget: [
      ['\\s+(if)\\s+', { token: 'keyword', next: '@choiceCondition', nextEmbedded: 'typescript' }],
      ['$', { token: '', next: '@pop' }],
      ['.+', ''],
    ],
    choiceCondition: [
      ['$', { token: '', next: '@pop', nextEmbedded: '@pop' }],
      ['\\{', { token: 'delimiter.bracket', next: '@choiceConditionBrace' }],
      ['[^\\{]+', ''],
    ],
    choiceConditionBrace: [
      ['\\{', { token: 'delimiter.bracket', next: '@push' }],
      ['\\}', { token: 'delimiter.bracket', next: '@pop' }],
      ['[^{}]+', ''],
    ],
    script: [
      ['</script\\s*>', { token: 'tag', next: '@pop', nextEmbedded: '@pop' }],
      ['[^<]+', ''],
      ['<', ''],
    ],
    stringDouble: [
      ['[^\\\\$"]+', 'string'],
      ['\\\\.', 'string.escape'],
      ['\\$\\{', { token: 'delimiter.bracket', next: '@typescriptInterpolation', nextEmbedded: 'typescript' }],
      ['"', { token: 'string.quote', next: '@pop' }],
    ],
    stringSingle: [
      ['[^\\\\$\']+', 'string'],
      ['\\\\.', 'string.escape'],
      ['\'', { token: 'string.quote', next: '@pop' }],
    ],
    typescriptInterpolation: [
      ['\\{', { token: 'delimiter.bracket', next: '@typescriptInterpolationBrace' }],
      ['}', { token: 'delimiter.bracket', next: '@pop', nextEmbedded: '@pop' }],
      ['[^{}]+', ''],
    ],
    typescriptInterpolationBrace: [
      ['\\{', { token: 'delimiter.bracket', next: '@push' }],
      ['\\}', { token: 'delimiter.bracket', next: '@pop' }],
      ['[^{}]+', ''],
    ],
  },
} as const

export const quascriptTextMateGrammar = {
  fileTypes: ['qs'],
  name: 'QuaScript',
  patterns: [
    { include: '#line-comment' },
    { include: '#script' },
    { include: '#decorator' },
    { include: '#choice' },
    { include: '#dialogue' },
    { include: '#interpolation' },
  ],
  repository: {
    'choice': {
      begin: '^(\\s*)(-)(\\s+)',
      beginCaptures: {
        2: { name: 'punctuation.definition.choice.quascript' },
        3: { name: 'punctuation.whitespace.choice.quascript' },
      },
      end: '$',
      patterns: [
        { include: '#interpolation' },
        { include: '#choice-target' },
        {
          match: '(?:(?!\\s->\\s|\\$\\{).)+',
          name: 'string.unquoted.choice.quascript',
        },
      ],
    },
    'choice-target': {
      begin: '(->)\\s*((?:scene:[^\\s#]+(?:#[^\\s]+)?)|(?:package:[^\\s#]+#[^\\s]+)|(?:script:[^\\s#]+(?:#[^\\s]+)?)|(?:#[^\\s]+)|[^\\s]+)',
      beginCaptures: {
        1: { name: 'keyword.operator.choice-target.quascript' },
        2: { name: 'entity.name.label.choice-target.quascript' },
      },
      end: '$',
      patterns: [
        {
          begin: '\\s+(if)\\s+',
          beginCaptures: {
            1: { name: 'keyword.control.conditional.quascript' },
          },
          contentName: 'meta.embedded.inline.typescript',
          end: '$',
          patterns: [
            { include: 'source.ts#expression' },
            { include: 'source.ts' },
          ],
        },
      ],
    },
    'decorator': {
      begin: '^\\s*(@)([A-Za-z_$][\\w$]*)',
      beginCaptures: {
        1: { name: 'punctuation.definition.decorator.quascript' },
        2: { name: 'entity.name.function.decorator.quascript' },
      },
      end: '$',
      patterns: [
        { include: '#decorator-arguments' },
      ],
    },
    'decorator-arguments': {
      begin: '\\(',
      beginCaptures: {
        0: { name: 'punctuation.section.arguments.begin.quascript' },
      },
      contentName: 'meta.embedded.inline.typescript',
      end: '\\)',
      endCaptures: {
        0: { name: 'punctuation.section.arguments.end.quascript' },
      },
      patterns: [
        { include: '#decorator-arguments' },
        { include: '#target-helper' },
        { include: 'source.ts#expression' },
        { include: 'source.ts' },
      ],
    },
    'dialogue': {
      begin: '^\\s*([^:@\\-][^:]*)(:)\\s*',
      beginCaptures: {
        1: { name: 'entity.name.character.quascript' },
        2: { name: 'punctuation.separator.dialogue.quascript' },
      },
      contentName: 'string.unquoted.dialogue.quascript',
      end: '$',
      patterns: [
        { include: '#interpolation' },
      ],
    },
    'interpolation': {
      begin: '(\\$\\{)',
      beginCaptures: {
        1: { name: 'punctuation.section.embedded.begin.quascript' },
      },
      contentName: 'meta.embedded.inline.typescript',
      end: '(\\})',
      endCaptures: {
        1: { name: 'punctuation.section.embedded.end.quascript' },
      },
      patterns: [
        { include: '#typescript-braces' },
        { include: '#target-helper' },
        { include: 'source.ts#expression' },
        { include: 'source.ts' },
      ],
    },
    'line-comment': {
      captures: {
        1: { name: 'punctuation.definition.comment.quascript' },
      },
      match: '^\\s*(//).*$',
      name: 'comment.line.double-slash.quascript',
    },
    'script': {
      begin: '(<script)(?=[^>]*\\blang\\s*=\\s*(?:["\']ts["\']|ts\\b))([^>]*)(>)',
      beginCaptures: {
        1: { name: 'entity.name.tag.script.quascript' },
        2: { name: 'meta.tag.attributes.script.quascript' },
        3: { name: 'punctuation.definition.tag.end.quascript' },
      },
      contentName: 'meta.embedded.block.typescript',
      end: '(</script>)',
      endCaptures: {
        1: { name: 'entity.name.tag.script.quascript' },
      },
      patterns: [
        { include: 'source.ts' },
      ],
    },
    'target-helper': {
      match: '\\b(node|label|scene|script|packageNode|checkpoint|image|Entry)\\s*(?=\\()',
      name: 'support.function.choice-target.quascript',
    },
    'typescript-braces': {
      begin: '\\{',
      beginCaptures: {
        0: { name: 'punctuation.section.block.begin.ts' },
      },
      end: '\\}',
      endCaptures: {
        0: { name: 'punctuation.section.block.end.ts' },
      },
      patterns: [
        { include: '#typescript-braces' },
        { include: '#target-helper' },
        { include: 'source.ts#expression' },
        { include: 'source.ts' },
      ],
    },
  },
  scopeName: 'source.quascript',
} as const satisfies QuaScriptTextMateGrammar

export const quascriptShikiLanguage = {
  ...quascriptTextMateGrammar,
  aliases: [...QUASCRIPT_LANGUAGE_ALIASES],
  embeddedLangs: ['typescript'],
  name: QUASCRIPT_LANGUAGE_ID,
} as const satisfies QuaScriptShikiLanguageRegistration

export const quascriptSnippetCompletions = [
  {
    detail: 'Create a typed QuaScript scope',
    insertText: [
      '<script lang="ts">',
      'export interface Scope {',
      `  ${snippetPlaceholder('1:playerName')}: ${snippetPlaceholder('2:string')}`,
      '}',
      '</script>',
      '',
      `${snippetPlaceholder('3:Yuki')}: ${snippetPlaceholder(`4:Hello ${snippetLiteralInterpolation('scope.playerName')}!`)}`,
    ].join('\n'),
    label: 'script-scope',
  },
  {
    detail: 'QuaScript dialogue line',
    insertText: `${snippetPlaceholder('1:Yuki')}: ${snippetPlaceholder('2:Hello!')}`,
    label: 'say',
  },
  {
    detail: 'Canonical QuaScript choice decorator',
    insertText: [
      `@Choice('${snippetPlaceholder('1:Continue')}', node('${snippetPlaceholder('2:next')}'), {`,
      `  when: ${snippetPlaceholder('3:scope.unlocked')},`,
      `  unavailable: { mode: 'disabled', reason: '${snippetPlaceholder('4:Locked')}' },`,
      `  presentation: { thumbnail: image('${snippetPlaceholder('5:story/thumb.png')}') }`,
      '})',
    ].join('\n'),
    label: 'choice',
  },
  {
    detail: 'QuaScript choice sugar line',
    insertText: `- ${snippetPlaceholder('1:Continue')} -> ${snippetPlaceholder('2:next')} if ${snippetPlaceholder('3:scope.unlocked')}`,
    label: 'choice-line',
  },
] as const satisfies readonly QuaScriptSnippetCompletion[]

export function createQuaScriptMonacoSnippetCompletionItems(
  monaco: QuaScriptMonacoLike,
  range?: unknown,
): unknown[] {
  const kind = monaco.languages.CompletionItemKind?.Snippet ?? 27
  const insertTextRules = monaco.languages.CompletionItemInsertTextRule?.InsertAsSnippet ?? 4
  return quascriptSnippetCompletions.map(snippet => ({
    detail: snippet.detail,
    insertText: snippet.insertText,
    insertTextRules,
    kind,
    label: snippet.label,
    range,
  }))
}

export function registerQuaScriptMonacoLanguage(
  monaco: QuaScriptMonacoLike,
  options: RegisterQuaScriptMonacoLanguageOptions = {},
): QuaScriptMonacoDisposable {
  const languageId = options.languageId || QUASCRIPT_LANGUAGE_ID
  const disposables: QuaScriptMonacoDisposable[] = []
  pushDisposable(disposables, monaco.languages.register({
    aliases: [...QUASCRIPT_LANGUAGE_ALIASES],
    extensions: [...QUASCRIPT_FILE_EXTENSIONS],
    id: languageId,
    mimetypes: [...QUASCRIPT_MIME_TYPES],
  }))
  pushDisposable(disposables, monaco.languages.setLanguageConfiguration(languageId, quascriptMonacoLanguageConfiguration))
  pushDisposable(disposables, monaco.languages.setMonarchTokensProvider(languageId, quascriptMonarchLanguage))

  if (options.registerSnippets !== false && monaco.languages.registerCompletionItemProvider) {
    pushDisposable(disposables, monaco.languages.registerCompletionItemProvider(languageId, {
      provideCompletionItems(model: { getWordUntilPosition?: (position: { column: number, lineNumber: number }) => { endColumn: number, startColumn: number } }, position: { column: number, lineNumber: number }) {
        const word = model.getWordUntilPosition?.(position)
        const range = word && monaco.Range
          ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
          : undefined
        return {
          suggestions: createQuaScriptMonacoSnippetCompletionItems(monaco, range),
        }
      },
      triggerCharacters: ['@', '-', ':'],
    }))
  }

  return {
    dispose() {
      disposables.forEach(disposable => disposable.dispose())
    },
  }
}

function pushDisposable(disposables: QuaScriptMonacoDisposable[], disposable: QuaScriptMonacoDisposable | undefined): void {
  if (disposable) {
    disposables.push(disposable)
  }
}

function snippetPlaceholder(value: string): string {
  return `${dollarSign()}{${value}}`
}

function snippetLiteralInterpolation(expression: string): string {
  return `\\${dollarSign()}{${expression}}`
}

function dollarSign(): string {
  return String.fromCharCode(36)
}
