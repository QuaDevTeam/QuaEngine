import type { ViewCharacterProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { characterProjectionVars, projectCharacters } from '../projection'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars, assignData } from './shared'
import { updateSpriteLayerAnimations } from './sprite'

export interface CharacterWebRendererPluginOptions {
  renderSprite?: (context: QuaWebDomLayerContext, character: Readonly<ViewCharacterProjection>) => Node | null | undefined
}

export function createCharacterWebRendererPlugin(options: CharacterWebRendererPluginOptions = {}): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/character',
    setup() {},
    layers: [{
      id: 'characters',
      order: 30,
      render: context => renderCharacterLayer(context, options),
      update: updateCharacterLayer,
    }],
  })
}

export const characterWebRendererPlugin = createCharacterWebRendererPlugin()

function renderCharacterLayer(context: QuaWebDomLayerContext, options: CharacterWebRendererPluginOptions): Node {
  const layer = context.document.createElement('div')
  layer.className = 'qua-character-layer'
  const characters = projectCharacters(context.view.characters, context.view.animations, Date.now())
  for (const character of characters) {
    const root = context.document.createElement('div')
    root.className = ['qua-character', character.visible ? 'is-visible' : 'is-hidden'].join(' ')
    root.setAttribute('data-character-id', character.id)
    assignData(root, 'data-character-anchor', character.position?.anchor)
    assignData(root, 'data-character-x', character.position?.x)
    assignData(root, 'data-character-y', character.position?.y)
    assignData(root, 'data-character-scale', character.position?.scale)
    assignData(root, 'data-character-rotation', character.position?.rotation)
    assignData(root, 'data-character-layer', character.layer)
    root.setAttribute('aria-hidden', 'true')
    applyStyleVars(root, characterProjectionVars(character))

    if (character.sprite) {
      const sprite = options.renderSprite?.(context, character)
      if (sprite) {
        root.append(sprite)
      }
      else {
        const image = context.document.createElement('img')
        image.className = 'qua-character-sprite'
        image.alt = character.name
        context.bindAssetUrl(image, 'characters', character.sprite)
        root.append(image)
      }
    }

    layer.append(root)
  }
  return layer
}

function updateCharacterLayer(context: QuaWebDomLayerContext, node: Node): void {
  if (!(node instanceof HTMLElement)) {
    return
  }
  const characters = projectCharacters(context.view.characters, context.view.animations, Date.now())
  for (const character of characters) {
    const element = findCharacterElement(node, character.id)
    if (!element) {
      continue
    }
    element.className = ['qua-character', character.visible ? 'is-visible' : 'is-hidden'].join(' ')
    assignData(element, 'data-character-anchor', character.position?.anchor)
    assignData(element, 'data-character-x', character.position?.x)
    assignData(element, 'data-character-y', character.position?.y)
    assignData(element, 'data-character-scale', character.position?.scale)
    assignData(element, 'data-character-rotation', character.position?.rotation)
    assignData(element, 'data-character-layer', character.layer)
    applyStyleVars(element, characterProjectionVars(character))
    updateSpriteLayerAnimations(element, context.view.animations, Date.now())
  }
}

function findCharacterElement(root: HTMLElement, characterId: string): HTMLElement | undefined {
  for (const element of root.querySelectorAll('[data-character-id]')) {
    if (element instanceof HTMLElement && element.dataset.characterId === characterId) {
      return element
    }
  }
  return undefined
}
