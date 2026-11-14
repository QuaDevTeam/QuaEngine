import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { generateProjectAtomically } from './generated-project'
import { loadQuaProjectConfig } from './project'
import { buildQuaProjectCocosWorkspace } from './project-cocos'
import { buildEmbeddedNative } from './project-embedded-native'
import { buildEmbeddedWeb } from './project-embedded-web'
import { buildQuaProjectGodotWorkspace } from './project-godot'
import { buildQuaProjectUnityWorkspace } from './project-unity'

export interface QuaEmbeddedModuleBuildOptions {
  cwd: string
  target: 'web' | 'cocos' | 'godot' | 'unity' | 'native'
  configPath?: string
  workspaceConfig?: string
  outputDir?: string
  signal?: AbortSignal
  onLog?: (text: string) => void
}
export interface QuaEmbeddedModuleBuildResult {
  target: QuaEmbeddedModuleBuildOptions['target']
  artifact: string
  manifest: string
  module: string
}
/** Deliver only embeddable files; the parent application's startup shell is never copied. */
export async function buildQuaProjectEmbeddedModule(options: QuaEmbeddedModuleBuildOptions): Promise<QuaEmbeddedModuleBuildResult> {
  const root = resolve(options.cwd)
  const project = await loadQuaProjectConfig({ cwd: root, configPath: options.configPath })
  const target = options.target
  if (!['web', 'cocos', 'godot', 'unity', 'native'].includes(target))
    throw new Error('Embedded modules support Web, Cocos, Godot, Unity and Native.')
  const destination = resolve(root, options.outputDir || `dist/embedded/${target}`)
  const id = createHash('sha256').update(project.bundleId).digest('hex').slice(0, 16)
  await generateProjectAtomically({ root, destination, target: `embedded-${target}`, bundleId: project.bundleId, signal: options.signal, async build(stage) {
    let entry: Record<string, unknown>
    if (target === 'web') {
      await buildEmbeddedWeb(root, stage, project, options)
      entry = { html: 'index.html', parentSdk: 'client.js', open: 'mountEmbeddedFrame', originPolicy: project.targets.web.build?.embeddedOrigins }
    }
    else if (target === 'native') {
      entry = await buildEmbeddedNative(root, stage, project, options)
    }
    else {
      const workspace = join(stage, '.workspace')
      const common = { ...options, outputDir: workspace, embedded: true }
      if (target === 'godot') {
        await buildQuaProjectGodotWorkspace(common)
        const files = join(stage, 'project-files')
        const content = join(files, `qua_modules/${id}/content`)
        await mkdir(content, { recursive: true })
        await cp(join(workspace, 'addons'), join(files, 'addons'), { recursive: true })
        await rm(join(files, 'addons/quaengine/runtime'), { recursive: true, force: true })
        await cp(join(workspace, 'qua'), join(content, 'qua'), { recursive: true })
        for (const file of ['target-bundle-manifest.json', 'qua-host-compatibility.json'])
          await cp(join(workspace, file), join(content, file))
        const modulePath = `qua_modules/${id}/module.tscn`
        await writeFile(join(files, modulePath), `[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://addons/quaengine/host.gd" id="1"]\n[node name="QuaStoryModule" type="Control"]\nlayout_mode = 0\noffset_right = 640.0\noffset_bottom = 360.0\nscript = ExtResource("1")\nauto_start = false\nstandalone = false\ncontent_root = "res://qua_modules/${id}/content/"\n`)
        await writeFile(join(stage, 'export-filter.txt'), `qua_modules/${id}/content/qua/*,qua_modules/${id}/content/*.json\n`)
        entry = { projectFiles: 'project-files', scene: `res://${modulePath}`, open: 'open_story(session_id, parameters)', cancel: 'cancel_story()', result: 'story_result', close: 'module_closed', exportIncludeFilter: 'export-filter.txt' }
      }
      else if (target === 'cocos') {
        await buildQuaProjectCocosWorkspace(common)
        const assets = join(stage, 'project-files/assets')
        await mkdir(join(assets, 'qua-runtime'), { recursive: true })
        await cp(join(workspace, 'assets/resources'), join(assets, 'resources'), { recursive: true })
        for (const file of ['runtime.js', 'runtime.js.meta'])
          await cp(join(workspace, 'assets/qua-runtime', file), join(assets, 'qua-runtime', file))
        await mkdir(join(stage, 'native'), { recursive: true })
        for (const name of ['QuaCreatorAudio.mm', 'QuaCreatorVideo.mm'])
          await cp(join(workspace, 'native/engine/common/Classes', name), join(stage, 'native', name))
        // eslint-disable-next-line no-template-curly-in-string -- literal CMake variable, not JavaScript
        await writeFile(join(stage, 'native/integration.cmake'), 'if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")\n list(APPEND CC_COMMON_SOURCES "${CMAKE_CURRENT_LIST_DIR}/QuaCreatorAudio.mm" "${CMAKE_CURRENT_LIST_DIR}/QuaCreatorVideo.mm")\n link_libraries("-framework AVFoundation" "-framework CoreVideo" "-framework CoreMedia")\nendif()\n')
        entry = { projectFiles: 'project-files', runtime: 'assets/qua-runtime/runtime.js', open: 'start(parentNode, { request, input, layout, onMessage })', cancel: 'session.cancel()', result: 'session.result', close: 'session.destroy()', nativeIntegration: 'native/integration.cmake' }
      }
      else {
        const result = await buildQuaProjectUnityWorkspace(common)
        const packagePath = 'Packages/com.quajs.unity-host'
        await cp(result.embeddedPackage, join(stage, packagePath), { recursive: true })
        await rm(join(stage, packagePath, 'Editor/GeneratedProject.cs'), { force: true })
        await rm(join(stage, packagePath, 'Editor/GeneratedProject.cs.meta'), { force: true })
        entry = { package: packagePath, component: 'QuaEngine.Unity.QuaEngineHost', contentPrefix: result.contentPrefix, open: 'OpenStory(sessionId, parametersJson)', cancel: 'CancelStory()', result: 'StoryResult', close: 'Closed' }
      }
      for (const file of ['target-bundle-manifest.json', 'qua-host-compatibility.json', 'retained-module-graph.json'])
        await cp(join(workspace, file), join(stage, file))
      await rm(workspace, { recursive: true })
    }
    await writeFile(join(stage, 'README.md'), `# ${project.name}: embedded ${target} module\n\nThis is a generated module, not an application startup project. Read module.json for the selected target, entrypoints, file hashes and protocol. Preserve project-files paths and metadata; check all collisions before merging into a parent. No ProjectSettings, Game class, startup scene or application exit ownership is supplied.\n\nOpen with a unique sessionId, a stable product/account storageNamespace and JSON parameters. The business bootstrap receives services.embedding, returns engine/destroy, and may expose onEmbeddedOpen(context) and beforeEmbeddedResult(outcome). Call context.complete(JSON) only after business completion. beforeEmbeddedResult must await required persistence. One terminal result wins races; result status is completed, cancelled or error. Closing is separate and occurs after resource teardown. No automatic reward, payment, arbitrary evaluation or store mutation API exists.\n\n${target === 'native' ? 'Link one matching SDK version using lib/ and include/qua_native.h. Create with an independently pinned module.json SHA-256 and explicit writable storageDirectory. Attach a parent-retained CAMetalLayer before open; the main-thread parent owns tick/poll, focus, resize, navigation and final signing. Close, tick/poll until closed, then destroy; abort is deliberate forced eviction without a final save guarantee. Read native-sdk.md and examples/macos-parent.m for exact contracts, storage lock recovery, runpaths and unsupported platforms/input.\n' : target === 'godot' ? 'Copy project-files into the parent after reviewing collisions, instantiate the scene in module.json, set storage_namespace, connect story_result/module_closed and call open_story. Merge export-filter.txt into the parent export preset include_filter. Addon binaries match only the build host; rebuild for other platforms.\n' : target === 'cocos' ? 'Copy the project-files resources/runtime after reviewing paths and UUIDs. Call start with request {protocol:"qua-embedded",version:1,type:"open",sessionId,storageNamespace,parameters}, plus parent-owned input and layout bridges. Await session.result and session.destroy(). For macOS merge native/integration.cmake and registerQuaCreatorAudio/registerQuaCreatorVideo into the existing parent native build; never replace its Game class. Native integration is SDK-specific.\n' : target === 'unity' ? 'Install the local UPM package from module.json. Mount QuaEngineHost under a host Canvas, set autoStart=false, contentPrefix and storageNamespace, connect StoryResult/Closed, then OpenStory(sessionId, parametersJson). No automatic scene/ProjectSettings editor helper is included. Unity C# compilation/Editor/Player/IL2CPP acceptance remains required; Rust fixtures do not qualify it.\n' : 'Deploy this directory over HTTP(S). Import mountEmbeddedFrame from client.js in the parent. The child accepts only configured exact parent origins and the parent checks child origin/source/sessionId. Pass container,url,sessionId,storageNamespace,parameters; await ready, result, closed; destroy() requests cancellation and waits for cleanup with a bounded timeout.\n'}\nStatic QPK only; all narrative state remains engine-owned and internal traffic uses pipeline. Hiding a container is not a universal pause. Content updates replace a complete generated module after closing active sessions; namespaces isolate progress. SDK compatibility is a declaration, not proof of parent-project/device acceptance.\n`)
    const files = await moduleInventory(stage)
    await writeFile(join(stage, 'module.json'), `${JSON.stringify({ schemaVersion: 1, kind: 'qua-embedded-module', target, moduleId: project.bundleId, version: project.version, protocol: { name: 'qua-embedded', version: 1, maxJsonBytes: 65536, commands: ['open', 'cancel'], messages: ['ready', 'result', 'error', 'closed'] }, entry, files }, null, 2)}\n`)
  } })
  return { target, artifact: destination, manifest: join(destination, 'target-bundle-manifest.json'), module: join(destination, 'module.json') }
}
async function moduleInventory(root: string, prefix = ''): Promise<{
  path: string
  size: number
  sha256: string
}[]> {
  const files = []
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${item.name}` : item.name
    const file = join(root, path)
    if ((await lstat(file)).isSymbolicLink())
      throw new Error('Embedded modules must not contain source symlinks')
    if (item.isDirectory()) {
      files.push(...await moduleInventory(root, path))
    }
    else {
      const bytes = await readFile(file)
      files.push({ path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
