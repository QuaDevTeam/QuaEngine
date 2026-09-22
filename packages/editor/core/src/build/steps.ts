import type { EditorBuildStep, PreviewTarget } from '../contracts/project.js'

/** Presentation labels only; the build process reports actual stage transitions. */
const steps = {
  prepare: ['检查项目', '检查项目配置、构建工具与输出目录'],
  compile: ['构建游戏代码', '编译生产模式的脚本与界面'],
  bundle: ['打包游戏资源', '生成并校验游戏资源包'],
  runtime: ['编译原生运行时', '编译 Rust 运行时；首次构建可能需要较长时间'],
  manifest: ['校验目标依赖', '验证目标平台、依赖与发布清单'],
  executable: ['生成可执行应用', '链接应用并固定资源完整性信息'],
  icon: ['生成图标与应用信息', '生成 macOS 图标和应用元数据'],
  sign: ['代码签名与校验', '使用项目配置中的签名方式并验证签名'],
  notarize: ['Apple 公证', '按项目配置提交 Apple，等待审核并装订凭据'],
  publish: ['整理发布产物', '完成最终检查并写入发布目录'],
} as const

export function createEditorBuildSteps(target: PreviewTarget): EditorBuildStep[] {
  const ids: (keyof typeof steps)[] = target === 'web'
    ? ['prepare', 'compile', 'manifest', 'publish']
    : ['prepare', 'compile', 'bundle', 'runtime', 'manifest', 'executable', 'icon', 'sign', 'notarize', 'publish']
  return ids.map(id => ({ id, title: steps[id][0], description: steps[id][1], phase: 'pending' }))
}
