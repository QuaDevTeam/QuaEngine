import type {
  EditorDocument,
  EditorPluginIndexContext,
  EditorProjectIndexer,
} from '@quajs/editor-core'
import type {
  CharacterAsset,
  CharacterCatalog,
  CharacterField,
  CharacterRecord,
} from '../contracts.js'
import type { StaticValue } from './static-source.js'
import { resolveSpriteAssetPath } from '@quajs/plugin-sprite/contracts'
import ts from 'typescript'
import { CHARACTER_EDITOR_ID } from '../contracts.js'
import { normalizePath, StaticSources } from './static-source.js'

export const characterEditorIndexer: EditorProjectIndexer = {
  id: CHARACTER_EDITOR_ID,
  apiVersion: 1,
  index: indexCharacters,
}

export async function indexCharacters(
  context: EditorPluginIndexContext,
): Promise<CharacterCatalog> {
  const result: CharacterCatalog = {
    characters: [],
    registrations: [],
    issues: [],
  }
  const documents = new Map<string, EditorDocument>()
  let bytes = 0
  const sources = context.entries.filter(
    entry =>
      entry.kind === 'document'
      && /\.[cm]?[jt]sx?$/.test(entry.path)
      && !/\.d\.[cm]?ts$/.test(entry.path)
      // Generated Native application bundles are not authoring source.
      && entry.path !== 'assets/scripts/native-app.mjs',
  )
  for (const entry of sources) {
    if (documents.size >= 512 || bytes + entry.size > 16 * 1024 * 1024) {
      result.issues.push({
        message: '角色索引达到 512 个源文件或 16 MiB 上限，部分文件未分析。',
      })
      break
    }
    try {
      const document = await context.readDocument(entry.path)
      bytes += document.text.length * 2
      documents.set(entry.path, document)
    }
    catch (error) {
      result.issues.push({ message: `${entry.path}: ${String(error)}` })
    }
  }
  const source = new StaticSources(context.root, documents)
  const profiles: { value: StaticValue, call: ts.CallExpression }[] = []
  for (const file of source.files) {
    // A syntax error invalidates source edits; keep it visible instead of inventing a profile.
    const diagnostics = (
      file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
    ).parseDiagnostics
    if (diagnostics.length) {
      result.issues.push({
        message: '源文件有语法错误，角色定义暂未索引。',
        source: source.location(file),
      })
      continue
    }
    const visit = (node: ts.Node): void => {
      if (profiles.length >= 2000)
        return
      if (ts.isCallExpression(node)) {
        const api = source.registration(node.expression)
        if (
          api === 'registerCharacter'
          || api === 'registerCharacters'
          || api === 'createCharacter'
        ) {
          try {
            let value = source.evaluate(node.arguments[0])
            if (api === 'createCharacter') {
              const options = source.evaluate(node.arguments[1])
              const fields = new Map(options?.fields)
              if (value) {
                if (!fields.has('id'))
                  fields.set('id', value)
                if (!fields.has('displayName'))
                  fields.set('displayName', fields.get('name') ?? value)
              }
              value = {
                node,
                fields,
                partial:
                  options?.partial || Boolean(node.arguments[1] && !options),
              }
            }
            const values
              = api === 'registerCharacters'
                ? value?.items
                : value
                  ? [value]
                  : undefined
            if (!values || value?.partial) {
              result.issues.push({
                message:
                  '此角色注册含动态表达式，无法完整静态解析；请在源码中管理。',
                source: source.location(node),
              })
            }
            for (const value of values ?? [])
              profiles.push({ value, call: node })
            if (
              api === 'registerCharacters'
              && value
              && ts.isArrayLiteralExpression(value.node)
              && !value.partial
              && value.node.elements.every(item =>
                ts.isObjectLiteralExpression(item),
              )
            ) {
              result.registrations.push({
                source: source.location(value.node),
                append: source.append(value.node),
              })
            }
          }
          catch (error) {
            result.issues.push({
              message: String(error),
              source: source.location(node),
            })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  if (profiles.length >= 2000)
    result.issues.push({ message: '角色索引达到 2000 个定义上限。' })

  const manifests = new Map<
    string,
    { source: StaticSources, value?: StaticValue }
  >()
  let manifestBytes = 0
  for (const { value, call } of profiles.slice(0, 2000)) {
    const field = (name: string) => value.fields?.get(name)
    const id = field('id')
    if (typeof id?.scalar !== 'string' || !id.scalar.trim()) {
      result.issues.push({
        message: '角色 ID 无法静态解析。',
        source: source.location(call),
      })
      continue
    }
    const textField = (
      value: StaticValue | undefined,
      fallback = '',
    ): CharacterField => ({
      value: typeof value?.scalar === 'string' ? value.scalar : fallback,
      edit:
        value && ts.isStringLiteralLike(value.node)
          ? source.target(value.node)
          : undefined,
    })
    const record: CharacterRecord = {
      key: `${source.location(call).path}:${call.getStart()}:${id.scalar}:${result.characters.length}`,
      id: textField(id),
      displayName: textField(field('displayName') ?? field('name'), id.scalar),
      aliases:
        field('aliases')?.items?.flatMap(value =>
          typeof value.scalar === 'string' ? [value.scalar] : [],
        ) ?? [],
      source: source.location(value.node),
      base: [],
      expressions: [],
      warnings: [],
      remove:
        ts.isObjectLiteralExpression(value.node)
        && ts.isArrayLiteralExpression(value.node.parent)
          ? source.remove(value.node)
          : undefined,
    }
    if (value.partial) {
      record.warnings.push(
        '部分属性由动态表达式生成；列表仅包含已解析的属性。',
      )
    }
    const asset = (
      value: StaticValue,
      owner = source,
      family?: string,
    ): CharacterAsset | undefined => {
      if (typeof value.scalar !== 'string')
        return undefined
      return {
        name: value.scalar,
        path: assetPath(family ? resolveSpriteAssetPath(family, value.scalar) : value.scalar, context, 'image'),
        source: owner.location(value.node),
        edit: ts.isStringLiteralLike(value.node)
          ? owner.target(value.node)
          : undefined,
      }
    }
    const sprite = field('sprite')
    if (sprite) {
      const image = asset(sprite)
      if (image && !image.name.endsWith('.json'))
        record.base.push(image)
    }
    for (const kind of ['sprites', 'expressions']) {
      const map = field(kind)
      for (const [name, expression] of map?.fields ?? []) {
        const image = asset(expression.fields?.get('sprite') ?? expression)
        record.expressions.push({
          name: `${kind}.${name}`,
          source: source.location(expression.node),
          assets: image ? [image] : [],
          remove:
            expression.node.parent
            && ts.isPropertyAssignment(expression.node.parent)
              ? source.remove(expression.node.parent)
              : undefined,
        })
      }
    }
    const manifest
      = field('spriteManifest')
        ?? (typeof sprite?.scalar === 'string' && sprite.scalar.endsWith('.json')
          ? sprite
          : undefined)
    if (typeof manifest?.scalar === 'string') {
      const path = assetPath(manifest.scalar, context, 'document')
      if (!path) {
        record.warnings.push(`未找到差分清单：${manifest.scalar}`)
      }
      else {
        try {
          let parsed = manifests.get(path)
          if (!parsed) {
            if (manifests.size >= 128)
              throw new Error('差分清单达到 128 个上限。')
            const document = await context.readDocument(path)
            manifestBytes += document.text.length * 2
            if (manifestBytes > 16 * 1024 * 1024)
              throw new Error('差分清单达到 16 MiB 总量上限。')
            JSON.parse(document.text) // Require a real JSON manifest, never TypeScript expressions.
            const manifestSource = new StaticSources(
              context.root,
              new Map([[path, document]]),
            )
            const file = manifestSource.files[0]
            const statement = file.statements[0]
            parsed = {
              source: manifestSource,
              value:
                statement && ts.isExpressionStatement(statement)
                  ? manifestSource.evaluate(statement.expression)
                  : undefined,
            }
            manifests.set(path, parsed)
          }
          const { source: owner, value: data } = parsed
          if (data?.fields?.get('version')?.scalar !== 1)
            throw new Error('不支持的差分清单版本。')
          record.manifest = { path, line: 1, column: 1 }
          const familyValue = data.fields.get('family')?.scalar
          const family = typeof familyValue === 'string' ? familyValue : undefined
          const base = data.fields.get('base')?.fields?.get('asset')
          if (base) {
            const image = asset(base, owner, family)
            if (image)
              record.base.push(image)
          }
          const expressions = data.fields.get('expressions')
          if (expressions && ts.isObjectLiteralExpression(expressions.node))
            record.addExpression = owner.append(expressions.node)
          for (const [name, expression] of expressions?.fields ?? []) {
            if (record.expressions.length >= 1000) {
              record.warnings.push(
                '差分达到 1000 项上限，其余请打开清单查看。',
              )
              break
            }
            const assets: CharacterAsset[] = []
            for (const layer of expression.fields?.get('layers')?.items ?? []) {
              const ref = layer.fields?.get('asset')
              if (ref) {
                const image = asset(ref, owner, family)
                if (image)
                  assets.push(image)
              }
            }
            record.expressions.push({
              name,
              source: owner.location(expression.node),
              assets,
              remove: ts.isPropertyAssignment(expression.node.parent)
                ? owner.remove(expression.node.parent)
                : undefined,
            })
          }
        }
        catch (error) {
          record.warnings.push(`差分清单读取失败：${String(error)}`)
        }
      }
    }
    if (field('spriteBase') && !record.expressions.length) {
      record.warnings.push(
        'spriteBase 使用动态短名称；在源码中定义 sprites / expressions 或关联差分清单后可列出差分。',
      )
    }
    result.characters.push(record)
  }
  const counts = new Map<string, number>()
  for (const record of result.characters)
    counts.set(record.id.value, (counts.get(record.id.value) ?? 0) + 1)
  for (const record of result.characters) {
    if (counts.get(record.id.value)! > 1) {
      record.warnings.push(
        '项目中存在重复 ID；实际注册结果取决于运行时调用顺序。',
      )
    }
  }
  // A literal shared by multiple profiles is not an independently editable field.
  const uses = new Map<string, number>()
  for (const record of result.characters) {
    if (record.id.edit && record.displayName.edit?.path === record.id.edit.path && record.displayName.edit.start === record.id.edit.start)
      record.displayName.edit = undefined
    const keys = new Set(
      [record.id.edit, record.displayName.edit]
        .filter(Boolean)
        .map(edit => `${edit!.path}:${edit!.start}`),
    )
    for (const key of keys) uses.set(key, (uses.get(key) ?? 0) + 1)
  }
  for (const record of result.characters) {
    for (const field of [record.id, record.displayName]) {
      if (field.edit && uses.get(`${field.edit.path}:${field.edit.start}`)! > 1)
        field.edit = undefined
    }
  }
  return result
}

function assetPath(
  name: string,
  context: EditorPluginIndexContext,
  kind: 'image' | 'document',
): string | undefined {
  if (/^(?:[a-z]+:|[/\\])/i.test(name) || name.split(/[\\/]/).includes('../..'))
    return undefined
  const clean = normalizePath(name)
  const candidates = new Set([
    clean,
    `assets/characters/${clean.replace(/^characters\//, '')}`,
  ])
  const matches = context.entries.filter(
    entry => entry.kind === kind && candidates.has(entry.path),
  )
  return matches.length === 1 ? matches[0].path : undefined
}
