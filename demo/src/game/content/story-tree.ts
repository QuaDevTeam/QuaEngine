import type { StoryGraphPlugin } from '@quajs/story-graph'

export interface DemoStoryTreeNodeDefinition {
  id: string
  chapter: string
  title: string
  description: string
}

export const STORY_TREE_NODES: DemoStoryTreeNodeDefinition[] = [
  { id: 'prologue-arrival', chapter: '00', title: '雨天来客', description: '6 月 10—12 日' },
  { id: 'chapter-01', chapter: '01', title: '同一段海风', description: '6 月 13—14 日' },
  { id: 'chapter-02', chapter: '02', title: '借来的好天气', description: '6 月 15—16 日' },
  { id: 'chapter-03', chapter: '03', title: '有人替你值班', description: '6 月 17—21 日' },
  { id: 'chapter-04', chapter: '04', title: '明晚八点', description: '6 月 22—23 日 · 清晨' },
  { id: 'chapter-05', chapter: '05', title: '绿色指示灯', description: '6 月 23 日 · 上午' },
  { id: 'chapter-06', chapter: '06', title: '不用等到八点', description: '6 月 23 日 · 下午' },
  { id: 'chapter-07', chapter: '07', title: '下一次约会', description: '6 月 24—29 日' },
  { id: 'epilogue', chapter: '08', title: '明天，请再一次呼唤我', description: '6 月—11 月' },
]

export async function registerDemoStoryGraph(storyGraph: StoryGraphPlugin): Promise<void> {
  await storyGraph.registerGraph({
    id: 'call-me-tomorrow',
    nodes: STORY_TREE_NODES.map((node, index) => ({
      id: node.id,
      point: {
        storyId: 'call-me-tomorrow',
        sceneId: 'call-me-tomorrow-prologue',
        chapterId: node.chapter,
        nodeId: node.id,
        stepId: node.id,
      },
      title: node.title,
      summary: node.description,
      chapterSelect: {
        title: node.title,
        summary: node.description,
        order: index,
        unlockOnVisit: true,
        lockedVisibility: 'placeholder',
        lockedTitle: node.chapter ? `第 ${node.chapter} 章` : 'LOCKED',
        lockedSummary: '未解锁',
        lockEntryUntilUnlocked: true,
      },
    })),
  })
}
