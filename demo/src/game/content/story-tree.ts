import type { StoryGraphPlugin } from '@quajs/story-graph'

export interface DemoStoryTreeNodeDefinition {
  id: string
  chapter: string
  title: string
  description: string
}

export const STORY_TREE_NODES = [
  { id: 'chapter-00', chapter: '00', title: 'Cold Open', description: 'District Seven blackout' },
  { id: 'chapter-01', chapter: '01', title: 'Trace', description: 'Stealth route / Direct core access' },
  { id: 'chapter-02', chapter: '02', title: 'Human Cache', description: 'Broadcast archive / Lure ORACLE' },
  { id: 'chapter-03', chapter: '03', title: 'Machine Witness', description: 'Trust Unit-7 / Lock witness' },
  { id: 'chapter-04', chapter: '04', title: 'ORACLE Link', description: 'Noise / Charter / Submission' },
  { id: 'chapter-05', chapter: '05', title: 'Breach Night', description: 'Human cut / Machine breach / Hybrid charter' },
  { id: 'chapter-06', chapter: '06', title: 'Endings', description: 'Blackout / Bounded / Symbiosis / Quiet' },
] satisfies DemoStoryTreeNodeDefinition[]

export const INITIAL_STORY_TREE_NODE_ID = STORY_TREE_NODES[0]!.id

export async function registerDemoStoryGraph(storyGraph: StoryGraphPlugin): Promise<void> {
  await storyGraph.registerGraph({
    id: 'demo-main',
    nodes: STORY_TREE_NODES.map((node, index) => ({
      id: node.id,
      point: {
        storyId: 'demo-main',
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
        unlockOnVisit: false,
        lockedVisibility: 'placeholder',
        lockedTitle: node.chapter ? `CH ${node.chapter}` : 'LOCKED',
        lockedSummary: '继续主线后解锁该路线节点。',
        lockEntryUntilUnlocked: true,
      },
    })),
  })
}
