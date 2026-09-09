import { registerCharacters } from '@quajs/character'

/** Identity and assets only. Presence and every acting cue are authored in QS. */
export function registerDemoCharacters(): void {
  registerCharacters([
    ['rin', '神代凛'], ['mara', 'Mara'], ['haruka', '水野春香'],
    ['mayu', '高桥真由'], ['reiko', '森田礼子'], ['yumi', '青木由美'],
  ].map(([id, displayName]) => ({
    id, displayName, spriteManifest: `${id}/sprite.manifest.json`,
    expression: 'neutral',
    position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' },
  })))
}
