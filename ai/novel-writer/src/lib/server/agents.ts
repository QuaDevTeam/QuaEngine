import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentDefinition, WorkflowStage } from '$lib/types'

export const agentDefinitions: AgentDefinition[] = [
  {
    id: 'requirements_planner',
    title: '需求确认专家',
    stage: 'requirements',
    skillFiles: ['visual-novel-style.md'],
    searchDepth: 'basic',
  },
  {
    id: 'worldbuilder',
    title: '世界观专家',
    stage: 'worldbuilding',
    skillFiles: ['visual-novel-style.md', 'worldbuilding.md'],
    searchDepth: 'advanced',
  },
  {
    id: 'worldbuilding_reviewer',
    title: '世界观评审专家',
    stage: 'worldbuilding_review',
    skillFiles: ['content-review.md'],
    searchDepth: 'advanced',
    reasoningEffort: 'max',
  },
  {
    id: 'character_designer',
    title: '角色设定专家',
    stage: 'characters',
    skillFiles: ['visual-novel-style.md', 'character-design.md'],
    searchDepth: 'advanced',
  },
  {
    id: 'characters_reviewer',
    title: '角色评审专家',
    stage: 'characters_review',
    skillFiles: ['content-review.md'],
    searchDepth: 'advanced',
    reasoningEffort: 'max',
  },
  {
    id: 'story_background_researcher',
    title: '故事背景专家',
    stage: 'story_background',
    skillFiles: ['visual-novel-style.md', 'worldbuilding.md'],
    searchDepth: 'advanced',
  },
  {
    id: 'story_background_reviewer',
    title: '故事背景评审专家',
    stage: 'story_background_review',
    skillFiles: ['content-review.md'],
    searchDepth: 'advanced',
    reasoningEffort: 'max',
  },
  {
    id: 'outline_writer',
    title: '大纲专家',
    stage: 'outline',
    skillFiles: ['visual-novel-style.md'],
    searchDepth: 'advanced',
  },
  {
    id: 'entertainment_reviewer',
    title: '娱乐性评审专家',
    stage: 'outline_review',
    skillFiles: ['outline-review.md'],
    searchDepth: 'advanced',
    reasoningEffort: 'max',
  },
  {
    id: 'scene_writer',
    title: '写作专家',
    stage: 'scene_writing',
    skillFiles: ['visual-novel-style.md'],
    searchDepth: 'basic',
  },
  {
    id: 'chapter_editor',
    title: '章节编辑专家',
    stage: 'chapter_editing',
    skillFiles: ['editor-supervisor.md'],
    searchDepth: 'basic',
  },
  {
    id: 'chapter_supervisor',
    title: '章节监督专家',
    stage: 'chapter_supervision',
    skillFiles: ['editor-supervisor.md', 'visual-novel-style.md'],
    searchDepth: 'basic',
    reasoningEffort: 'max',
  },
  {
    id: 'editor',
    title: '编辑专家',
    stage: 'editing',
    skillFiles: ['editor-supervisor.md'],
    searchDepth: 'basic',
  },
  {
    id: 'writing_supervisor',
    title: '写作监督',
    stage: 'supervision',
    skillFiles: ['editor-supervisor.md', 'visual-novel-style.md'],
    searchDepth: 'basic',
    reasoningEffort: 'max',
  },
  {
    id: 'context_compactor',
    title: '上下文压缩专家',
    stage: 'final',
    skillFiles: ['visual-novel-style.md'],
    searchDepth: 'basic',
  },
]

export const workflowOrder: WorkflowStage[] = [
  'requirements',
  'worldbuilding',
  'worldbuilding_review',
  'characters',
  'characters_review',
  'story_background',
  'story_background_review',
  'outline',
  'outline_review',
  'scene_writing',
  'chapter_editing',
  'chapter_supervision',
  'supervision',
  'editing',
  'final',
]

export function getAgentForStage(stage: WorkflowStage): AgentDefinition {
  const agent = agentDefinitions.find(item => item.stage === stage)
  if (!agent) {
    throw new Error(`No agent registered for stage: ${stage}`)
  }
  return agent
}

export async function loadAgentSkills(agent: AgentDefinition): Promise<string> {
  const root = findSkillsRoot()
  const skills = await Promise.all(
    agent.skillFiles.map(file => readFile(join(root, file), 'utf8')),
  )
  return skills.join('\n\n---\n\n')
}

function findSkillsRoot(): string {
  const explicit = process.env.NOVEL_WRITER_SKILLS_DIR
  if (explicit) {
    return explicit
  }

  const starts = [
    process.cwd(),
    dirname(fileURLToPath(import.meta.url)),
  ]

  for (const start of starts) {
    let current = start
    for (let depth = 0; depth < 8; depth += 1) {
      const candidate = join(current, 'agent-instructions', 'skills')
      try {
        return requireDirectory(candidate)
      }
      catch {
        const parent = dirname(current)
        if (parent === current) {
          break
        }
        current = parent
      }
    }
  }

  throw new Error('Unable to locate agent-instructions/skills. Set NOVEL_WRITER_SKILLS_DIR to override.')
}

function requireDirectory(pathname: string): string {
  if (statSync(pathname).isDirectory()) {
    return pathname
  }
  throw new Error(`Not a directory: ${pathname}`)
}

export function stageTitle(stage: WorkflowStage): string {
  const titles: Record<WorkflowStage, string> = {
    requirements: '需求确认',
    worldbuilding: '世界观',
    worldbuilding_review: '世界观评审',
    characters: '角色设定',
    characters_review: '角色评审',
    story_background: '故事背景',
    story_background_review: '故事背景评审',
    outline: '小说大纲',
    outline_review: '大纲评审',
    scene_writing: '正文场景',
    chapter_editing: '章节润色',
    chapter_supervision: '章节监督',
    editing: '全文润色',
    supervision: '全文监督',
    final: '最终成品',
  }
  return titles[stage]
}
