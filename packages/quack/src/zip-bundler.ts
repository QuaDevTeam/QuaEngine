import { readFile, mkdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { ZipFile } from 'yazl'
import yauzl from 'yauzl'
import { createLogger } from '@quajs/logger'
import type { AssetInfo, BundleManifest, AssetContext, QuackPlugin } from './types.js'

const logger = createLogger('quack:zip-bundler')

export class ZipBundler {
  private plugins: QuackPlugin[]

  constructor(plugins: QuackPlugin[] = []) {
    this.plugins = plugins
  }

  /**
   * Create ZIP bundle from assets
   */
  async createBundle(
    assets: AssetInfo[],
    manifest: BundleManifest,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`Creating ZIP bundle: ${outputPath}`)
      
      const zip = new ZipFile()
      let processedCount = 0
      
      // Add manifest first
      const manifestJson = JSON.stringify(manifest, null, 2)
      zip.addBuffer(Buffer.from(manifestJson, 'utf8'), 'manifest.json', {
        mtime: new Date(),
        compress: true
      })

      // Process assets in batches to avoid memory issues
      this.processAssetsBatch(assets, zip)
        .then(() => {
          // Finalize the ZIP
          zip.outputStream.pipe(createWriteStream(outputPath))
            .on('error', reject)
            .on('close', () => {
              logger.info(`ZIP bundle created successfully: ${outputPath}`)
              resolve()
            })
          
          zip.end()
        })
        .catch(reject)
    })
  }

  /**
   * Process assets in batches
   */
  private async processAssetsBatch(assets: AssetInfo[], zip: ZipFile): Promise<void> {
    const BATCH_SIZE = 50
    
    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
      const batch = assets.slice(i, i + BATCH_SIZE)
      await this.processBatch(batch, zip)
      
      const progress = Math.round(((i + batch.length) / assets.length) * 100)
      logger.info(`Processing assets: ${progress}% (${i + batch.length}/${assets.length})`)
    }
  }

  /**
   * Process a batch of assets
   */
  private async processBatch(assets: AssetInfo[], zip: ZipFile): Promise<void> {
    const promises = assets.map(asset => this.processAsset(asset, zip))
    await Promise.all(promises)
  }

  /**
   * Process a single asset
   */
  private async processAsset(asset: AssetInfo, zip: ZipFile): Promise<void> {
    try {
      // Read asset file
      let buffer = await readFile(asset.path)
      
      // Create asset context for plugins
      const context: AssetContext = {
        asset,
        buffer,
        metadata: {}
      }

      // Apply plugins
      for (const plugin of this.plugins) {
        if (plugin.processAsset) {
          await plugin.processAsset(context)
        }
      }

      // Add to ZIP with proper path structure
      const zipPath = this.getZipPath(asset)
      zip.addBuffer(context.buffer, zipPath, {
        mtime: new Date(),
        compress: true
      })

      logger.debug(`Added asset to ZIP: ${zipPath}`)
    } catch (error) {
      logger.error(`Failed to process asset: ${asset.relativePath}`, error)
      throw error
    }
  }

  /**
   * Get the path for asset in ZIP file
   */
  private getZipPath(asset: AssetInfo): string {
    // Organize assets by type in the ZIP
    const basePath = `assets/${asset.type}`
    
    if (asset.type === 'characters') {
      // characters/alice/normal.png -> assets/characters/alice/normal.png
      return join(basePath, asset.relativePath.replace(/^characters\//, '')).replace(/\\/g, '/')
    }
    
    // For other types, remove the type prefix if it exists
    let relativePath = asset.relativePath
    if (relativePath.startsWith(`${asset.type}/`)) {
      relativePath = relativePath.substring(asset.type.length + 1)
    }
    
    return join(basePath, relativePath).replace(/\\/g, '/')
  }

  /**
   * Extract ZIP bundle
   */
  async extractBundle(zipPath: string, outputDir: string): Promise<BundleManifest> {
    return new Promise((resolve, reject) => {
      logger.info(`Extracting ZIP bundle: ${zipPath}`)
      
      yauzl.open(zipPath, { lazyEntries: true }, (err: Error | null, zipfile: any) => {
        if (err) {
          reject(err)
          return
        }

        let manifest: BundleManifest | null = null
        let extractedCount = 0
        
        zipfile.readEntry()
        
        zipfile.on('entry', (entry: any) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory entry
            zipfile.readEntry()
            return
          }

          // Extract file
          zipfile.openReadStream(entry, (err: Error | null, readStream: any) => {
            if (err) {
              reject(err)
              return
            }

            const outputPath = join(outputDir, entry.fileName)
            
            // Ensure directory exists
            mkdir(dirname(outputPath), { recursive: true }).then(() => {
              const writeStream = createWriteStream(outputPath)
              readStream.pipe(writeStream)
              
              writeStream.on('close', async () => {
                extractedCount++
                
                // If this is the manifest, parse it
                if (entry.fileName === 'manifest.json') {
                  try {
                    const manifestContent = await readFile(outputPath, 'utf8')
                    manifest = JSON.parse(manifestContent)
                  } catch (error) {
                    logger.warn('Failed to parse manifest:', error)
                  }
                }
                
                zipfile.readEntry()
              })
              
              writeStream.on('error', reject)
            }).catch(reject)
          })
        })
        
        zipfile.on('end', () => {
          logger.info(`Extracted ${extractedCount} files from ZIP bundle`)
          
          if (!manifest) {
            reject(new Error('Manifest not found in bundle'))
            return
          }
          
          resolve(manifest)
        })
        
        zipfile.on('error', reject)
      })
    })
  }

  /**
   * List contents of ZIP bundle
   */
  async listContents(zipPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const entries: string[] = []
      
      yauzl.open(zipPath, { lazyEntries: true }, (err: Error | null, zipfile: any) => {
        if (err) {
          reject(err)
          return
        }

        zipfile.readEntry()
        
        zipfile.on('entry', (entry: any) => {
          entries.push(entry.fileName)
          zipfile.readEntry()
        })
        
        zipfile.on('end', () => {
          resolve(entries)
        })
        
        zipfile.on('error', reject)
      })
    })
  }

  /**
   * Verify ZIP bundle integrity
   */
  async verifyBundle(zipPath: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const contents = await this.listContents(zipPath)
      const errors: string[] = []
      
      // Check for manifest
      if (!contents.includes('manifest.json')) {
        errors.push('Missing manifest.json')
      }
      
      // Check for assets directory
      const hasAssets = contents.some(path => path.startsWith('assets/'))
      if (!hasAssets) {
        errors.push('No assets found in bundle')
      }
      
      return {
        valid: errors.length === 0,
        errors
      }
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to verify bundle: ${error.message}`]
      }
    }
  }
}