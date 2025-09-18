# @quajs/vite-plugin

Comprehensive Vite plugin for QuaEngine projects that provides a complete build pipeline with zero configuration.

## Features

- **🎯 QuaScript Compilation**: Transform `qs` template literals with plugin support
- **🔧 Plugin Discovery**: Automatically discover and bundle QuaJS plugins  
- **📦 Asset Bundling**: Process game assets using Quack bundler
- **🔥 Development Server**: Enhanced HMR for scripts and assets
- **🚀 Zero Configuration**: Works out of the box with sensible defaults

## Installation

```bash
pnpm add -D @quajs/vite-plugin
```

## Basic Usage

```javascript
// vite.config.js
import { quaEngine } from '@quajs/vite-plugin'

export default {
  plugins: [quaEngine()]
}
```

## Configuration

```javascript
// vite.config.js
import { quaEngine } from '@quajs/vite-plugin'

export default {
  plugins: [
    quaEngine({
      // Script compilation options
      scriptCompiler: {
        enabled: true,
        include: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        projectRoot: process.cwd()
      },

      // Plugin discovery options  
      pluginDiscovery: {
        enabled: true,
        generateVirtualRegistry: true,
        autoBundlePlugins: true
      },

      // Asset bundling options
      assetBundling: {
        enabled: true,
        source: 'assets',
        output: 'dist/assets', 
        format: 'auto', // 'qpk' | 'zip' | 'auto'
        compression: {
          algorithm: 'deflate', // 'none' | 'deflate' | 'lzma'
          level: 6
        },
        encryption: {
          enabled: false,
          algorithm: 'xor', // 'xor' | 'aes256'
          key: 'your-encryption-key'
        }
      },

      // Development server options
      devServer: {
        hotReloadScripts: true,
        watchAssets: true
      }
    })
  ]
}
```

## Individual Plugins

You can also use individual plugins for more control:

```javascript
import { 
  quaScriptCompilerPlugin, 
  quaEnginePlugin, 
  quackPlugin 
} from '@quajs/vite-plugin'

export default {
  plugins: [
    quaScriptCompilerPlugin({ projectRoot: './src' }),
    quaEnginePlugin({ generateVirtualRegistry: true }),
    quackPlugin({ format: 'qpk', source: './game-assets' })
  ]
}
```

## Plugin Discovery

The plugin automatically discovers QuaJS plugins from:

1. **Package dependencies**: Packages named `@quajs/plugin-*` or `quajs-plugin-*`
2. **Custom registry**: Plugins defined in `qua.plugins.json`
3. **Package metadata**: Packages with `quajs.type: 'plugin'` in package.json

### Virtual Plugin Registry

When `generateVirtualRegistry` is enabled, you can import discovered plugins:

```typescript
// Access the virtual plugin registry
import { plugins, pluginMeta, hasPlugins } from 'virtual:qua-plugins'

// Use discovered plugins
if (hasPlugins) {
  const audioPlugin = plugins['@quajs/plugin-audio']
  // Initialize plugin...
}
```

## Asset Processing

The Quack integration provides:

- **Asset Discovery**: Automatically finds game assets
- **Bundle Creation**: Creates optimized asset bundles  
- **Manifest Generation**: Provides asset metadata
- **Development Watching**: Hot reload for asset changes

## Development Features

### Hot Module Replacement

- **Script HMR**: Automatic reload for QuaScript changes
- **Asset HMR**: Live updates for game assets
- **Plugin HMR**: Reload when plugins change

### Development Events

Listen for custom events in your client code:

```javascript
if (import.meta.hot) {
  import.meta.hot.on('asset-change', (data) => {
    console.log('Asset changed:', data.file)
    // Reload asset...
  })

  import.meta.hot.on('qua-script-update', (data) => {
    console.log('Script updated:', data.file) 
    // Recompile script...
  })
}
```

## Build Pipeline

The plugin creates an integrated build pipeline:

1. **Plugin Discovery**: Scan for QuaJS plugins
2. **Script Compilation**: Transform QuaScript templates
3. **Asset Bundling**: Process game assets with Quack
4. **Bundle Generation**: Create optimized bundles
5. **Manifest Creation**: Generate asset manifests

## TypeScript Support

Full TypeScript support with proper type definitions:

```typescript
import type { QuaEngineVitePluginOptions } from '@quajs/vite-plugin'

const config: QuaEngineVitePluginOptions = {
  scriptCompiler: {
    enabled: true,
    projectRoot: './src'
  }
}
```

## Advanced Configuration

### Custom Plugin Discovery

```javascript
// qua.plugins.json
{
  "version": "1.0",
  "plugins": [
    {
      "name": "custom-plugin",
      "entry": "./plugins/custom.js",
      "enabled": true
    }
  ]
}
```

### Environment-Specific Config

```javascript
export default {
  plugins: [
    quaEngine({
      assetBundling: {
        format: process.env.NODE_ENV === 'production' ? 'qpk' : 'zip',
        compression: {
          algorithm: process.env.NODE_ENV === 'production' ? 'lzma' : 'deflate'
        }
      }
    })
  ]
}
```

## License

Apache-2.0