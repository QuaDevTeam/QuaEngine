import type { QuaStoryTreeNode } from '@quajs/renderer-vue/plugins/ui'
import type { StoryChapterSelectProjection } from '@quajs/story-graph'
import { parseChapterIndex } from './scene'

export function projectDemoStoryTreeNodes(
  projection: StoryChapterSelectProjection,
  currentChapterIndex: number,
): QuaStoryTreeNode[] {
  return projection.nodes.map((node, index) => {
    const chapter = typeof node.point.chapterId === 'string'
      ? node.point.chapterId
      : String(index).padStart(2, '0')
    const chapterIndex = parseChapterIndex(chapter)
    const state = node.entryLocked
      ? 'locked'
      : node.current || chapterIndex === currentChapterIndex
        ? 'current'
        : chapterIndex >= 0 && chapterIndex < currentChapterIndex
          ? 'complete'
          : 'available'

    return {
      id: node.nodeId,
      chapter,
      title: node.title || 'Locked',
      description: node.summary,
      state,
      disabled: node.entryLocked,
      entryLocked: node.entryLocked,
      spoilerHidden: node.spoilerHidden,
      lockedLabel: node.spoilerHidden ? 'LOCKED' : undefined,
      className: `vn-story-tree-node--${state}`,
    }
  })
}

export function countUnlockedStoryTreeNodes(projection: StoryChapterSelectProjection): number {
  return projection.nodes.filter(node => node.unlocked).length
}
