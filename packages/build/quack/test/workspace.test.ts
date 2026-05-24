import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceManager } from '../src/workspace/workspace'

const tempDirs: string[] = []

describe('WorkspaceManager', () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it.each([
    '.js',
    '.json',
    '.ts',
  ])('loads workspace config files with %s extension', async (extension) => {
    const root = await createWorkspaceRoot()
    const config = createWorkspaceConfig(`workspace-${extension.slice(1)}`)
    const configPath = join(root, `quack.workspace${extension}`)

    await writeFile(configPath, renderWorkspaceConfig(extension, config), 'utf8')

    const workspace = new WorkspaceManager(root)
    const loaded = await workspace.loadConfig()

    expect(loaded.name).toBe(config.name)
    expect(loaded.version).toBe(config.version)
    expect(loaded.bundles).toHaveLength(1)
    expect(loaded.bundles[0].name).toBe('core')
    expect(loaded.output).toBe('./dist')
  })

  it('prefers the TypeScript workspace config when both JS and TS files exist', async () => {
    const root = await createWorkspaceRoot()

    await writeFile(join(root, 'quack.workspace.js'), renderWorkspaceConfig('.js', createWorkspaceConfig('js-workspace')), 'utf8')
    await writeFile(join(root, 'quack.workspace.ts'), renderWorkspaceConfig('.ts', createWorkspaceConfig('ts-workspace')), 'utf8')

    const workspace = new WorkspaceManager(root)
    const loaded = await workspace.loadConfig()

    expect(loaded.name).toBe('ts-workspace')
  })
})

async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'quack-workspace-'))
  tempDirs.push(root)
  await mkdir(join(root, 'assets/core'), { recursive: true })
  return root
}

function createWorkspaceConfig(name: string) {
  return {
    name,
    version: '1.0.0',
    bundles: [
      {
        name: 'core',
        source: './assets/core',
      },
    ],
    output: './dist',
  }
}

function renderWorkspaceConfig(extension: '.js' | '.json' | '.ts', config: ReturnType<typeof createWorkspaceConfig>): string {
  const json = JSON.stringify(config, null, 2)

  if (extension === '.json') {
    return `${json}\n`
  }

  if (extension === '.ts') {
    return `interface WorkspaceBundle {
  name: string
  source: string
}

interface WorkspaceConfig {
  name: string
  version: string
  bundles: WorkspaceBundle[]
  output: string
}

const workspaceConfig: WorkspaceConfig = ${json}

export default workspaceConfig
`
  }

  return `export default ${json}
`
}
