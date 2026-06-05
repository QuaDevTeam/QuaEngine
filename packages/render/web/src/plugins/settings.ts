import type {
  SettingsJsonSchema,
  SettingsProjection,
  SettingsScopeProjection,
  SettingsUiControlHint,
  SettingsUiOption,
  SettingsValidationIssue,
} from '@quajs/plugin-settings/contracts'
import type { QuaViewProjection, ViewUiOverlayProjection, ViewUiSceneProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { SETTINGS_PLUGIN_ID, SettingsRenderToLogicEvents } from '@quajs/plugin-settings/contracts'
import { DEFAULT_UI_OVERLAY_Z_INDEXES } from '@quajs/render-core'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'
import { applyUiOverlayStackPlacement, applyUiSceneDataAttributes, dispatchRendererIntent } from './shared'

export interface SettingsFormProjection {
  revision: number
  profileId: string
  updatedAt: number
  scopes: readonly SettingsScopeFormProjection[]
}

export interface SettingsScopeFormProjection {
  scope: string
  title?: string
  description?: string
  packageId?: string
  source: SettingsScopeProjection
  groups: readonly SettingsFieldGroupProjection[]
}

export interface SettingsFieldGroupProjection {
  id: string
  label?: string
  description?: string
  order?: number
  fields: readonly SettingsFieldFormProjection[]
}

export interface SettingsFieldFormProjection {
  scope: string
  name: string
  path: readonly string[]
  pathKey: string
  schema: SettingsJsonSchema
  control: SettingsUiControlHint
  value: unknown
  defaultValue: unknown
  required: boolean
  readonly: boolean
  errors: readonly SettingsValidationIssue[]
  children?: readonly SettingsFieldFormProjection[]
}

export interface SettingsRendererPluginOptions {
  elementId?: string
  renderCustomControl?: (
    context: QuaWebDomLayerContext,
    control: SettingsCustomControlRenderContext,
  ) => Node | undefined
}

export interface SettingsCustomControlRenderContext {
  scope: SettingsScopeFormProjection
  field: SettingsFieldFormProjection
  value: unknown
  readonly: boolean
  disabled: boolean
  update: (value: unknown) => void
}

export interface SettingsInputParseResult {
  ok: boolean
  value?: unknown
}

const DEFAULT_SETTINGS_ELEMENT_ID = 'settings'
const DEFAULT_GROUP_ID = 'default'

export function createSettingsWebRendererPlugin(options: SettingsRendererPluginOptions = {}): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/settings',
    setup() {},
    layers: [{
      id: 'settings',
      order: 96,
      plane: 'screen',
      render: context => renderSettingsLayer(context, options),
    }],
  })
}

export const settingsWebRendererPlugin = createSettingsWebRendererPlugin()

export function getSettingsProjectionFromView(view: Readonly<QuaViewProjection>): SettingsProjection | undefined {
  return view.plugins[SETTINGS_PLUGIN_ID] as SettingsProjection | undefined
}

export function isSettingsOverlayVisible(
  view: Readonly<QuaViewProjection>,
  elementId = DEFAULT_SETTINGS_ELEMENT_ID,
): boolean {
  const overlay = view.ui.overlays?.[elementId] as { open?: unknown } | undefined
  return Boolean(overlay && overlay.open !== false)
}

export function createSettingsFormProjection(projection: SettingsProjection): SettingsFormProjection {
  return {
    revision: projection.revision,
    profileId: projection.profileId,
    updatedAt: projection.updatedAt,
    scopes: Object.entries(projection.scopes)
      .map(([scope, source]) => createSettingsScopeFormProjection(scope, source))
      .sort(compareSettingsScopes),
  }
}

export function createSettingsValuePatch(
  scope: SettingsScopeProjection,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [root, ...rest] = path
  if (!root) {
    return {}
  }
  if (rest.length === 0) {
    return { [root]: value }
  }

  const nextRoot = isRecord(scope.values[root])
    ? cloneJsonObject(scope.values[root] as Record<string, unknown>)
    : {}
  setNestedValue(nextRoot, rest, value)
  return { [root]: nextRoot }
}

