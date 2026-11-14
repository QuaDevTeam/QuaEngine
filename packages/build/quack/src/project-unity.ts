import type { TargetBundleManifest } from '@quajs/native-contracts'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { arch, platform } from 'node:process'
import { assertTargetBundleManifest, createTargetCoreSelection } from '@quajs/native-contracts'
import { QuackBundler } from './core/bundler'
import { generateProjectAtomically } from './generated-project'
import { AssetPipelinePlugin } from './plugins/asset-pipeline'
import { createQuaProjectAssetTargets, loadQuaProjectConfig } from './project'
import { createQuaHostCompatibility } from './project-host-compatibility'
import { buildSceneScriptBundle } from './project-scene-bundle'
import { createSceneTargetEntry } from './project-scene-entry'
import { emitQuaTargetBundleManifest } from './project-target-bundle'
import { readQpkBundle, readQpkSummary } from './qpk-reader'
import { WorkspaceManager } from './workspace/workspace'

export interface QuaUnityWorkspaceBuildOptions {
  cwd: string
  outputDir?: string
  embedded?: boolean
  configPath?: string
  workspaceConfig?: string
  signal?: AbortSignal
  onLog?: (text: string) => void
}
export interface QuaUnityWorkspaceBuildResult {
  target: 'unity'
  artifact: string
  manifest: string
  hostPlatform: string
  embeddedPackage: string
  contentPrefix: string
}
interface UnityBundle {
  path: string
  identity: { name: string, version: number, buildNumber?: string, target?: string, hash: string }
}
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

