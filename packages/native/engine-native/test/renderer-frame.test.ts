import { describe, expect, it } from 'vitest'
import { createNativeRendererJsonFrameInput } from '../src'

describe('native renderer frame serialization', () => {
  it('passes engine-owned font plugin projections to native JSON', () => {
    const frame = createNativeRendererJsonFrameInput({
      plugins: {
        fonts: {
          revision: 7,
          requiredRuntimePackages: ['runtime.fonts', 'runtime.fonts'],
          faces: [
            {
              id: 'noto-serif-jp-regular',
              family: 'Noto Serif JP',
              assetName: 'fonts/noto-serif-jp.woff2',
              weight: 500,
              style: 'normal',
              unicodeRange: 'U+3000-9FFF',
              contentPackageId: 'runtime.fonts',
              metadata: {
                requiredRuntimePackages: ['base'],
              },
            },
            {
              family: 'Broken',
            },
          ],
        },
      },
    })

    expect(frame.view.plugins).toEqual({
      fonts: {
        revision: 7,
        requiredRuntimePackages: ['runtime.fonts'],
        faces: [
          {
            id: 'noto-serif-jp-regular',
            family: 'Noto Serif JP',
            assetName: 'fonts/noto-serif-jp.woff2',
            assetType: 'fonts',
            weight: 500,
            style: 'normal',
            unicodeRange: 'U+3000-9FFF',
            provenance: {
              contentPackageId: 'runtime.fonts',
              requiredRuntimePackages: ['base'],
            },
          },
        ],
      },
    })
  })
})
