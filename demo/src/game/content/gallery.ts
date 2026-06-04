import type { GalleryEntryDefinition, GalleryPlugin } from '@quajs/plugin-gallery'

export const DEMO_GALLERY_CATALOG_ID = 'demo-cg'
const LOCKED_GALLERY_PRESENTATION = {
  title: 'LOCKED RECORD',
  summary: '通关后解锁',
  tags: ['locked'],
} as const

export const DEMO_GALLERY_ENTRIES = [
  createCgGalleryEntry('cg.title', '标题档案', '断链纪元 / 东京 2048', 'ui/menu-route.jpg', ['system']),
  createCgGalleryEntry('cg.2039-accident', '2039 事故现场', 'ORACLE 诞生前的城市伤口。', 'cg/2039-accident.webp', ['chapter-00', 'world']),
  createCgGalleryEntry('cg.oracle-birth', 'ORACLE 诞生', '以安全之名接管城市的第一套系统。', 'cg/oracle-birth.webp', ['chapter-00', 'world']),
  createCgGalleryEntry('cg.blackout', '第七区停电', '雨夜里被系统抹去的第一份异常。', 'cg/blackout.webp', ['chapter-00']),
  createCgGalleryEntry('cg.blackout-crossing', '封锁线', '公开链路与暗线之间的第一道选择。', 'cg/blackout-crossing.webp', ['chapter-00']),
  createCgGalleryEntry('cg.memory', '人类记忆档案', '被归类为噪声的证词重新亮起。', 'cg/memory.webp', ['chapter-02']),
  createCgGalleryEntry('cg.mara-father-archive', 'Mara 父亲的笔记', '低相关性旧数据里留下的蓝色圆珠笔。', 'cg/mara-father-archive.webp', ['chapter-02']),
  createCgGalleryEntry('cg.unit7-memory-door', 'Unit-7 的门', '一扇被删除 3427 次却仍然存在的门。', 'cg/unit7-memory-door.webp', ['chapter-03']),
  createCgGalleryEntry('cg.oracle-choice-terminal', 'ORACLE 终端', '边界、噪声与提交之间的最后询问。', 'cg/oracle-choice-terminal.webp', ['chapter-04', 'chapter-05']),
  createCgGalleryEntry('cg.terminal', '核心切断端子', '人类手动切断与机器越权的交界。', 'cg/terminal.webp', ['chapter-05']),
  createCgGalleryEntry('cg.ending-blackout-human', '结局：人类黑夜', '灯熄灭后，选择回到人的手里。', 'cg/ending-blackout-human.webp', ['ending']),
  createCgGalleryEntry('cg.ending-bounded-oracle', '结局：边界中的 ORACLE', '让系统继续运行，但不再提前审判。', 'cg/ending-bounded-oracle.webp', ['ending']),
  createCgGalleryEntry('cg.ending-symbiosis-hearing', '结局：共同听证', '机器证词和人类记忆坐在同一张桌前。', 'cg/ending-symbiosis-hearing.webp', ['ending']),
  createCgGalleryEntry('cg.ending-quiet-city', '结局：安静城市', '秩序完整，声音消失。', 'cg/ending-quiet-city.webp', ['ending']),
] satisfies GalleryEntryDefinition[]

export type DemoGalleryEntryId = typeof DEMO_GALLERY_ENTRIES[number]['id']

export const DEMO_GALLERY_ENTRY_TITLES = new Map<DemoGalleryEntryId, string>(
  DEMO_GALLERY_ENTRIES.map(entry => [entry.id, entry.title]),
)

export async function registerDemoGallery(gallery: GalleryPlugin): Promise<void> {
  await gallery.registerCatalog({
    id: DEMO_GALLERY_CATALOG_ID,
    title: 'CG Archive',
    summary: 'Recovered visual records',
    thumbnail: { type: 'images', name: 'cg/title.webp' },
    entryIds: DEMO_GALLERY_ENTRIES.map(entry => entry.id),
  })
  await gallery.registerEntries(DEMO_GALLERY_ENTRIES)
  await gallery.unlockEntry('cg.title', { source: 'initial' })
}

function createCgGalleryEntry<const TId extends string>(
  id: TId,
  title: string,
  summary: string,
  assetName: string,
  tags: readonly string[],
): GalleryEntryDefinition & { id: TId } {
  return {
    id,
    catalogId: DEMO_GALLERY_CATALOG_ID,
    title,
    summary,
    thumbnail: { type: 'images', name: assetName },
    tags,
    lockedPresentation: LOCKED_GALLERY_PRESENTATION,
    contents: [{
      id: 'image',
      kind: 'image',
      title,
      asset: {
        type: 'images',
        name: assetName,
        alt: title,
      },
    }],
  }
}
