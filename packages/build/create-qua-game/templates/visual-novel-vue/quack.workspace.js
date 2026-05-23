import { defineConfig } from '@quajs/quack'
export default defineConfig({
  name: '__PROJECT_NAME__',
  version: '0.1.0',
  bundles: [
    {
      name: 'main',
      displayName: '__PROJECT_TITLE__ Main Assets',
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
