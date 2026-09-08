import type { GalleryPlugin } from '@quajs/plugin-gallery'

export const DEMO_GALLERY_CATALOG_ID = 'call-me-tomorrow-cg'

export async function registerDemoGallery(gallery: GalleryPlugin): Promise<void> {
  await gallery.registerCatalog({
    id: DEMO_GALLERY_CATALOG_ID,
    title: '明天，请再一次呼唤我',
    summary: '正式 CG 尚在制作中。',
    entryIds: [],
  })
}
