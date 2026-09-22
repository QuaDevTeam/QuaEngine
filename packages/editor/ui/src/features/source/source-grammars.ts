import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'

/**
 * Import the grammars themselves. Monaco's contribution barrels eagerly load
 * every editor feature, including unrelated UI and lifecycle observers.
 */
export function registerSourceGrammars(monaco: typeof Monaco): void {
  const loaders = {
    typescript: () => import('monaco-editor/esm/vs/basic-languages/typescript/typescript.js'),
    javascript: () => import('monaco-editor/esm/vs/basic-languages/javascript/javascript.js'),
    markdown: () => import('monaco-editor/esm/vs/basic-languages/markdown/markdown.js'),
    yaml: () => import('monaco-editor/esm/vs/basic-languages/yaml/yaml.js'),
    css: () => import('monaco-editor/esm/vs/basic-languages/css/css.js'),
    scss: () => import('monaco-editor/esm/vs/basic-languages/scss/scss.js'),
    html: () => import('monaco-editor/esm/vs/basic-languages/html/html.js'),
    ini: () => import('monaco-editor/esm/vs/basic-languages/ini/ini.js'),
  }
  for (const [id, loader] of Object.entries(loaders)) {
    monaco.languages.register({ id })
    monaco.languages.registerTokensProviderFactory(id, {
      create: async () => {
        const grammar = await loader()
        monaco.languages.setLanguageConfiguration(id, grammar.conf)
        return grammar.language
      },
    })
  }
}