export function parseSettingsControlValue(
  field: SettingsFieldFormProjection,
  raw: string,
  checked = false,
): SettingsInputParseResult {
  const control = settingsFieldControlKind(field)
  if (control === 'switch' || control === 'checkbox') {
    return { ok: true, value: checked }
  }
  if (control === 'select' || control === 'radio') {
    return parseEncodedOption(raw)
  }
  if (fieldSchemaHasType(field.schema, 'array') || fieldSchemaHasType(field.schema, 'object')) {
    try {
      return { ok: true, value: JSON.parse(raw) }
    }
    catch {
      return { ok: false }
    }
  }
  if (control === 'number' || control === 'slider' || control === 'range') {
    if (raw === '') {
      return { ok: false }
    }
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      return { ok: false }
    }
    return {
      ok: true,
      value: fieldSchemaHasType(field.schema, 'integer') ? Math.trunc(value) : value,
    }
  }
  return { ok: true, value: raw }
}

export function encodeSettingsOptionValue(value: unknown): string {
  return JSON.stringify(value)
}

export function stringifySettingsInputValue(field: SettingsFieldFormProjection): string {
  if (field.value === undefined || field.value === null) {
    return ''
  }
  if (fieldSchemaHasType(field.schema, 'array') || fieldSchemaHasType(field.schema, 'object')) {
    return JSON.stringify(field.value, null, 2)
  }
  return String(field.value)
}

function createSettingsScopeFormProjection(scope: string, source: SettingsScopeProjection): SettingsScopeFormProjection {
  const fields = createSettingsFieldFormProjections({
    scope,
    schema: source.schema,
    values: source.values,
    defaults: source.defaults,
    errors: source.errors || [],
    ui: source.ui,
    required: new Set(source.schema.required || []),
    path: [],
    readonlyParent: false,
  }).sort(compareSettingsFields)

  const groups = groupSettingsFields(source, fields)
  return {
    scope,
    title: source.title,
    description: source.description,
    packageId: source.packageId,
    source,
    groups,
  }
}

interface CreateFieldsInput {
  scope: string
  schema: SettingsJsonSchema
  values: Readonly<Record<string, unknown>>
  defaults: Readonly<Record<string, unknown>>
  errors: readonly SettingsValidationIssue[]
  ui?: SettingsScopeProjection['ui']
  required: ReadonlySet<string>
  path: readonly string[]
  readonlyParent: boolean
}

function createSettingsFieldFormProjections(input: CreateFieldsInput): SettingsFieldFormProjection[] {
  const properties = input.schema.properties || {}
  return Object.entries(properties).map(([name, schema]) => {
    const path = [...input.path, name]
    const pathKey = path.join('.')
    const control = createControlHint(input.ui, path, name, schema)
    const value = readNestedValue(input.values, path)
    const defaultValue = readNestedValue(input.defaults, path)
    const readonly = Boolean(input.readonlyParent || schema.readOnly || control.readonly)
    const children = fieldSchemaHasType(schema, 'object')
      ? createSettingsFieldFormProjections({
          ...input,
          schema,
          values: input.values,
          defaults: input.defaults,
          required: new Set(schema.required || []),
          path,
          readonlyParent: readonly,
        }).sort(compareSettingsFields)
      : undefined

    return {
      scope: input.scope,
      name,
      path,
      pathKey,
      schema,
      control,
      value,
      defaultValue,
      required: input.required.has(name),
      readonly,
      errors: collectFieldErrors(input.errors, pathKey),
      children,
    }
  })
}

function createControlHint(
  ui: SettingsScopeProjection['ui'],
  path: readonly string[],
  name: string,
  schema: SettingsJsonSchema,
): SettingsUiControlHint {
  const pathKey = path.join('.')
  return {
    ...inferSettingsControl(schema, name),
    ...(schema['x-qua-ui'] || {}),
    ...(ui?.controls?.[pathKey] || {}),
    ...(path.length === 1 ? ui?.controls?.[name] || {} : {}),
  }
}

