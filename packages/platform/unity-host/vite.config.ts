import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [dts({ include: ['src/**/*'], outDir: 'dist', entryRoot: 'src' })],
  build: { lib: { entry: Object.fromEntries(['index', 'assets', 'store', 'security', 'globals'].map(name => [name, resolve(import.meta.dirname, `src/${name}.ts`)])), formats: ['es'], fileName: (_format, name) => `${name}.js` }, target: 'es2020', rollupOptions: { external: /^@quajs\// } },
})
