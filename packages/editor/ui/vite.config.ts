import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [{
    name: 'qua-monaco-grammar-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/monaco-editor\/esm\/vs\/basic-languages\/[^/]+\/[^/]+\.js$/u.test(id))
        return
      // Monaco 0.55's grammar artifacts inline editor.main's entire feature
      // bootstrap. Keep the grammar and its API enum imports, without loading
      // unrelated editor contributions/lifecycle observers on first TS/YAML use.
      return { code: code.replace(/^import ['"]\.\.\/\.\.\/(?:editor|base)\/[^'"]+['"];?\r?\n/gmu, ''), map: null }
    },
  }],
  build: { target: 'es2022', rollupOptions: { input: ['index.html', 'preview.html', 'asset.html'] } },
})