function groupSettingsFields(
  source: SettingsScopeProjection,
  fields: readonly SettingsFieldFormProjection[],
): readonly SettingsFieldGroupProjection[] {
  const groups = new Map<string, SettingsFieldFormProjection[]>()
  for (const field of fields) {
    const group = field.control.group || DEFAULT_GROUP_ID
    groups.set(group, [...(groups.get(group) || []), field])
  }

  return [...groups.entries()]
    .map(([id, groupFields]) => {
      const hint = source.ui?.groups?.[id]
      return {
        id,
        label: hint?.label,
        description: hint?.description,
        order: hint?.order,
        fields: groupFields.sort(compareSettingsFields),
      }
    })
    .sort(compareSettingsGroups)
}

function renderSettingsLayer(context: QuaWebDomLayerContext, options: SettingsRendererPluginOptions): Node | undefined {
  const elementId = options.elementId || DEFAULT_SETTINGS_ELEMENT_ID
  const projection = getSettingsProjectionFromView(context.view)
  if (!projection || !isSettingsOverlayVisible(context.view, elementId)) {
    return undefined
  }

  const form = createSettingsFormProjection(projection)
  const overlay = context.view.ui.overlays?.[elementId] as ViewUiOverlayProjection | undefined
  const scene = overlay?.scene as ViewUiSceneProjection | undefined
  const layer = context.document.createElement('div')
  layer.className = [
    'qua-settings-layer',
    scene ? 'qua-settings-layer--ui-scene' : '',
    scene?.presentation === 'scene' ? 'qua-settings-layer--scene' : '',
    scene?.presentation === 'overlay' ? 'qua-settings-layer--overlay' : '',
  ].filter(Boolean).join(' ')
  layer.style.pointerEvents = 'auto'
  applyUiOverlayStackPlacement(layer, overlay, {
    overlayStack: 'overlay',
    zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.settings,
  })
  applyUiSceneDataAttributes(layer, scene)
  layer.addEventListener('click', event => event.stopPropagation())

  const panel = context.document.createElement('section')
  panel.className = 'qua-settings-panel'
  panel.setAttribute('data-settings-overlay', elementId)
  bindUiControlSkin(context, panel, {
    kind: 'panel',
  })

  const header = context.document.createElement('header')
  header.className = 'qua-settings-header'
  const title = context.document.createElement('h2')
  title.className = 'qua-settings-title'
  title.textContent = 'Settings'
  header.append(title)

  const headerActions = context.document.createElement('div')
  headerActions.className = 'qua-settings-header-actions'

  const resetAll = context.document.createElement('button')
  resetAll.className = 'qua-settings-reset-all'
  resetAll.type = 'button'
  resetAll.textContent = 'Reset'
  bindUiControlSkin(context, resetAll, {
    kind: 'button',
  })
  resetAll.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(SettingsRenderToLogicEvents.RESET_ALL_REQUEST), {
      phase: 'settings:reset-all',
    })
  })
  headerActions.append(resetAll)

  const close = context.document.createElement('button')
  close.className = 'qua-settings-close'
  close.type = 'button'
  close.textContent = 'Close'
  bindUiControlSkin(context, close, {
    kind: 'button',
  })
  close.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestUiClose(elementId), {
      phase: 'settings:close',
      metadata: { elementId },
    })
  })
  headerActions.append(close)
  header.append(headerActions)
  panel.append(header)

  const formNode = context.document.createElement('form')
  formNode.className = 'qua-settings-form'
  formNode.addEventListener('submit', event => event.preventDefault())
  for (const scope of form.scopes) {
    formNode.append(renderSettingsScope(context, scope, options))
  }
  panel.append(formNode)

  layer.append(panel)
  return layer
}

function setOptionalBooleanAttribute(element: HTMLElement, name: string, value: boolean): void {
  if (!value) {
    element.removeAttribute(name)
    return
  }
  element.setAttribute(name, 'true')
}

