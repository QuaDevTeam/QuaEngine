import type { AssetLoadingProjection } from '@quajs/plugin-asset-loading/contracts'
import type { QuaViewProjection } from '@quajs/render-core'
import { Pipeline } from '@quajs/pipeline'
import { ASSET_LOADING_PLUGIN_ID, ASSET_LOADING_RETRY } from '@quajs/plugin-asset-loading/contracts'
import { createAssetLoadingUiSurfaceFeature } from '@quajs/plugin-asset-loading/surface'
import { LogicToRenderEvents } from '@quajs/render-core'
import { describe, expect, it, vi } from 'vitest'
import { mountAssetLoadingScene } from '../src/plugins/asset-loading'

describe('resource-free loading scene', () => {
  it('renders the same QUI surface with retry and restores the surrounding page', async () => {
    document.body.innerHTML = '<main>Game</main>'
    const pipeline = new Pipeline()
    const retry = vi.fn()
    pipeline.on(ASSET_LOADING_RETRY, retry)
    let state: AssetLoadingProjection = { visible: true, state: 'error', title: 'Startup', phase: 'preparing', progress: 0, loaded: 0, total: 0, attempt: 1 }
    const dispose = mountAssetLoadingScene({ container: document.body, pipeline,
      surface: createAssetLoadingUiSurfaceFeature(),
      getViewState: () => ({ ui: { visible: true, overlays: {} }, plugins: { [ASSET_LOADING_PLUGIN_ID]: state } }) as unknown as QuaViewProjection,
    })
    expect(document.querySelector('[data-qui-id="asset-loading-title"]')?.textContent).toBe('Startup')
    const button = document.querySelector<HTMLButtonElement>('[data-qui-id="asset-loading-retry"]')!
    expect(document.activeElement).toBe(button)
    button.click()
    await vi.waitFor(() => expect(retry).toHaveBeenCalledOnce())
    state = { ...state, visible: false, state: 'ready' }
    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, {})
    expect(document.querySelector('.qua-asset-loading')).toBeNull()
    expect(document.querySelector('main')?.inert).toBe(false)
    dispose()
    document.body.innerHTML = ''
  })
  it('projects unknown totals, retry intent, focus and cleanup without fetching resources', async () => {
    document.body.innerHTML = '<main><button id="game">Play</button></main>'
    const game = document.querySelector<HTMLElement>('#game')!
    game.focus()
    const pipeline = new Pipeline()
    const retry = vi.fn()
    pipeline.on(ASSET_LOADING_RETRY, retry)
    let state: AssetLoadingProjection = { visible: true, state: 'loading', title: 'Loading', phase: 'downloading', progress: null, loaded: 200, total: 0, attempt: 1 }
    const dispose = mountAssetLoadingScene({ container: document.body, pipeline, getViewState: () => ({ plugins: { [ASSET_LOADING_PLUGIN_ID]: state } }) as unknown as QuaViewProjection })
    expect(document.querySelector('progress')?.hasAttribute('value')).toBe(false)
    expect(document.querySelector('main')?.inert).toBe(true)
    const input = vi.fn()
    document.addEventListener('keydown', input)
    game.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(input).not.toHaveBeenCalled()
    state = { ...state, state: 'error', error: 'raw internal path' }
    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, {})
    const button = document.querySelector<HTMLButtonElement>('.qua-asset-loading__retry')!
    expect(button.hidden).toBe(false)
    expect(document.body.textContent).not.toContain('raw internal path')
    expect(document.activeElement).toBe(button)
    button.click()
    await vi.waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
    state = { ...state, state: 'ready', visible: false }
    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, {})
    expect(document.querySelector('.qua-asset-loading')).toBeNull()
    expect(document.querySelector('main')?.inert).toBe(false)
    expect(document.activeElement).toBe(game)
    dispose()
    document.removeEventListener('keydown', input)
    document.body.innerHTML = ''
  })
})