export async function buildQuaProjectUnityWorkspace(options: QuaUnityWorkspaceBuildOptions): Promise<QuaUnityWorkspaceBuildResult> {
  const root = await realpath(resolve(options.cwd))
  const project = await loadQuaProjectConfig({ cwd: root, configPath: options.configPath })
  const target = project.targets.unity
  if (!target?.enabled)
    throw new Error('Unity generation requires targets.unity.build.entry.')
  if (!['darwin', 'linux', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch))
    throw new Error(`Unsupported Unity native plugin host: ${platform}/${arch}`)
  const destination = resolve(root, options.outputDir || target.projectDir)
  const require = createRequire(join(root, 'package.json'))
  const prefix = `QuaContent/${sha256(project.bundleId).slice(0, 16)}`
  await generateProjectAtomically({ root, destination, target: 'unity', bundleId: project.bundleId, signal: options.signal, async build(stage) {
    const hostPackage = dirname(require.resolve('@quajs/unity-host/package.json'))
    const packageDir = join(stage, 'Packages/com.quajs.unity-host')
    const content = join(packageDir, 'Runtime/Resources', prefix)
    const media = join(packageDir, 'Runtime/Resources/QuaMedia')
    await mkdir(join(stage, 'qua'), { recursive: true })
    await mkdir(media, { recursive: true })
    const workspace = new WorkspaceManager(root)
    await workspace.loadConfig(options.workspaceConfig, { projectConfig: options.configPath })
    const assetTarget = createQuaProjectAssetTargets(project).find(value => value.platform === 'unity')!
    const bundles: UnityBundle[] = []
    const buildNumber = `unity-${randomUUID()}`
    for (const definition of workspace.getBundlesBuildOrder()) {
      options.signal?.throwIfAborted()
      const bundler = new QuackBundler(workspace.createBundleConfig(definition.name, {
        output: join(stage, 'qua', `${definition.name}.qpk`),
        format: 'qpk',
        assetTargets: [],
        assetTarget,
        plugins: [new AssetPipelinePlugin()],
        ignore: ['**/native-app.mjs'],
        compression: { algorithm: 'none' },
        encryption: { enabled: false, algorithm: 'none' },
        versioning: { bundleVersion: 1, buildNumber, incrementVersion: false },
      }))
      await bundler.bundle(definition.name)
      const file = (await readdir(join(stage, 'qua'))).find(name => name.startsWith(`${definition.name}.`) && name.endsWith('.qpk'))
      if (!file)
        throw new Error(`Missing Unity QPK: ${definition.name}`)
      const path = join(stage, 'qua', file)
      const summary = await readQpkSummary(path)
      if (!summary.manifest || summary.errors.length)
        throw new Error(`Invalid Unity QPK: ${definition.name}`)
      bundles.push({ path: `qua/${file}`, identity: { name: summary.manifest.name, version: summary.manifest.bundleVersion, buildNumber: summary.manifest.buildNumber, target: summary.manifest.assetTarget?.name, hash: sha256(await readFile(path)) } })
      const { assets } = await readQpkBundle(path)
      for (const [name, bytes] of assets) {
        let extension = extname(name).toLowerCase()
        if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE')
          extension = '.wav'
        if (bytes.subarray(4, 8).toString('ascii') === 'ftyp')
          extension = '.mp4'
        if (['.ttf', '.otf', '.wav', '.mp3', '.ogg', '.mp4'].includes(extension))
          await writeFile(join(media, `${sha256(bytes)}${extension}`), bytes)
        if (['.woff', '.woff2', '.webm', '.ogv', '.flac', '.opus'].includes(extension))
          throw new Error(`Unity requires imported TTF/OTF, supported audio or MP4 media; convert ${name} in the Unity asset pipeline.`)
      }
    }
    const entry = createSceneTargetEntry('unity', resolve(root, target.build.entry), bundles, { name: project.name, bundleId: project.bundleId, version: project.version }, target.layout, target.build.profile === 'debug', options.embedded)
    const dependencies = await buildSceneScriptBundle({ root, artifactDir: stage, outputDir: join(stage, 'qua'), target: 'unity', entry, viteConfig: target.build.viteConfig ? resolve(root, target.build.viteConfig) : undefined })
    const manifest: TargetBundleManifest = { schemaVersion: 1, profile: target.build.profile, platform: 'unity', app: { bundleId: project.bundleId, version: project.version, buildNumber }, ...createTargetCoreSelection('unity'), dependencies, projectGraphs: [{ id: 'unity.workspace.post-bundle', kind: 'post-bundle', references: dependencies }] }
    await emitQuaTargetBundleManifest({ artifactDir: stage, expectedTarget: 'unity', manifest })
    assertTargetBundleManifest(manifest, { expectedTarget: 'unity' })
    const compatibility = createQuaHostCompatibility('unity', target.editorVersion)
    await writeFile(join(stage, 'qua-host-compatibility.json'), json(compatibility))
    // Managed sources share runtime/ with the Rust crate in the source package.
    // Copy explicitly: Runtime/ only appeared to work on case-insensitive macOS.
    await mkdir(join(packageDir, 'Runtime'), { recursive: true })
    for (const file of ['QuaEngineHost.cs', 'NativeVm.cs', 'ProjectionNode.cs', 'QuaEngine.Unity.asmdef'])
      await cp(join(hostPackage, 'runtime', file), join(packageDir, 'Runtime', file))
    await cp(join(hostPackage, 'Editor'), join(packageDir, 'Editor'), { recursive: true })
    await cp(join(hostPackage, 'unity-package.json'), join(packageDir, 'package.json'))
    await cp(join(hostPackage, 'THIRD-PARTY-NOTICES.md'), join(packageDir, 'THIRD-PARTY-NOTICES.md'))
    await mkdir(join(packageDir, 'Native~'), { recursive: true })
    for (const file of ['Cargo.toml', 'Cargo.lock', 'src']) await cp(join(hostPackage, 'runtime', file), join(packageDir, 'Native~', file), { recursive: true })
    await buildNativePlugin(root, hostPackage, packageDir, target.build.profile === 'release', options)
    await mkdir(join(content, 'qua'), { recursive: true })
    for (const file of await readdir(join(stage, 'qua')))
      await rename(join(stage, 'qua', file), join(content, 'qua', `${file}${file.endsWith('.js') ? '.txt' : '.bytes'}`))
    await rm(join(stage, 'qua'), { recursive: true })
    const runtime = await readFile(join(content, 'qua/runtime.js.txt'))
    await writeFile(join(content, 'target-bundle-manifest.json.txt'), json(manifest))
    await writeFile(join(content, 'session.json.txt'), json({ schemaVersion: 1, target: 'unity', bundleId: project.bundleId, runtimeHash: sha256(runtime), host: `${platform}-${arch}`, editorVersion: target.editorVersion }))
    await writeFile(join(packageDir, 'qua-host-compatibility.json'), json(compatibility))
    await writeFile(join(packageDir, 'Editor/GeneratedProject.cs'), createUnityEditorSetup(prefix, project.name, target.layout === 'portrait', project.bundleId))
    await mkdir(join(stage, 'ProjectSettings'), { recursive: true })
    await mkdir(join(stage, 'Assets'), { recursive: true })
    await writeFile(join(stage, 'ProjectSettings/ProjectVersion.txt'), `m_EditorVersion: ${target.editorVersion}\n`)
    await writeFile(join(stage, 'Packages/manifest.json'), json({ dependencies: { 'com.unity.ugui': '2.0.0', 'com.unity.nuget.newtonsoft-json': '3.2.2', 'com.unity.modules.audio': '1.0.0', 'com.unity.modules.video': '1.0.0', 'com.unity.modules.ui': '1.0.0', 'com.unity.modules.imgui': '1.0.0', 'com.unity.modules.imageconversion': '1.0.0' } }))
    await emitStableUnityMetadata(packageDir)
    await writeFile(join(stage, 'README.md'), `# ${project.name}: Unity\n\nGenerated for Unity ${target.editorVersion} (Unity 6.3 LTS series). See qua-host-compatibility.json for declared bounds and native plugin OS/architecture. SDK import, visible rendering, media, Player and IL2CPP acceptance must be run in Unity; generation does not claim those passed.\n\nOpen this directory in the matching Unity Editor. The generated-project marker allows the package Editor helper to create Assets/QuaEngine/Main.unity and its Canvas on first import. Open that scene and enter Play Mode. Packages/packages-lock.json is authored by Unity Package Manager on import; retain and review it for distribution.\n\nFor an existing Unity application, install only Packages/com.quajs.unity-host as a local UPM package. No project settings or scenes are changed without the generated-project marker. Add QuaEngineHost under your own Canvas/RectTransform, set autoStart=false and contentPrefix=${prefix}, set a stable account storageNamespace, then call StartModule()/StopModule(). Closing a module never calls Application.Quit. Each host owns a separate QuickJS VM. Do not copy this entire generated project over an authoring project.\n\nQPKs are build-time static only. Imported audio/video/fonts are content-addressed copies derived from verified QPK bytes; keep Runtime/Resources with the package. PNG/JPEG images decode from QPK bytes. Base uGUI projection does not claim effect, capture, text-shaping or all control parity. Unsupported effects warn. Native plugins are generated for ${platform}/${arch} only; build and validate on each additional host before shipping.\n\nRegenerate from the QuaEngine source with quack project build --target unity --all. Generated output is disposable; preserve authored integration code in the host project.\n`)
  } })
  return { target: 'unity', artifact: destination, manifest: join(destination, 'target-bundle-manifest.json'), embeddedPackage: join(destination, 'Packages/com.quajs.unity-host'), contentPrefix: prefix, hostPlatform: `${platform}-${arch}` }
}

