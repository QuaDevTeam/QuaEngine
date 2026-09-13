import { describe, expect, it } from 'vitest'
import {
  buildNativeUiProjectIndex,
  getNativeUiProjectDocumentLinks,
} from '../src'
import { rangeOf } from './language-server-test-utils'

describe('@quajs/native-language-server project assets', () => {
  it('indexes package-relative asset links from QUI props and QSS asset calls', () => {
    const qui = [
      'Image(src: "assets/poster.png")',
      'Panel(image: "assets/panel.png", asset-type: "images") {}',
      'Image(src: "../outside.png")',
      'Image(src: "https://cdn.example/poster.png")',
      'Image(src: "assets//poster.png")',
      'Image(src: "assets/./poster.png")',
      'Image(src: "assets/native.dll")',
      'Image(src: "assets/invalid-type.png", asset-type: "../bad")',
    ].join('\n')
    const qss = [
      'Panel.hero { background-image: asset("assets/hero.png", "images"); }',
      'Panel.remote { background-image: asset("https://cdn.example/hero.png"); }',
      'Panel.absolute { background-image: asset("/outside.png"); }',
      'Panel.empty { background-image: asset("assets//hero.png"); }',
      'Panel.dot { background-image: asset("assets/./hero.png"); }',
      'Panel.payload { background-image: asset("assets/native.dll"); }',
      'Panel.backslash { background-image: asset("assets\\\\hero.png"); }',
    ].join('\n')
    const index = buildNativeUiProjectIndex([
      {
        uri: 'file:///project/ui/menu.qui',
        source: qui,
      },
      {
        uri: 'file:///project/ui/menu.qss',
        source: qss,
      },
      {
        uri: 'file:///project/ui/assets/poster.png',
        source: '',
      },
      {
        uri: 'file:///project/ui/assets/hero.png',
        source: '',
      },
    ])

    expect(index.summary.assetReferences).toBe(3)
    expect(index.documents.find(document => document.uri.endsWith('menu.qui'))?.assetReferences)
      .toEqual([
        expect.objectContaining({
          assetName: 'assets/panel.png',
          assetType: 'images',
          pathRange: rangeOf(qui, 'assets/panel.png'),
          source: 'qui-prop',
        }),
        expect.objectContaining({
          assetName: 'assets/poster.png',
          assetType: 'images',
          pathRange: rangeOf(qui, 'assets/poster.png'),
          source: 'qui-prop',
        }),
      ])
    expect(index.documents.find(document => document.uri.endsWith('menu.qss'))?.assetReferences)
      .toEqual([
        expect.objectContaining({
          assetName: 'assets/hero.png',
          assetType: 'images',
          pathRange: rangeOf(qss, 'assets/hero.png'),
          source: 'qss-asset',
        }),
      ])

    expect(getNativeUiProjectDocumentLinks(index, 'file:///project/ui/menu.qui'))
      .toEqual([
        expect.objectContaining({
          candidateUri: 'file:///project/ui/assets/panel.png',
          kind: 'asset',
          path: 'assets/panel.png',
          resolved: false,
          targetUri: undefined,
        }),
        expect.objectContaining({
          candidateUri: 'file:///project/ui/assets/poster.png',
          kind: 'asset',
          path: 'assets/poster.png',
          resolved: true,
          targetUri: 'file:///project/ui/assets/poster.png',
        }),
      ])
    expect(getNativeUiProjectDocumentLinks(index, 'file:///project/ui/menu.qss'))
      .toEqual([
        expect.objectContaining({
          candidateUri: 'file:///project/ui/assets/hero.png',
          kind: 'asset',
          path: 'assets/hero.png',
          resolved: true,
          targetUri: 'file:///project/ui/assets/hero.png',
        }),
      ])
  })
})
