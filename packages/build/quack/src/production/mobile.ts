import type { NormalizedQuaProjectConfig } from '../project'
import type { BuildRunner } from './process'
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import sharp from 'sharp'
import { xml } from './macos'

export const IOS_DEPLOYMENT_TARGET = '15.4'

type Native = NonNullable<NormalizedQuaProjectConfig['targets']['native']>

function portrait(native: Native): boolean {
  return (typeof native.layout === 'string' ? native.layout : native.layout.preset) === 'portrait'
}

/** Apple bundles contain a regular Winit executable and its original, pinned resource directory. */
export async function buildIosApp(project: NormalizedQuaProjectConfig, stage: string, name: string, icon: string, simulator: boolean, run: BuildRunner): Promise<string> {
  const native = project.targets.native!
  const app = join(stage, name)
  const sdk = simulator ? 'iphonesimulator' : 'iphoneos'
  const catalog = join(stage, 'Assets.xcassets')
  const icons = join(catalog, 'AppIcon.appiconset')
  await mkdir(icons, { recursive: true })
  await writeFile(join(catalog, 'Contents.json'), JSON.stringify({ info: { version: 1, author: 'quack' } }))
  await sharp(icon).resize(1024, 1024, { fit: 'contain', background: '#000' }).flatten({ background: '#000' }).png().toFile(join(icons, 'icon.png'))
  await writeFile(join(icons, 'Contents.json'), JSON.stringify({ images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { version: 1, author: 'quack' } }))
  const partial = join(stage, 'asset-info.plist')
  await run('xcrun', ['actool', catalog, '--compile', app, '--platform', sdk, '--minimum-deployment-target', IOS_DEPLOYMENT_TARGET, '--target-device', 'iphone', '--target-device', 'ipad', '--app-icon', 'AppIcon', '--output-partial-info-plist', partial])
  const iconMetadata = JSON.parse(await run('plutil', ['-convert', 'json', '-o', '-', partial]))
  const info = {
    ...iconMetadata,
    CFBundleDevelopmentRegion: 'en',
    CFBundleDisplayName: project.name,
    CFBundleName: project.name,
    CFBundleIdentifier: native.app.bundleId,
    CFBundleShortVersionString: native.app.version,
    CFBundleVersion: native.app.buildNumber,
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundlePackageType: 'APPL',
    CFBundleExecutable: 'game',
    CFBundleSupportedPlatforms: [simulator ? 'iPhoneSimulator' : 'iPhoneOS'],
    DTPlatformName: sdk,
    DTSDKName: sdk + (await run('xcrun', ['--sdk', sdk, '--show-sdk-version'])).trim(),
    MinimumOSVersion: IOS_DEPLOYMENT_TARGET,
    LSRequiresIPhoneOS: true,
    UIDeviceFamily: [1, 2],
    UILaunchScreen: {},
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{ UISceneConfigurationName: 'Game', UISceneDelegateClassName: 'QuaGameSceneDelegate' }],
      },
    },
    UIStatusBarHidden: true,
    UISupportedInterfaceOrientations: portrait(native) ? ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown'] : ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'],
    GCSupportedGameControllers: [{ ProfileName: 'ExtendedGamepad' }],
  }
  await writeFile(join(app, 'Info.plist'), JSON.stringify(info))
  await run('plutil', ['-convert', 'binary1', join(app, 'Info.plist')])
  await rm(catalog, { recursive: true })
  await rm(partial)
  if (simulator) {
    await run('codesign', ['--force', '--sign', '-', app])
    await run('codesign', ['--verify', '--strict', app])
    return name
  }
  const archive = join(stage, 'Game.xcarchive')
  const relative = join('Game.xcarchive', 'Products', 'Applications', name)
  await mkdir(dirname(join(stage, relative)), { recursive: true })
  await rename(app, join(stage, relative))
  await writeFile(join(archive, 'Info.plist'), JSON.stringify({
    ApplicationProperties: { ApplicationPath: `Applications/${name}`, Architectures: ['arm64'], CFBundleIdentifier: native.app.bundleId, CFBundleShortVersionString: native.app.version, CFBundleVersion: native.app.buildNumber },
    ArchiveVersion: 2,
    Name: project.name,
    SchemeName: project.name,
  }))
  await run('plutil', ['-convert', 'xml1', join(archive, 'Info.plist')])
  await run('plutil', ['-insert', 'CreationDate', '-date', new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'), join(archive, 'Info.plist')])
  return relative
}

export async function androidTools(env: NodeJS.ProcessEnv, app: Native['app']) {
  if (!/^[A-Z]\w*(?:\.[A-Z]\w*)+$/iu.test(app.bundleId) || !/^\d+$/u.test(app.buildNumber) || Number(app.buildNumber) < 1 || Number(app.buildNumber) > 2100000000)
    throw new Error('Android requires a Java package name and integer app.buildNumber in 1..2100000000.')
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT
  const ndk = env.ANDROID_NDK_HOME
  const jsc = env.QUA_ANDROID_JSC_LIB_DIR
  if (!sdk || !ndk || !jsc)
    throw new Error('Android requires ANDROID_HOME, ANDROID_NDK_HOME and QUA_ANDROID_JSC_LIB_DIR.')
  if (!['darwin', 'linux'].includes(process.platform))
    throw new Error('Android cross-packaging uses a macOS or Linux NDK host.')
  const toolchain = join(ndk, 'toolchains/llvm/prebuilt', process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64')
  const cc = join(toolchain, 'bin/aarch64-linux-android28-clang')
  const cxx = `${cc}++`
  const tools = join(sdk, 'build-tools/35.0.0')
  const jar = join(sdk, 'platforms/android-35/android.jar')
  const jscLibrary = join(jsc, 'libjsc.so')
  const cppLibrary = join(toolchain, 'sysroot/usr/lib/aarch64-linux-android/libc++_shared.so')
  for (const path of [cc, cxx, jar, jscLibrary, cppLibrary, join(tools, 'aapt2'), join(tools, 'zipalign')]) {
    if (!await stat(path).then(s => s.isFile()).catch(() => false))
      throw new Error(`Missing Android build dependency: ${path}`)
  }
  return { tools, jar, jscLibrary, cppLibrary, readElf: join(toolchain, 'bin/llvm-readelf'), compileEnv: {
    CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: cc,
    CC_aarch64_linux_android: cc,
    CXX_aarch64_linux_android: cxx,
    AR_aarch64_linux_android: join(toolchain, 'bin/llvm-ar'),
    ANDROID_PLATFORM: 'android-28',
  } }
}

export async function buildAndroidApk(project: NormalizedQuaProjectConfig, stage: string, icon: string, library: string, sdk: Awaited<ReturnType<typeof androidTools>>, run: BuildRunner, env: NodeJS.ProcessEnv): Promise<string> {
  const native = project.targets.native!
  const work = join(stage, 'android-work')
  const res = join(work, 'res/drawable')
  const libs = join(work, 'lib/arm64-v8a')
  await mkdir(res, { recursive: true })
  await mkdir(libs, { recursive: true })
  await sharp(icon).resize(192, 192, { fit: 'contain', background: '#00000000' }).png().toFile(join(res, 'icon.png'))
  const manifest = join(work, 'AndroidManifest.xml')
  await writeFile(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${xml(native.app.bundleId)}" android:versionCode="${Number(native.app.buildNumber)}" android:versionName="${xml(native.app.version)}">
  <uses-sdk android:minSdkVersion="28" android:targetSdkVersion="35"/>
  <uses-feature android:name="android.hardware.vulkan.version" android:version="0x00401000" android:required="true"/>
  <uses-feature android:name="android.hardware.gamepad" android:required="false"/>
  <application android:hasCode="false" android:label="${xml(project.name)}" android:icon="@drawable/icon" android:extractNativeLibs="false">
    <activity android:name="android.app.NativeActivity" android:exported="true" android:theme="@android:style/Theme.Material.NoActionBar.Fullscreen" android:screenOrientation="${portrait(native) ? 'sensorPortrait' : 'sensorLandscape'}" android:configChanges="orientation|keyboardHidden|keyboard|screenSize|density|screenLayout|uiMode">
      <meta-data android:name="android.app.lib_name" android:value="quajs_native"/>
      <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
    </activity>
  </application>
</manifest>`)
  const aapt = join(sdk.tools, 'aapt2')
  const flat = join(work, 'compiled.zip')
  const unaligned = join(work, 'base.apk')
  await run(aapt, ['compile', '--dir', dirname(res), '-o', flat])
  await run(aapt, ['link', '-o', unaligned, '--manifest', manifest, '-I', sdk.jar, '-A', join(stage, 'apk-assets'), '-0', 'qpk', flat])
  await copyFile(library, join(libs, 'libquajs_native.so'))
  await copyFile(sdk.jscLibrary, join(libs, 'libjsc.so'))
  const dynamic = await run(sdk.readElf, ['--dynamic-table', library, sdk.jscLibrary])
  if (/\(NEEDED\).*\[libc\+\+_shared\.so\]/u.test(dynamic))
    await copyFile(sdk.cppLibrary, join(libs, basename(sdk.cppLibrary)))
  const jar = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin/jar') : 'jar'
  await run(jar, ['--update', '--file', unaligned, '--no-compress', '-C', work, 'lib'])
  const filename = env.QUA_ANDROID_KEYSTORE ? 'game.apk' : 'game-unsigned.apk'
  const apk = join(stage, filename)
  await run(join(sdk.tools, 'zipalign'), ['-P', '16', '4', unaligned, apk])
  if (env.QUA_ANDROID_KEYSTORE) {
    if (!env.QUA_ANDROID_KEY_ALIAS || !env.QUA_ANDROID_STORE_PASSWORD)
      throw new Error('Android signing requires QUA_ANDROID_KEY_ALIAS and QUA_ANDROID_STORE_PASSWORD.')
    const signer = join(sdk.tools, 'apksigner')
    const args = ['sign', '--ks', resolve(env.QUA_ANDROID_KEYSTORE), '--ks-key-alias', env.QUA_ANDROID_KEY_ALIAS, '--ks-pass', 'env:QUA_ANDROID_STORE_PASSWORD']
    if (env.QUA_ANDROID_KEY_PASSWORD)
      args.push('--key-pass', 'env:QUA_ANDROID_KEY_PASSWORD')
    await run(signer, [...args, apk])
    await run(signer, ['verify', apk])
  }
  await run(join(sdk.tools, 'zipalign'), ['-c', '-P', '16', '4', apk])
  await rm(work, { recursive: true })
  return filename
}
