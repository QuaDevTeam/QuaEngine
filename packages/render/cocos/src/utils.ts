import type { AssetType } from '@quajs/assets'
import type { CocosHostNode, CocosHostTransform } from '@quajs/cocos-host'
import type {
  CharacterPosition,
  RichTextContent,
  ViewChoiceProjection,
} from '@quajs/render-core'
import { isRichTextDocument } from '@quajs/render-core'

export function metadataTargetPackageId(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const direct = metadata?.contentPackageId
  if (typeof direct === 'string')
    return direct
  const packageId = metadata?.runtimePackageId
  return typeof packageId === 'string' ? packageId : undefined
}

export function normalizeBackgroundAssetType(type: string | undefined): AssetType {
  if (type === 'video')
    return 'video'
  if (type === 'characters')
    return 'characters'
  return 'images'
}

export function choiceText(choice: Readonly<ViewChoiceProjection>): string {
  return richTextToPlainText(choice.text)
}

export function richTextToPlainText(content: RichTextContent): string {
  if (!isRichTextDocument(content))
    return content
  return content.blocks
    .map(block => block.spans.map(span => span.text).join(''))
    .join('\n')
}

export function positionTransform(position: CharacterPosition | undefined): CocosHostTransform {
  return {
    x: position?.x,
    y: position?.y,
    scaleX: position?.scale,
    scaleY: position?.scale,
    rotation: position?.rotation,
    anchorX: position?.anchor === 'left' ? 0 : position?.anchor === 'right' ? 1 : 0.5,
    anchorY: 0,
  }
}

export function nodeKey(node: CocosHostNode): string {
  return node.id
}