function applySettingsFieldAttrs(
  element: HTMLElement,
  field: SettingsFieldFormProjection,
  control: string,
): void {
  element.className = `qua-settings-field qua-settings-field--${control}`
  element.setAttribute('data-settings-field', field.pathKey)
  element.setAttribute('data-settings-control', control)
  const schemaType = settingsSchemaType(field)
  if (schemaType) {
    element.setAttribute('data-settings-type', schemaType)
  }
  setOptionalBooleanAttribute(element, 'data-settings-required', field.required)
  setOptionalBooleanAttribute(element, 'data-settings-readonly', field.readonly)
  setOptionalBooleanAttribute(element, 'data-settings-invalid', field.errors.length > 0)
}

function renderSettingsScope(
  context: QuaWebDomLayerContext,
  scope: SettingsScopeFormProjection,
  options: SettingsRendererPluginOptions,
): Node {
  const section = context.document.createElement('section')
  section.className = 'qua-settings-scope'
  section.setAttribute('data-settings-scope', scope.scope)

  const header = context.document.createElement('header')
  header.className = 'qua-settings-scope-header'
  const title = context.document.createElement('h3')
  title.className = 'qua-settings-scope-title'
  title.textContent = scope.title || scope.scope
  header.append(title)
  section.append(header)

  if (scope.description) {
    const description = context.document.createElement('p')
    description.className = 'qua-settings-scope-description'
    description.textContent = scope.description
    section.append(description)
  }

  for (const group of scope.groups) {
    section.append(renderSettingsGroup(context, scope, group, options))
  }
  return section
}

function renderSettingsGroup(
  context: QuaWebDomLayerContext,
  scope: SettingsScopeFormProjection,
  group: SettingsFieldGroupProjection,
  options: SettingsRendererPluginOptions,
): Node {
  const fieldset = context.document.createElement('fieldset')
  fieldset.className = 'qua-settings-group'
  fieldset.setAttribute('data-settings-group', group.id)
  if (group.label || group.id !== DEFAULT_GROUP_ID) {
    const legend = context.document.createElement('legend')
    legend.className = 'qua-settings-group-title'
    legend.textContent = group.label || group.id
    fieldset.append(legend)
  }
  if (group.description) {
    const description = context.document.createElement('p')
    description.className = 'qua-settings-group-description'
    description.textContent = group.description
    fieldset.append(description)
  }
  for (const field of group.fields) {
    fieldset.append(renderSettingsField(context, scope, field, options))
  }
  return fieldset
}

function renderSettingsField(
  context: QuaWebDomLayerContext,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  options: SettingsRendererPluginOptions,
): Node {
  if (field.control.hidden) {
    return context.document.createTextNode('')
  }

  const control = settingsFieldControlKind(field)
  const wrapper = context.document.createElement('div')
  applySettingsFieldAttrs(wrapper, field, control)

  if (isSettingsGroupField(field)) {
    const fieldset = context.document.createElement('fieldset')
    fieldset.className = 'qua-settings-nested-group'
    const legend = context.document.createElement('legend')
    legend.className = 'qua-settings-field-label'
    legend.textContent = field.control.label || field.name
    fieldset.append(legend)
    for (const child of field.children || []) {
      fieldset.append(renderSettingsField(context, scope, child, options))
    }
    wrapper.append(fieldset)
    return wrapper
  }

  const main = context.document.createElement('div')
  main.className = 'qua-settings-field-main'

  const copy = context.document.createElement('div')
  copy.className = 'qua-settings-field-copy'

  const label = context.document.createElement('label')
  label.className = 'qua-settings-field-label'
  label.setAttribute('for', settingsFieldInputId(scope.scope, field.pathKey))
  label.textContent = field.control.label || field.name
  copy.append(label)

  if (field.control.description || field.schema.description) {
    const description = context.document.createElement('p')
    description.className = 'qua-settings-field-description'
    description.textContent = field.control.description || field.schema.description || ''
    copy.append(description)
  }

  const controlNode = context.document.createElement('div')
  controlNode.className = 'qua-settings-field-control'
  controlNode.append(renderSettingsFieldControl(context, scope, field, options))
  main.append(copy, controlNode)
  wrapper.append(main)

  for (const error of field.errors) {
    const errorNode = context.document.createElement('p')
    errorNode.className = 'qua-settings-field-error'
    errorNode.textContent = error.message
    wrapper.append(errorNode)
  }

  return wrapper
}

