import { defineConfig } from '@quajs/quack'

export default defineConfig({
  workspace: {
    name: 'MyGameAssets',
    version: '1.0.0',
    bundles: [
      {
        name: 'core',
        displayName: 'Core Assets',
        source: './assets/core',
        priority: 0,
        loadTrigger: 'immediate',
        description: 'Essential game assets that must be loaded first',
        dependencies: [],
        format: 'qpk',
      },
      {
        name: 'ui',
        displayName: 'User Interface',
        source: './assets/ui',
        priority: 1,
        loadTrigger: 'immediate',
        description: 'User interface elements and menus',
        dependencies: ['core'],
        format: 'zip',
      },
      {
        name: 'levels',
        displayName: 'Game Levels',
        source: './assets/levels',
        priority: 2,
        loadTrigger: 'lazy',
        description: 'Level-specific assets loaded on demand',
        dependencies: ['core', 'ui'],
        format: 'qpk',
      },
      {
        name: 'audio',
        displayName: 'Audio Assets',
        source: './assets/audio',
        priority: 3,
        loadTrigger: 'lazy',
        description: 'Music and sound effects',
        dependencies: ['core'],
        format: 'qpk',
        compression: {
          level: 9,
          algorithm: 'lzma',
        },
      },
    ],
    globalSettings: {
      compression: {
        level: 6,
        algorithm: 'lzma',
      },
      encryption: {
        enabled: true,
        algorithm: 'xor',
      },
      versioning: {
        incrementVersion: true,
      },
    },
    output: './dist',
  },
})
