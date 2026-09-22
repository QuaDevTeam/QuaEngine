declare module 'monaco-editor/esm/vs/language/json/tokenization.js' {
  export function createTokenizationSupport(comments: boolean): import('monaco-editor').languages.TokensProvider
}

declare module 'monaco-editor/esm/vs/basic-languages/*' {
  export const language: import('monaco-editor/esm/vs/editor/editor.api.js').languages.IMonarchLanguage
  export const conf: import('monaco-editor/esm/vs/editor/editor.api.js').languages.LanguageConfiguration
}