function renderSettingsFieldControl(
  context: QuaWebDomLayerContext,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  options: SettingsRendererPluginOptions,
): Node {
  const control = settingsFieldControlKind(field)
  const skinKind = control === 'switch' || control === 'checkbox'
    ? 'toggle'
    : control === 'select' || control === 'radio'
      ? 'tab'
      : 'input'
  if (control === 'custom') {
    return renderSettingsCustomControl(context, scope, field, options)
  }

  if (control === 'textarea' || fieldSchemaHasType(field.schema, 'array') || fieldSchemaHasType(field.schema, 'object')) {
    const textarea = context.document.createElement('textarea')
    textarea.className = 'qua-settings-control qua-settings-control--textarea'
    textarea.setAttribute('data-settings-control', control)
    textarea.id = settingsFieldInputId(scope.scope, field.pathKey)
    textarea.disabled = field.readonly
    textarea.value = stringifySettingsInputValue(field)
    bindUiControlSkin(context, textarea, {
      kind: skinKind,
      disabled: field.readonly,
    })
    textarea.addEventListener('change', () => updateSettingsField(context, scope, field, textarea.value))
    return textarea
  }

  if (control === 'select') {
    const select = context.document.createElement('select')
    select.className = 'qua-settings-control qua-settings-control--select'
    select.setAttribute('data-settings-control', control)
    select.id = settingsFieldInputId(scope.scope, field.pathKey)
    select.disabled = field.readonly
    for (const option of createSettingsOptions(field)) {
      const optionNode = context.document.createElement('option')
      optionNode.value = encodeSettingsOptionValue(option.value)
      optionNode.textContent = option.label || String(option.value)
      optionNode.selected = settingsValuesEqual(option.value, field.value)
      select.append(optionNode)
    }
    bindUiControlSkin(context, select, {
      kind: skinKind,
      disabled: field.readonly,
    })
    select.addEventListener('change', () => updateSettingsField(context, scope, field, select.value))
    return select
  }

  if (control === 'radio') {
    const group = context.document.createElement('div')
    group.className = 'qua-settings-control qua-settings-control--radio qua-settings-radio-group'
    group.setAttribute('data-settings-control', control)
    bindUiControlSkin(context, group, {
      kind: skinKind,
      disabled: field.readonly,
    })
    for (const option of createSettingsOptions(field)) {
      const optionLabel = context.document.createElement('label')
      optionLabel.className = 'qua-settings-radio-option'
      const radio = context.document.createElement('input')
      radio.type = 'radio'
      radio.name = settingsFieldInputId(scope.scope, field.pathKey)
      radio.value = encodeSettingsOptionValue(option.value)
      radio.checked = settingsValuesEqual(option.value, field.value)
      radio.disabled = field.readonly
      bindUiControlSkin(context, optionLabel, {
        kind: skinKind,
        disabled: field.readonly,
        selected: settingsValuesEqual(option.value, field.value),
      })
      radio.addEventListener('change', () => {
        if (radio.checked) {
          updateSettingsField(context, scope, field, radio.value)
        }
      })
      optionLabel.append(radio, option.label || String(option.value))
      group.append(optionLabel)
    }
    return group
  }

  const input = context.document.createElement('input')
  input.id = settingsFieldInputId(scope.scope, field.pathKey)
  input.disabled = field.readonly

  if (control === 'switch' || control === 'checkbox') {
    input.className = 'qua-settings-control qua-settings-control--checkbox'
    input.setAttribute('data-settings-control', control)
    input.type = 'checkbox'
    input.checked = Boolean(field.value)
    bindUiControlSkin(context, input, {
      kind: skinKind,
      disabled: field.readonly,
      selected: Boolean(field.value),
    })
    input.addEventListener('change', () => updateSettingsField(context, scope, field, input.value, input.checked))
    return input
  }

  input.type = control === 'color'
    ? 'color'
    : control === 'number'
      ? 'number'
      : control === 'slider' || control === 'range'
        ? 'range'
        : 'text'
  input.className = `qua-settings-control qua-settings-control--${input.type}`
  input.setAttribute('data-settings-control', control)
  if (field.control.min !== undefined) {
    input.min = String(field.control.min)
  }
  if (field.control.max !== undefined) {
    input.max = String(field.control.max)
  }
  if (field.control.step !== undefined) {
    input.step = String(field.control.step)
  }
  if (field.control.placeholder) {
    input.placeholder = field.control.placeholder
  }
  input.value = stringifySettingsInputValue(field)
  bindUiControlSkin(context, input, {
    kind: skinKind,
    disabled: field.readonly,
  })
  input.addEventListener('change', () => updateSettingsField(context, scope, field, input.value))
  return input
}

