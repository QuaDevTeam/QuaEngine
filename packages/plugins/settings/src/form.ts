import type {
  SettingsJsonSchema,
  SettingsProjection,
  SettingsScopeProjection,
  SettingsUiControlHint,
  SettingsUiOption,
  SettingsValidationIssue,
} from './contracts'

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

export interface SettingsInputParseResult {
  ok: boolean
  value?: unknown
}

const DEFAULT_GROUP_ID = 'default'

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
  if (!root)
    return {}
  if (rest.length === 0)
    return { [root]: value }

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
  if (control === 'switch' || control === 'checkbox')
    return { ok: true, value: checked }
  if (control === 'select' || control === 'radio')
    return parseEncodedOption(raw)
  if (fieldSchemaHasType(field.schema, 'array') || fieldSchemaHasType(field.schema, 'object')) {
    try {
      return { ok: true, value: JSON.parse(raw) }
    }
    catch {
      return { ok: false }
    }
  }
  if (control === 'number' || control === 'slider' || control === 'range') {
    if (raw === '')
      return { ok: false }
    const value = Number(raw)
    if (!Number.isFinite(value))
      return { ok: false }
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
  if (field.value === undefined || field.value === null)
    return ''
  if (fieldSchemaHasType(field.schema, 'array') || fieldSchemaHasType(field.schema, 'object'))
    return JSON.stringify(field.value, null, 2)
  return String(field.value)
}

export function isSettingsGroupField(field: SettingsFieldFormProjection): boolean {
  return Boolean((field.control.control || inferSettingsControlKind(field.schema)) === 'group' && field.children?.length)
}

export function settingsFieldControlKind(field: SettingsFieldFormProjection): string {
  return field.control.control || inferSettingsControlKind(field.schema) || 'text'
}

export function settingsSchemaType(field: SettingsFieldFormProjection): string | undefined {
  const schemaType = field.schema.type
  if (Array.isArray(schemaType))
    return [...schemaType].join(' ')
  if (typeof schemaType === 'string')
    return schemaType
  if (field.schema.properties)
    return 'object'
  if (field.schema.items)
    return 'array'
  return undefined
}

export function createSettingsOptions(field: SettingsFieldFormProjection): readonly SettingsUiOption[] {
  if (field.control.options?.length)
    return field.control.options
  return field.schema.enum ? createOptions(field.schema.enum) : []
}

export function fieldSchemaHasType(schema: SettingsJsonSchema, type: string): boolean {
  const schemaType = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  return schemaType.includes(type as never)
    || (type === 'object' && Boolean(schema.properties))
    || (type === 'array' && Boolean(schema.items))
}

export function settingsValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function settingsFieldInputId(scope: string, pathKey: string): string {
  return `qua-settings-${scope}-${pathKey}`.replace(/[^\w-]/g, '-')
}

export function titleFromField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
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
  if (schema.enum?.length)
    return 'select'
  if (fieldSchemaHasType(schema, 'boolean'))
    return 'switch'
  if (fieldSchemaHasType(schema, 'number') || fieldSchemaHasType(schema, 'integer'))
    return schema.minimum !== undefined || schema.maximum !== undefined ? 'slider' : 'number'
  if (fieldSchemaHasType(schema, 'string') && schema.format === 'color')
    return 'color'
  if (fieldSchemaHasType(schema, 'object'))
    return 'group'
  if (fieldSchemaHasType(schema, 'array'))
    return 'textarea'
  return 'text'
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

function readNestedValue(source: Readonly<Record<string, unknown>>, path: readonly string[]): unknown {
  let current: unknown = source
  for (const segment of path) {
    if (!isRecord(current))
      return undefined
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
