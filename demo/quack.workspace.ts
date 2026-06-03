import { defineConfig } from '@quajs/quack'
export default defineConfig({
  name: 'demo',
  version: '0.1.0',
  bundles: [
    {
      name: 'main',
      displayName: 'Demo Main Assets',
      source: './assets',
      format: 'qpk',
      priority: 1,
      loadTrigger: 'immediate',
    },
  ],
  globalSettings: {
    compression: {
      algorithm: 'none',
    },
  },
  output: './dist/assets',
})
