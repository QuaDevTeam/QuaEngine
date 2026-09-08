import type { QuaStoryTreeNode } from '@quajs/renderer-vue/plugins/ui'
import type { StoryChapterSelectProjection } from '@quajs/story-graph'
import { parseChapterIndex } from './scene'
import { h } from 'vue'

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
        : 'available'

    return {
      id: node.nodeId,
      chapter,
      title: node.title || '未读章节',
      description: node.summary,
      state,
      disabled: node.entryLocked,
      entryLocked: node.entryLocked,
      spoilerHidden: node.spoilerHidden,
      lockedLabel: node.spoilerHidden ? '未解锁' : undefined,
      className: `vn-story-tree-node--${state}`,
    }
  })
}

export function renderDemoChapter({ node }: { node: QuaStoryTreeNode }) {
  const index = parseChapterIndex(node.chapter || '')
  const chapter = index === 0 ? '序章' : index === 8 ? '尾声' : `第${'一二三四五六七'[index - 1] || index}章`
  return [
    h('span', { class: 'qua-story-tree__chapter' }, chapter),
    h('span', { class: 'qua-story-tree__body' }, [
      h('span', { class: 'qua-story-tree__node-title' }, node.spoilerHidden ? '尚未阅读' : node.title),
      !node.spoilerHidden && node.description ? h('span', { class: 'qua-story-tree__node-description' }, node.description) : null,
    ]),
    node.state === 'current' ? h('span', { class: 'qua-story-tree__node-status' }, '上次读到') : null,
    !node.entryLocked ? h('span', { class: 'vn-chapter-arrow', 'aria-hidden': 'true' }) : null,
  ]
}

export function countUnlockedStoryTreeNodes(projection: StoryChapterSelectProjection): number {
  return projection.nodes.filter(node => node.unlocked).length
}