function renderSettingsCustomControl(
  context: QuaWebDomLayerContext,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  options: SettingsRendererPluginOptions,
): Node {
  const rendered = options.renderCustomControl?.(context, {
    scope,
    field,
    value: field.value,
    readonly: field.readonly,
    disabled: field.readonly,
    update: value => updateSettingsFieldValue(context, scope, field, value),
  })
  if (rendered) {
    return rendered
  }

  const custom = context.document.createElement('div')
  custom.className = 'qua-settings-custom-control qua-settings-control qua-settings-control--custom'
  custom.id = settingsFieldInputId(scope.scope, field.pathKey)
  custom.setAttribute('role', 'group')
  custom.setAttribute('aria-disabled', field.readonly ? 'true' : 'false')
  if (field.control.component) {
    custom.setAttribute('data-settings-component', field.control.component)
  }
  if (field.control.props) {
    custom.setAttribute('data-settings-props', JSON.stringify(field.control.props))
  }
  bindUiControlSkin(context, custom, {
    kind: 'input',
    disabled: field.readonly,
  })
  return custom
}

function updateSettingsField(
  context: QuaWebDomLayerContext,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  raw: string,
  checked = false,
): void {
  const parsed = parseSettingsControlValue(field, raw, checked)
  if (!parsed.ok) {
    return
  }
  dispatchRendererIntent(context, () => context.actions.requestPluginEvent(SettingsRenderToLogicEvents.UPDATE_REQUEST, {
    scope: scope.scope,
    patch: createSettingsValuePatch(scope.source, field.path, parsed.value),
  }), {
    phase: 'settings:update',
    metadata: {
      scope: scope.scope,
      path: field.path,
    },
  })
}

function updateSettingsFieldValue(
  context: QuaWebDomLayerContext,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  value: unknown,
): void {
  dispatchRendererIntent(context, () => context.actions.requestPluginEvent(SettingsRenderToLogicEvents.UPDATE_REQUEST, {
    scope: scope.scope,
    patch: createSettingsValuePatch(scope.source, field.path, value),
  }), {
    phase: 'settings:update',
    metadata: {
      scope: scope.scope,
      path: field.path,
    },
  })
}

function isSettingsGroupField(field: SettingsFieldFormProjection): boolean {
  return Boolean((field.control.control || inferSettingsControlKind(field.schema)) === 'group' && field.children?.length)
}

function settingsFieldControlKind(field: SettingsFieldFormProjection): string {
  return field.control.control || inferSettingsControlKind(field.schema) || 'text'
}