async function buildNativePlugin(root: string, hostPackage: string, packageDir: string, release: boolean, options: QuaUnityWorkspaceBuildOptions): Promise<void> {
  const output = join(root, 'node_modules/.cache/qua-unity-runtime')
  await new Promise<void>((resolve, reject) => {
    const child = spawn('cargo', ['build', '--locked', '--manifest-path', join(hostPackage, 'runtime/Cargo.toml'), ...(release ? ['--release'] : [])], { signal: options.signal, env: { ...process.env, CARGO_TARGET_DIR: output }, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (data) => {
        const text = data.toString()
        log = (log + text).slice(-16000)
        options.onLog?.(text)
      })
    }
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Unity native runtime build failed (${code}):\n${log}`)))
  })
  const file = platform === 'darwin' ? 'libquajs_unity_runtime.dylib' : platform === 'win32' ? 'quajs_unity_runtime.dll' : 'libquajs_unity_runtime.so'
  const destination = join(packageDir, 'Runtime/Plugins', `${platform}-${arch}`, file)
  await mkdir(dirname(destination), { recursive: true })
  await cp(join(output, release ? 'release' : 'debug', file), destination)
  const os = platform === 'darwin' ? 'OSX' : platform === 'win32' ? 'Windows' : 'Linux'
  const standalone = platform === 'darwin' ? 'OSXUniversal' : platform === 'win32' ? 'Win64' : 'Linux64'
  const cpu = arch === 'arm64' ? 'ARM64' : 'x86_64'
  await writeFile(`${destination}.meta`, `fileFormatVersion: 2\nguid: ${sha256(`unity/${file}/${platform}/${arch}`).slice(0, 32)}\nPluginImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  isPreloaded: 0\n  isOverridable: 0\n  isExplicitlyReferenced: 0\n  validateReferences: 1\n  platformData:\n  - first:\n      Any: \n    second:\n      enabled: 0\n      settings: {}\n  - first:\n      Editor: Editor\n    second:\n      enabled: 1\n      settings: {CPU: ${cpu}, OS: ${os}}\n  - first:\n      Standalone: ${standalone}\n    second:\n      enabled: 1\n      settings: {CPU: ${cpu}}\n`)
}

async function emitStableUnityMetadata(directory: string, prefix = ''): Promise<void> {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name.endsWith('.meta') || item.name.endsWith('~'))
      continue
    const name = `${prefix}/${item.name}`
    const file = join(directory, item.name)
    if (item.isDirectory()) {
      await emitStableUnityMetadata(file, name)
    }
    else if (item.name.endsWith('.cs') || item.name.endsWith('.asmdef')) {
      const importer = item.name.endsWith('.cs') ? 'MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}' : 'AssemblyDefinitionImporter:\n  externalObjects: {}'
      await writeFile(`${file}.meta`, `fileFormatVersion: 2\nguid: ${sha256(`com.quajs.unity-host${name}`).slice(0, 32)}\n${importer}\n`)
    }
  }
}

function createUnityEditorSetup(prefix: string, name: string, portrait: boolean, bundleId: string): string {
  return `using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
namespace QuaEngine.Unity.Editor {
public static class GeneratedProject {
  [InitializeOnLoadMethod] static void Initialize(){ EditorApplication.delayCall += CreateScene; }
  public static void CreateScene(){
    string root=Path.GetDirectoryName(Application.dataPath);
    string marker=Path.Combine(root,".qua-generated.json");
    if(!File.Exists(marker))return;
    var metadata=Newtonsoft.Json.Linq.JObject.Parse(File.ReadAllText(marker));
    if(metadata.Value<string>("target")!="unity"||metadata.Value<string>("bundleId")!=${JSON.stringify(bundleId)})return;
    string path="Assets/QuaEngine/Main.unity";
    if(File.Exists(path))return;
    if(EditorApplication.isCompiling||EditorApplication.isUpdating){EditorApplication.delayCall+=CreateScene;return;}
    Directory.CreateDirectory("Assets/QuaEngine");
    var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
    var camera=new GameObject("Camera",typeof(Camera),typeof(AudioListener));
    camera.GetComponent<Camera>().clearFlags=CameraClearFlags.SolidColor;camera.GetComponent<Camera>().backgroundColor=Color.black;
    var canvasObject=new GameObject("Canvas",typeof(RectTransform),typeof(Canvas),typeof(CanvasScaler));
    canvasObject.GetComponent<Canvas>().renderMode=RenderMode.ScreenSpaceOverlay;
    var region=new GameObject("QuaEngine",typeof(RectTransform));var rect=(RectTransform)region.transform;
    rect.SetParent(canvasObject.transform,false);rect.anchorMin=Vector2.zero;rect.anchorMax=Vector2.one;rect.offsetMin=rect.offsetMax=Vector2.zero;
    var host=region.AddComponent<QuaEngineHost>();host.contentPrefix=${JSON.stringify(prefix)};host.autoStart=true;
    PlayerSettings.productName=${JSON.stringify(name)};PlayerSettings.defaultScreenWidth=${portrait ? 540 : 1280};PlayerSettings.defaultScreenHeight=${portrait ? 1170 : 720};
    EditorSceneManager.SaveScene(scene,path);EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(path,true)};AssetDatabase.SaveAssets();
  }
}}
`
}
