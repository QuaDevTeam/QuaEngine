#!/usr/bin/env node

import { Command } from 'commander'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createLogger } from '@quajs/logger'
import { QuackBundler } from './bundler.js'
import { ZipBundler } from './zip-bundler.js'
import { QPKBundler } from './qpk-bundler.js'
import { PatchGenerator } from './patch-generator.js'
import { VersionManager } from './versioning.js'
import { WorkspaceManager } from './workspace.js'
import type { QuackConfig, BundleFormat, WorkspaceConfig } from './types.js'

const logger = createLogger('quack:cli')

const program = new Command()

// Package info (would normally come from package.json)
const VERSION = '0.1.0'

program
  .name('quack')
  .description('QuaEngine Asset Bundler - Package game assets with localization support')
  .version(VERSION)

// Bundle command
program
  .command('bundle')
  .description('Bundle assets from source directory')
  .argument('[source]', 'Source directory containing assets', '.')
  .option('-o, --output <path>', 'Output file path')
  .option('-f, --format <format>', 'Output format (zip|qpk|auto)', 'auto')
  .option('-c, --config <path>', 'Configuration file path')
  .option('--compression-level <level>', 'Compression level (0-9)', '6')
  .option('--no-compress', 'Disable compression')
  .option('--no-encrypt', 'Disable encryption (QPK only)')
  .option('--encryption-key <key>', 'Custom encryption key')
  .option('--plugin <name...>', 'Load plugins')
  .option('-v, --verbose', 'Verbose output')
  .action(async (source, options) => {
    try {
      const config = await loadConfig(source, options)
      const bundler = new QuackBundler(config)
      
      console.log(`🚀 Bundling assets from: ${config.source}`)
      console.log(`📦 Output: ${config.output} (${config.format})`)
      
      const stats = await bundler.bundle()
      
      console.log('✅ Bundle created successfully!')
      console.log(`📊 ${stats.totalFiles} files, ${formatBytes(stats.totalSize)}, ${stats.processingTime}ms`)
      
    } catch (error) {
      console.error('❌ Bundle creation failed:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Extract command
program
  .command('extract')
  .description('Extract bundle to directory')
  .argument('<bundle>', 'Bundle file to extract')
  .argument('[output]', 'Output directory', '.')
  .option('-v, --verbose', 'Verbose output')
  .action(async (bundlePath, outputDir, options) => {
    try {
      const resolvedBundle = resolve(bundlePath)
      const resolvedOutput = resolve(outputDir)
      
      if (!existsSync(resolvedBundle)) {
        throw new Error(`Bundle not found: ${resolvedBundle}`)
      }
      
      console.log(`📦 Extracting: ${resolvedBundle}`)
      console.log(`📁 Output: ${resolvedOutput}`)
      
      if (bundlePath.endsWith('.qpk')) {
        const qpkBundler = new QPKBundler()
        await qpkBundler.extractBundle(resolvedBundle, resolvedOutput)
      } else {
        const zipBundler = new ZipBundler()
        await zipBundler.extractBundle(resolvedBundle, resolvedOutput)
      }
      
      console.log('✅ Bundle extracted successfully!')
      
    } catch (error) {
      console.error('❌ Extraction failed:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// List command
program
  .command('list')
  .description('List contents of bundle')
  .argument('<bundle>', 'Bundle file to inspect')
  .option('-v, --verbose', 'Verbose output')
  .action(async (bundlePath, options) => {
    try {
      const resolvedBundle = resolve(bundlePath)
      
      if (!existsSync(resolvedBundle)) {
        throw new Error(`Bundle not found: ${resolvedBundle}`)
      }
      
      console.log(`📦 Listing contents: ${resolvedBundle}`)
      
      let contents: string[]
      if (bundlePath.endsWith('.qpk')) {
        const qpkBundler = new QPKBundler()
        contents = await qpkBundler.listContents(resolvedBundle)
      } else {
        const zipBundler = new ZipBundler()
        contents = await zipBundler.listContents(resolvedBundle)
      }
      
      console.log(`\n📋 Found ${contents.length} entries:`)
      for (const entry of contents.sort()) {
        console.log(`  ${entry}`)
      }
      
    } catch (error) {
      console.error('❌ List failed:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Verify command
program
  .command('verify')
  .description('Verify bundle integrity')
  .argument('<bundle>', 'Bundle file to verify')
  .option('-v, --verbose', 'Verbose output')
  .action(async (bundlePath, options) => {
    try {
      const resolvedBundle = resolve(bundlePath)
      
      if (!existsSync(resolvedBundle)) {
        throw new Error(`Bundle not found: ${resolvedBundle}`)
      }
      
      console.log(`🔍 Verifying: ${resolvedBundle}`)
      
      let result: { valid: boolean; errors: string[] }
      if (bundlePath.endsWith('.qpk')) {
        const qpkBundler = new QPKBundler()
        result = await qpkBundler.verifyBundle(resolvedBundle)
      } else {
        const zipBundler = new ZipBundler()
        result = await zipBundler.verifyBundle(resolvedBundle)
      }
      
      if (result.valid) {
        console.log('✅ Bundle is valid')
      } else {
        console.log('❌ Bundle verification failed:')
        for (const error of result.errors) {
          console.log(`  - ${error}`)
        }
        process.exit(1)
      }
      
    } catch (error) {
      console.error('❌ Verification failed:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Init command - create sample config
program
  .command('init')
  .description('Initialize Quack configuration file')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    try {
      const configPath = resolve('quack.config.js')
      
      if (existsSync(configPath) && !options.force) {
        console.log('❌ Configuration file already exists. Use --force to overwrite.')
        process.exit(1)
      }
      
      const sampleConfig = `import { defineConfig } from '@quajs/quack'
import { ImageOptimizationPlugin, BundleAnalyzerPlugin, AESEncryptionPlugin } from '@quajs/quack/plugins'

export default defineConfig({
  source: './assets',
  output: './dist',
  format: 'auto', // 'zip' in development, 'qpk' in production
  compression: {
    level: 6,
    algorithm: 'lzma'
  },
  encryption: {
    enabled: process.env.NODE_ENV === 'production',
    algorithm: 'xor', // or 'custom' with plugin
    // key: process.env.QUACK_ENCRYPTION_KEY, // Automatic from environment
    // For custom encryption:
    // algorithm: 'custom',
    // plugin: new AESEncryptionPlugin(process.env.QUACK_ENCRYPTION_KEY)
  },
  plugins: [
    new ImageOptimizationPlugin({
      quality: 85,
      progressive: true
    }),
    new BundleAnalyzerPlugin()
  ],
  ignore: [
    '**/*.tmp',
    '**/.*',
    'node_modules/**'
  ]
})
`
      
      await writeFile(configPath, sampleConfig, 'utf8')
      console.log('✅ Configuration file created: quack.config.js')
      
    } catch (error) {
      console.log('❌ Failed to create configuration:', error.message)
      process.exit(1)
    }
  })

// Create patch command
program
  .command('patch')
  .description('Create patch bundle between two versions')
  .option('--from <version>', 'Source version number', parseInt)
  .option('--to <version>', 'Target version number', parseInt)
  .option('--from-build <build>', 'Source build number')
  .option('--to-build <build>', 'Target build number')
  .option('-o, --output <path>', 'Output patch file path')
  .option('-f, --format <format>', 'Patch format (zip|qpk)', 'zip')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      if (!options.from || !options.to) {
        console.error('❌ Both --from and --to version numbers are required')
        process.exit(1)
      }

      const patchGenerator = new PatchGenerator()
      const versionManager = new VersionManager()

      // Get build logs
      let fromBuildLog, toBuildLog

      if (options.fromBuild) {
        fromBuildLog = await versionManager.getBuildLog(options.fromBuild)
      } else {
        fromBuildLog = await versionManager.getBuildLogByVersion(options.from)
      }

      if (options.toBuild) {
        toBuildLog = await versionManager.getBuildLog(options.toBuild)
      } else {
        toBuildLog = await versionManager.getBuildLogByVersion(options.to)
      }

      if (!fromBuildLog) {
        console.error(`❌ Build log not found for version ${options.from}`)
        process.exit(1)
      }

      if (!toBuildLog) {
        console.error(`❌ Build log not found for version ${options.to}`)
        process.exit(1)
      }

      // Generate output path if not provided
      const outputPath = options.output || `patch-${options.from}-to-${options.to}.${options.format}`

      console.log(`🔧 Creating patch from version ${options.from} to ${options.to}`)
      console.log(`📦 Output: ${outputPath}`)

      await patchGenerator.generatePatch({
        fromVersion: options.from,
        toVersion: options.to,
        fromBuildLog,
        toBuildLog,
        output: resolve(outputPath),
        format: options.format as BundleFormat
      })

      console.log('✅ Patch created successfully!')

    } catch (error) {
      console.error('❌ Patch creation failed:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Version info command
program
  .command('version-info')
  .description('Show version and build information')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const versionManager = new VersionManager()
      const index = await versionManager.getBundleIndex()

      if (!index) {
        console.log('📦 No bundles found')
        return
      }

      console.log('📦 Bundle Version Information')
      console.log(`Current Version: ${index.currentVersion}`)
      console.log(`Current Build: ${index.currentBuild}`)
      
      if (index.latestBundle) {
        console.log(`\n📋 Latest Bundle:`)
        console.log(`  File: ${index.latestBundle.filename}`)
        console.log(`  Version: ${index.latestBundle.version}`)
        console.log(`  Build: ${index.latestBundle.buildNumber}`)
        console.log(`  Created: ${new Date(index.latestBundle.created).toLocaleString()}`)
        console.log(`  Size: ${formatBytes(index.latestBundle.size)}`)
      }

      if (options.verbose && index.previousBuilds.length > 0) {
        console.log(`\n📜 Previous Builds:`)
        for (const build of index.previousBuilds.slice(0, 5)) {
          console.log(`  v${build.version} (${build.buildNumber}) - ${formatBytes(build.size)} - ${new Date(build.created).toLocaleString()}`)
        }
      }

      if (index.availablePatches.length > 0) {
        console.log(`\n🔧 Available Patches: ${index.availablePatches.length}`)
        if (options.verbose) {
          for (const patch of index.availablePatches.slice(0, 5)) {
            console.log(`  ${patch.filename} (v${patch.fromVersion} → v${patch.toVersion}) - ${patch.changeCount} changes`)
          }
        }
      }

    } catch (error) {
      console.error('❌ Failed to show version info:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// List builds command
program
  .command('builds')
  .description('List all build logs')
  .option('-v, --verbose', 'Verbose output')
  .option('--limit <number>', 'Limit number of builds shown', '10')
  .action(async (options) => {
    try {
      const versionManager = new VersionManager()
      const index = await versionManager.getBundleIndex()

      if (!index) {
        console.log('📦 No builds found')
        return
      }

      const limit = parseInt(options.limit)
      const allBuilds = [index.latestBundle, ...index.previousBuilds]
        .filter(Boolean)
        .slice(0, limit)

      console.log(`📜 Build History (showing ${allBuilds.length} builds)`)
      console.log('')

      for (const build of allBuilds) {
        console.log(`📦 Version ${build.version} (${build.buildNumber})`)
        console.log(`   File: ${build.filename}`)
        console.log(`   Created: ${new Date(build.created).toLocaleString()}`)
        console.log(`   Size: ${formatBytes(build.size)}`)
        if (options.verbose) {
          console.log(`   Hash: ${build.hash}`)
        }
        console.log('')
      }

    } catch (error) {
      console.error('❌ Failed to list builds:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// List patches command
program
  .command('patches')
  .description('List available patches')
  .option('--from <version>', 'Filter by source version', parseInt)
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const patchGenerator = new PatchGenerator()
      const patches = await patchGenerator.listAvailablePatches(options.from)

      if (patches.length === 0) {
        if (options.from) {
          console.log(`🔧 No patches found from version ${options.from}`)
        } else {
          console.log('🔧 No patches available')
        }
        return
      }

      console.log(`🔧 Available Patches (${patches.length} found)`)
      console.log('')

      for (const patch of patches) {
        console.log(`📦 ${patch.filename}`)
        console.log(`   From: v${patch.fromVersion} → v${patch.toVersion}`)
        console.log(`   Changes: ${patch.changeCount}`)
        console.log(`   Created: ${new Date(patch.created).toLocaleString()}`)
        console.log(`   Size: ${formatBytes(patch.size)}`)
        if (options.verbose) {
          console.log(`   Patch Version: ${patch.patchVersion}`)
        }
        console.log('')
      }

    } catch (error) {
      console.error('❌ Failed to list patches:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Validate patch command
program
  .command('validate-patch')
  .description('Validate patch file')
  .argument('<patch>', 'Patch file to validate')
  .option('--target-version <version>', 'Target version to validate against', parseInt)
  .option('-v, --verbose', 'Verbose output')
  .action(async (patchPath, options) => {
    try {
      const resolvedPatch = resolve(patchPath)
      
      if (!existsSync(resolvedPatch)) {
        throw new Error(`Patch file not found: ${resolvedPatch}`)
      }

      console.log(`🔍 Validating patch: ${resolvedPatch}`)

      const patchGenerator = new PatchGenerator()
      const validation = await patchGenerator.validatePatch(resolvedPatch, options.targetVersion)

      if (validation.valid) {
        console.log('✅ Patch validation successful!')
        console.log('')
        console.log('📋 Changes this patch will make:')
        console.log(`   Add ${validation.changes.willAdd.length} files`)
        console.log(`   Modify ${validation.changes.willModify.length} files`)
        console.log(`   Delete ${validation.changes.willDelete.length} files`)

        if (options.verbose) {
          if (validation.changes.willAdd.length > 0) {
            console.log('\n➕ Files to be added:')
            validation.changes.willAdd.forEach(file => console.log(`   ${file}`))
          }
          if (validation.changes.willModify.length > 0) {
            console.log('\n📝 Files to be modified:')
            validation.changes.willModify.forEach(file => console.log(`   ${file}`))
          }
          if (validation.changes.willDelete.length > 0) {
            console.log('\n🗑️  Files to be deleted:')
            validation.changes.willDelete.forEach(file => console.log(`   ${file}`))
          }
        }
      } else {
        console.log('❌ Patch validation failed!')
        console.log('')
        console.log('🚫 Errors found:')
        validation.errors.forEach(error => console.log(`   ${error}`))
        process.exit(1)
      }

    } catch (error) {
      console.error('❌ Patch validation failed:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// ==== WORKSPACE COMMANDS ====

// Workspace init command
program
  .command('workspace:init')
  .description('Initialize a new workspace configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-n, --name <name>', 'Workspace name')
  .action(async (options) => {
    try {
      const configPath = resolve('quack.workspace.js')
      
      if (existsSync(configPath) && !options.force) {
        console.log('❌ Workspace configuration already exists. Use --force to overwrite.')
        process.exit(1)
      }

      const workspaceName = options.name || 'MyGameAssets'
      const sampleConfig = WorkspaceManager.createSampleConfig()
      sampleConfig.name = workspaceName

      const configContent = `import { defineConfig } from '@quajs/quack'

export default defineConfig({
  workspace: ${JSON.stringify(sampleConfig, null, 2).replace(/"([^"]+)":/g, '$1:')}
})
`
      
      await writeFile(configPath, configContent, 'utf8')
      console.log(`✅ Workspace configuration created: ${configPath}`)
      console.log(`📁 Workspace name: ${workspaceName}`)
      console.log(`📦 Bundles defined: ${sampleConfig.bundles.length}`)
      
    } catch (error) {
      console.error('❌ Failed to create workspace configuration:', error.message)
      process.exit(1)
    }
  })

// Workspace bundle command
program
  .command('workspace:bundle')
  .description('Build one or more bundles in workspace')
  .option('-b, --bundle <name>', 'Build specific bundle')
  .option('-a, --all', 'Build all bundles')
  .option('-c, --config <path>', 'Workspace configuration file path')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const workspaceManager = new WorkspaceManager()
      const workspaceConfig = await workspaceManager.loadConfig(options.config)

      if (!options.bundle && !options.all) {
        console.error('❌ Specify --bundle <name> or --all to build bundles')
        process.exit(1)
      }

      let bundlesToBuild = workspaceConfig.bundles
      if (options.bundle) {
        const bundle = workspaceManager.getBundleDefinition(options.bundle)
        if (!bundle) {
          console.error(`❌ Bundle "${options.bundle}" not found`)
          process.exit(1)
        }
        bundlesToBuild = [bundle]
      }

      // Build bundles in dependency order
      const buildOrder = workspaceManager.getBundlesBuildOrder()
      const selectedBundles = buildOrder.filter(b => bundlesToBuild.includes(b))

      console.log(`🚀 Building ${selectedBundles.length} bundles in workspace "${workspaceConfig.name}"`)

      for (const bundle of selectedBundles) {
        console.log(`\n📦 Building bundle: ${bundle.displayName || bundle.name}`)
        
        const bundleConfig = workspaceManager.createBundleConfig(bundle.name, {
          verbose: options.verbose
        })
        
        const bundler = new QuackBundler(bundleConfig)
        const stats = await bundler.bundle()
        
        console.log(`✅ Bundle "${bundle.name}" created successfully!`)
        console.log(`📊 ${stats.totalFiles} files, ${formatBytes(stats.totalSize)}, ${stats.processingTime}ms`)
      }

    } catch (error) {
      console.error('❌ Workspace bundle creation failed:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Workspace patch command
program
  .command('workspace:patch')
  .description('Create patch for specific bundle in workspace')
  .requiredOption('-b, --bundle <name>', 'Bundle name to patch')
  .option('--from <version>', 'Source version number', parseInt)
  .option('--to <version>', 'Target version number', parseInt)
  .option('--from-build <build>', 'Source build number')
  .option('--to-build <build>', 'Target build number')
  .option('-o, --output <path>', 'Output patch file path')
  .option('-f, --format <format>', 'Patch format (zip|qpk)', 'zip')
  .option('-c, --config <path>', 'Workspace configuration file path')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      if (!options.from || !options.to) {
        console.error('❌ Both --from and --to version numbers are required')
        process.exit(1)
      }

      const workspaceManager = new WorkspaceManager()
      await workspaceManager.loadConfig(options.config)

      const bundle = workspaceManager.getBundleDefinition(options.bundle)
      if (!bundle) {
        console.error(`❌ Bundle "${options.bundle}" not found in workspace`)
        process.exit(1)
      }

      const patchGenerator = new PatchGenerator(undefined, true) // workspace mode
      const { fromBuildLog, toBuildLog } = await patchGenerator.getWorkspaceBundleBuildLogs(
        options.bundle, 
        options.from, 
        options.to
      )

      if (!fromBuildLog) {
        console.error(`❌ Build log not found for bundle "${options.bundle}" version ${options.from}`)
        process.exit(1)
      }

      if (!toBuildLog) {
        console.error(`❌ Build log not found for bundle "${options.bundle}" version ${options.to}`)
        process.exit(1)
      }

      // Generate output path if not provided
      const outputPath = options.output || `${options.bundle}-patch-${options.from}-to-${options.to}.${options.format}`

      console.log(`🔧 Creating workspace patch for bundle "${options.bundle}" from version ${options.from} to ${options.to}`)
      console.log(`📦 Output: ${outputPath}`)

      await patchGenerator.generateWorkspaceBundlePatch({
        bundleName: options.bundle,
        fromVersion: options.from,
        toVersion: options.to,
        fromBuildLog,
        toBuildLog,
        output: resolve(outputPath),
        format: options.format as BundleFormat,
        workspaceIndex: null as any // Will be loaded by the generator
      })

      console.log('✅ Workspace patch created successfully!')

    } catch (error) {
      console.error('❌ Workspace patch creation failed:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Workspace status command
program
  .command('workspace:status')
  .description('Show workspace status and bundle information')
  .option('-c, --config <path>', 'Workspace configuration file path')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const workspaceManager = new WorkspaceManager()
      const workspaceConfig = await workspaceManager.loadConfig(options.config)
      const versionManager = new VersionManager(undefined, true)
      const workspaceIndex = await versionManager.getWorkspaceIndex()

      console.log(`📁 Workspace: ${workspaceConfig.name} (v${workspaceConfig.version})`)
      console.log(`📍 Root: ${workspaceManager.getWorkspaceRoot()}`)
      console.log(`📦 Bundles: ${workspaceConfig.bundles.length}`)

      if (workspaceIndex) {
        console.log(`🏗️  Current Version: ${workspaceIndex.currentVersion}`)
        console.log(`🔧 Global Patches: ${workspaceIndex.globalPatches.length}`)
      }

      console.log(`\n📋 Bundle Overview:`)
      for (const bundle of workspaceConfig.bundles) {
        const bundleInfo = workspaceIndex?.bundles[bundle.name]
        const status = bundleInfo ? `v${bundleInfo.currentVersion}` : 'Not built'
        
        console.log(`  📦 ${bundle.displayName || bundle.name}`)
        console.log(`     Source: ${bundle.source}`)
        console.log(`     Priority: ${bundle.priority}, Trigger: ${bundle.loadTrigger}`)
        console.log(`     Status: ${status}`)
        
        if (options.verbose && bundleInfo) {
          console.log(`     Latest: ${bundleInfo.latestBundle?.filename || 'None'}`)
          console.log(`     Patches: ${bundleInfo.availablePatches.length}`)
        }
        console.log('')
      }

    } catch (error) {
      console.error('❌ Failed to show workspace status:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Workspace patches command
program
  .command('workspace:patches')
  .description('List all patches in workspace')
  .option('-b, --bundle <name>', 'Filter by bundle name')
  .option('-c, --config <path>', 'Workspace configuration file path')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const patchGenerator = new PatchGenerator(undefined, true)
      const patches = await patchGenerator.listWorkspacePatches()

      let filteredBundlePatches = patches.bundlePatches
      if (options.bundle) {
        if (patches.bundlePatches[options.bundle]) {
          filteredBundlePatches = { [options.bundle]: patches.bundlePatches[options.bundle] }
        } else {
          filteredBundlePatches = {}
        }
      }

      console.log('🔧 Workspace Patches')
      console.log('')

      // Show bundle-specific patches
      for (const [bundleName, bundlePatches] of Object.entries(filteredBundlePatches)) {
        if (bundlePatches.length > 0) {
          console.log(`📦 Bundle: ${bundleName} (${bundlePatches.length} patches)`)
          for (const patch of bundlePatches) {
            console.log(`   ${patch.filename}`)
            console.log(`     v${patch.fromVersion} → v${patch.toVersion} (${patch.changeCount} changes)`)
            console.log(`     Created: ${new Date(patch.created).toLocaleString()}`)
            console.log(`     Size: ${formatBytes(patch.size)}`)
            console.log('')
          }
        }
      }

      // Show global patches
      if (patches.globalPatches.length > 0) {
        console.log(`🌍 Global Patches (${patches.globalPatches.length} patches)`)
        for (const patch of patches.globalPatches) {
          console.log(`   ${patch.filename}`)
          console.log(`     v${patch.fromVersion} → v${patch.toVersion} (${patch.changeCount} changes)`)
          console.log(`     Affects: ${patch.affectedBundles.join(', ')}`)
          console.log(`     Created: ${new Date(patch.created).toLocaleString()}`)
          console.log(`     Size: ${formatBytes(patch.size)}`)
          console.log('')
        }
      }

      if (Object.keys(filteredBundlePatches).length === 0 && patches.globalPatches.length === 0) {
        console.log('No patches found')
      }

    } catch (error) {
      console.error('❌ Failed to list workspace patches:', error.message)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

/**
 * Load configuration from file and command line options
 */
async function loadConfig(source: string, options: any): Promise<QuackConfig> {
  let config: QuackConfig = {
    source: resolve(source)
  }
  
  // Load config file
  if (options.config || existsSync('quack.config.js')) {
    const configPath = resolve(options.config || 'quack.config.js')
    
    try {
      // Dynamic import for ES modules
      const configModule = await import(`file://${configPath}`)
      const fileConfig = configModule.default || configModule
      config = { ...config, ...fileConfig }
    } catch (error) {
      if (options.config) {
        throw new Error(`Failed to load config file: ${configPath}`)
      }
      // Ignore if default config doesn't exist
    }
  }
  
  // Override with command line options
  if (options.output) {
    config.output = resolve(options.output)
  }
  
  if (options.format && options.format !== 'auto') {
    config.format = options.format
  }
  
  if (options.compress === false) {
    config.compression = { ...config.compression, algorithm: 'none' }
  }
  
  if (options.compressionLevel) {
    config.compression = { 
      ...config.compression, 
      level: parseInt(options.compressionLevel) 
    }
  }
  
  if (options.encrypt === false) {
    config.encryption = { ...config.encryption, enabled: false }
  }
  
  if (options.encryptionKey) {
    config.encryption = { ...config.encryption, key: options.encryptionKey }
  }
  
  if (options.verbose) {
    config.verbose = true
  }
  
  // Handle plugins (this would need a plugin registry in a real implementation)
  if (options.plugin) {
    config.plugins = config.plugins || []
    // For now, just log that plugins were requested
    console.log(`Plugins requested: ${options.plugin.join(', ')}`)
  }
  
  return config
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

// Parse command line arguments
program.parse()