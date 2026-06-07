import type { ArtifactRef, NovelProject } from '$lib/types'

export function compactArtifacts(artifacts: ArtifactRef[], maxCharacters = 12000, project?: NovelProject): string {
  const pinned = project ? formatPinnedProjectCanon(project) : ''
  const blocks = artifacts
    .filter(artifact => artifact.status !== 'rejected')
    .map(artifact => [
      `# ${artifact.title}`,
      `stage: ${artifact.stage}`,
      artifact.markdown,
    ].join('\n'))

  const output: string[] = []
  let used = pinned.length
  for (const block of blocks.reverse()) {
    if (used + block.length > maxCharacters) {
      break
    }
    output.unshift(block)
    used += block.length
  }
  return [pinned, output.join('\n\n---\n\n')].filter(Boolean).join('\n\n---\n\n')
}

export function formatPinnedProjectCanon(project: NovelProject): string {
  const seedIsMutable = project.seed?.allowExpertChanges === true
  const seedHeadingPolicy = seedIsMutable
    ? '压缩时必须保留；可按修改策略合理调整'
    : '压缩时必须保留；内容和细节不可修改'
  const blocks = [
    '# 固定项目基础信息（上下文压缩时必须保留）',
    `项目：${project.title}`,
    `原始需求：${project.brief}`,
  ]

  if (project.seed) {
    blocks.push(
      '',
      '## 用户预设修改策略（必须作为 canon 保留）',
      project.seed.allowExpertChanges
        ? '允许专家修改设定：开启。专家可以以用户预设为基础进行合理修改，但必须说明修改意图并维持原始需求方向。'
        : '允许专家修改设定：关闭。用户预设的所有内容和细节都是固化 canon，专家只能丰富、补充、细化，不得改写、删除、反转或矛盾化；评审专家必须检查这一项。',
    )
  }

  if (project.seed?.worldbuilding) {
    blocks.push('', `## 用户预设世界观（${seedHeadingPolicy}）`, project.seed.worldbuilding)
  }
  if (project.seed?.characters) {
    blocks.push('', `## 用户预设角色信息（${seedHeadingPolicy}）`, project.seed.characters)
  }
  if (project.seed?.outline) {
    blocks.push('', `## 用户预设大纲（${seedHeadingPolicy}）`, project.seed.outline)
  }

  return blocks.join('\n')
}