function settingsSchemaType(field: SettingsFieldFormProjection): string | undefined {
  const schemaType = field.schema.type
  if (Array.isArray(schemaType)) {
    return [...schemaType].join(' ')
  }
  if (typeof schemaType === 'string') {
    return schemaType
  }
  if (field.schema.properties) {
    return 'object'
  }
  if (field.schema.items) {
    return 'array'
  }
  return undefined
}

function inferSettingsControl(schema: SettingsJsonSchema, field: string): SettingsUiControlHint {
  const control = inferSettingsControlKind(schema)
  return {
    control,
    label: schema.title || titleFromField(field),
    description: schema.description,
    min: schema.minimum,
    max: schema.maximum,
    step: schema.multipleOf,
    options: schema.enum ? createOptions(schema.enum) : undefined,
  }
}

function inferSettingsControlKind(schema: SettingsJsonSchema): SettingsUiControlHint['control'] {
  if (schema.enum?.length) {
    return 'select'
  }
  if (fieldSchemaHasType(schema, 'boolean')) {
    return 'switch'
  }
  if (fieldSchemaHasType(schema, 'number') || fieldSchemaHasType(schema, 'integer')) {
    return schema.minimum !== undefined || schema.maximum !== undefined ? 'slider' : 'number'
  }
  if (fieldSchemaHasType(schema, 'string') && schema.format === 'color') {
    return 'color'
  }
  if (fieldSchemaHasType(schema, 'object')) {
    return 'group'
  }
  if (fieldSchemaHasType(schema, 'array')) {
    return 'textarea'
  }
  return 'text'
}

function createSettingsOptions(field: SettingsFieldFormProjection): readonly SettingsUiOption[] {
  if (field.control.options?.length) {
    return field.control.options
  }
  return field.schema.enum ? createOptions(field.schema.enum) : []
}

function createOptions(values: readonly unknown[]): SettingsUiOption[] {
  return values.map(value => ({
    value: value as SettingsUiOption['value'],
    label: typeof value === 'string' ? titleFromField(value) : String(value),
  }))
}

function parseEncodedOption(raw: string): SettingsInputParseResult {
  try {
    return { ok: true, value: JSON.parse(raw) }
  }
  catch {
    return { ok: false }
  }
}

function collectFieldErrors(errors: readonly SettingsValidationIssue[], pathKey: string): SettingsValidationIssue[] {
  return errors.filter(error => error.path === pathKey || error.path.startsWith(`${pathKey}.`))
}

function compareSettingsScopes(left: SettingsScopeFormProjection, right: SettingsScopeFormProjection): number {
  return compareOptionalNumbers(left.source.ui?.order, right.source.ui?.order)
    || compareText(left.title || left.scope, right.title || right.scope)
}

function compareSettingsGroups(left: SettingsFieldGroupProjection, right: SettingsFieldGroupProjection): number {
  return compareOptionalNumbers(left.order, right.order) || compareText(left.label || left.id, right.label || right.id)
}

function compareSettingsFields(left: SettingsFieldFormProjection, right: SettingsFieldFormProjection): number {
  return compareOptionalNumbers(left.control.order, right.control.order)
    || compareText(left.control.label || left.name, right.control.label || right.name)
}

function compareOptionalNumbers(left: number | undefined, right: number | undefined): number {
  return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER)
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right)
}

function fieldSchemaHasType(schema: SettingsJsonSchema, type: string): boolean {
  const schemaType = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  return schemaType.includes(type as any)
    || (type === 'object' && Boolean(schema.properties))
    || (type === 'array' && Boolean(schema.items))
}

function readNestedValue(source: Readonly<Record<string, unknown>>, path: readonly string[]): unknown {
  let current: unknown = source
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

function setNestedValue(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let current = target
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      current[segment] = value
      return
    }
    const next = current[segment]
    if (isRecord(next)) {
      current = next
    }
    else {
      const created: Record<string, unknown> = {}
      current[segment] = created
      current = created
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function settingsValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function settingsFieldInputId(scope: string, pathKey: string): string {
  return `qua-settings-${scope}-${pathKey}`.replace(/[^\w-]/g, '-')
}

function titleFromField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}
