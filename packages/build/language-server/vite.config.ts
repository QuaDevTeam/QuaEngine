import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      outDir: 'dist',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        editor: resolve(import.meta.dirname, 'src/editor.ts'),
        index: resolve(import.meta.dirname, 'src/index.ts'),
        server: resolve(import.meta.dirname, 'src/server.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@quajs/plugin-discovery',
        '@quajs/project-inspector',
        '@quajs/script-compiler',
        'node:fs',
        'node:path',
        'node:url',
        'typescript',
        'vscode-languageserver/node',
        'vscode-languageserver-textdocument',
      ],
      output: {
        preserveModules: true,
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
    target: 'node20',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
