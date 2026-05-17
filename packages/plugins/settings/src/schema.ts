import type {
  AnySettingsScopeContribution,
  SettingsExposure,
  SettingsJsonSchema,
  SettingsScopeProjection,
  SettingsUiControlHint,
  SettingsUiHints,
  SettingsUiOption,
  SettingsValidationIssue,
  SettingsValues,
} from './contracts'
import { cloneSettingsValue, isPlainSettingsObject } from './runtime/json'

export interface SettingsScopeProjectionInput {
  contribution: AnySettingsScopeContribution
  defaults: SettingsValues
  values: SettingsValues
  errors?: readonly SettingsValidationIssue[]
}

interface SettingsVisibilityContext {
  include?: ReadonlySet<string>
  exclude: ReadonlySet<string>
  readonly: ReadonlySet<string>
  ui?: SettingsUiHints
}

interface SettingsVisibilityProjection {
  schema: SettingsJsonSchema
  paths: ReadonlySet<string>
}

interface SettingsValueValidationOptions {
  validateNested?: boolean
}

export function createSettingsScopeProjection(input: SettingsScopeProjectionInput): SettingsScopeProjection | undefined {
  const { contribution } = input
  const player = contribution.player
  if (!player || player.expose === false) {
    return undefined
  }

  const schema = normalizeObjectSchema(player.schema)
  const visibility = createSettingsVisibilityProjection(schema, player.expose, player.ui)
  if (Object.keys(visibility.schema.properties || {}).length === 0) {
    return undefined
  }

  const ui = createSettingsUiHints(visibility.schema, player.ui, visibility.paths)

  return {
    version: contribution.version,
    packageId: contribution.packageId,
    title: contribution.title || visibility.schema.title,
    description: contribution.description || visibility.schema.description,
    schema: visibility.schema,
    ui,
    defaults: pickSettingsValuesBySchema(input.defaults, visibility.schema),
    values: pickSettingsValuesBySchema(input.values, visibility.schema),
    metadata: player.metadata ? cloneSettingsValue(player.metadata) : undefined,
    errors: input.errors?.length ? input.errors.map(error => ({ ...error })) : undefined,
  }
}

export function validateSettingsPatch(
  schemaInput: SettingsJsonSchema,
  patch: SettingsValues,
  expose?: boolean | SettingsExposure,
  ui?: SettingsUiHints,
): SettingsValidationIssue[] {
  const schema = normalizeObjectSchema(schemaInput)
  const visibleSchema = createSettingsVisibilityProjection(schema, expose, ui).schema
  const issues: SettingsValidationIssue[] = []

  if (!isPlainSettingsObject(patch)) {
    return [{ path: '', message: 'Settings patch must be an object.', keyword: 'type' }]
  }

  for (const [key, value] of Object.entries(patch)) {
    const path = [key]
    const propertySchema = visibleSchema.properties?.[key]
    if (!propertySchema) {
      issues.push(createSettingsExposeIssue(path))
      continue
    }
    issues.push(...validateSettingsPatchValue(
      propertySchema,
      schema.properties?.[key] || propertySchema,
      value,
      path,
      expose,
      ui,
      false,
    ))
  }

  return issues
}

export function normalizeObjectSchema(schema: SettingsJsonSchema): SettingsJsonSchema {
  const cloned = cloneSettingsValue(schema)
  if (!cloned.type && cloned.properties) {
    cloned.type = 'object'
  }
  if (cloned.type !== 'object') {
    return {
      ...cloned,
      type: 'object',
      properties: cloned.properties || {},
    }
  }
  return {
    ...cloned,
    properties: cloned.properties || {},
  }
}

export function getVisibleSettingsFields(
  schema: SettingsJsonSchema,
  expose?: boolean | SettingsExposure,
  ui?: SettingsUiHints,
): Set<string> {
  const visibleSchema = createSettingsVisibilityProjection(normalizeObjectSchema(schema), expose, ui).schema
  return new Set(Object.keys(visibleSchema.properties || {}))
}

export function createSettingsUiHints(
  schema: SettingsJsonSchema,
  ui: SettingsUiHints | undefined,
  visibleFields: ReadonlySet<string> = collectSettingsSchemaPaths(schema),
): SettingsUiHints | undefined {
  const controls: Record<string, SettingsUiControlHint> = {}
  for (const pathKey of normalizeVisibleSettingsPaths(schema, visibleFields)) {
    const path = pathKey.split('.')
    const property = readSettingsSchemaAtPath(schema, path)
    if (!property) {
      continue
    }
    const field = path[path.length - 1] || pathKey
    controls[pathKey] = {
      ...inferSettingsControl(field, property),
      ...settingsControlHintAtPath(path, property, ui),
    }
  }

  if (!ui && Object.keys(controls).length === 0) {
    return undefined
  }

  return {
    label: ui?.label || schema.title,
    description: ui?.description || schema.description,
    order: ui?.order,
    icon: ui?.icon,
    groups: ui?.groups ? cloneSettingsValue(ui.groups) : undefined,
    controls,
  }
}

function createSettingsVisibilityProjection(
  schema: SettingsJsonSchema,
  expose?: boolean | SettingsExposure,
  ui?: SettingsUiHints,
): SettingsVisibilityProjection {
  if (expose === false) {
    return {
      schema: {
        ...cloneSettingsValue(schema),
        properties: {},
        required: [],
        additionalProperties: false,
      },
      paths: new Set(),
    }
  }

  const context = createSettingsVisibilityContext(expose, ui)
  const filteredSchema = filterSettingsSchemaForRenderer(schema, context, [], false) || {
    ...cloneSettingsValue(schema),
    properties: {},
    required: [],
    additionalProperties: false,
  }

  return {
    schema: filteredSchema,
    paths: collectSettingsSchemaPaths(filteredSchema),
  }
}

function createSettingsVisibilityContext(
  expose: boolean | SettingsExposure | undefined,
  ui: SettingsUiHints | undefined,
): SettingsVisibilityContext {
  const exposure = expose && typeof expose === 'object' ? expose : undefined
  return {
    include: exposure?.include ? new Set(exposure.include) : undefined,
    exclude: new Set(exposure?.exclude || []),
    readonly: new Set(exposure?.readonly || []),
    ui,
  }
}

function filterSettingsSchemaForRenderer(
  schema: SettingsJsonSchema,
  context: SettingsVisibilityContext,
  path: readonly string[],
  ancestorIncluded: boolean,
): SettingsJsonSchema | undefined {
  if (path.length > 0 && !isSettingsFieldVisibleForRenderer(path, schema, context, ancestorIncluded)) {
    return undefined
  }

  const cloned = cloneSettingsValue(schema)
  if (isSettingsPathReadOnlyInContext(path, context)) {
    cloned.readOnly = true
  }
  const properties = schema.properties
  if (!properties) {
    return cloned
  }

  const pathExplicitlyIncluded = isSettingsPathExplicitlyIncluded(path, context)
  const descendantsIncluded = ancestorIncluded || pathExplicitlyIncluded
  const filteredProperties: Record<string, SettingsJsonSchema> = {}
  for (const [field, property] of Object.entries(properties)) {
    const childPath = [...path, field]
    const filtered = filterSettingsSchemaForRenderer(property, context, childPath, descendantsIncluded)
    if (filtered) {
      filteredProperties[field] = filtered
    }
  }

  const visibleOnlyBecauseOfDescendant = Boolean(
    path.length > 0
    && context.include
    && !ancestorIncluded
    && !pathExplicitlyIncluded,
  )
  if (visibleOnlyBecauseOfDescendant && Object.keys(filteredProperties).length === 0) {
    return undefined
  }

  return {
    ...cloned,
    properties: filteredProperties,
    required: schema.required?.filter(field => Object.prototype.hasOwnProperty.call(filteredProperties, field)),
    additionalProperties: false,
  }
}

function isSettingsFieldVisibleForRenderer(
  path: readonly string[],
  schema: SettingsJsonSchema,
  context: SettingsVisibilityContext,
  ancestorIncluded: boolean,
): boolean {
  if (
    isSettingsPathExcluded(path, context)
    || schema.writeOnly
    || schema['x-qua-expose'] === false
    || settingsControlHintAtPath(path, schema, context.ui).hidden
  ) {
    return false
  }

  if (!context.include || ancestorIncluded || isSettingsPathExplicitlyIncluded(path, context)) {
    return true
  }

  return Boolean(schema.properties && hasIncludedSettingsDescendant(path, context.include))
}

function validateSettingsPatchValue(
  filteredSchema: SettingsJsonSchema,
  originalSchema: SettingsJsonSchema,
  value: unknown,
  path: readonly string[],
  expose: boolean | SettingsExposure | undefined,
  ui: SettingsUiHints | undefined,
  readonlyParent: boolean,
): SettingsValidationIssue[] {
  const pathText = settingsPathKey(path)
  const readonly = readonlyParent || isReadOnlySettingsField(path, originalSchema, expose, ui)
  if (readonly) {
    return [{
      path: pathText,
      message: `Setting "${pathText}" is read-only and cannot be updated by the renderer.`,
      keyword: 'readOnly',
    }]
  }

  const issues = validateSettingsValue(filteredSchema, value, pathText, { validateNested: false })
  if (!isPlainSettingsObject(value) || !filteredSchema.properties) {
    return issues
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const childPath = [...path, key]
    const childSchema = filteredSchema.properties[key]
    if (!childSchema) {
      issues.push(createSettingsExposeIssue(childPath))
      continue
    }
    issues.push(...validateSettingsPatchValue(
      childSchema,
      originalSchema.properties?.[key] || childSchema,
      nestedValue,
      childPath,
      expose,
      ui,
      readonly,
    ))
  }

  return issues
}

function pickSettingsValuesBySchema(values: SettingsValues | undefined, schema: SettingsJsonSchema): SettingsValues {
  const picked: SettingsValues = {}
  if (!values) {
    return picked
  }
  for (const [field, property] of Object.entries(schema.properties || {})) {
    if (!Object.prototype.hasOwnProperty.call(values, field)) {
      continue
    }
    const value = values[field]
    if (isPlainSettingsObject(value) && property.properties) {
      picked[field] = pickSettingsValuesBySchema(value, property)
    }
    else {
      picked[field] = cloneSettingsValue(value)
    }
  }
  return picked
}

function collectSettingsSchemaPaths(schema: SettingsJsonSchema, path: readonly string[] = []): Set<string> {
  const paths = new Set<string>()
  for (const [field, property] of Object.entries(schema.properties || {})) {
    const childPath = [...path, field]
    paths.add(settingsPathKey(childPath))
    for (const nested of collectSettingsSchemaPaths(property, childPath)) {
      paths.add(nested)
    }
  }
  return paths
}

function normalizeVisibleSettingsPaths(
  schema: SettingsJsonSchema,
  visibleFields: ReadonlySet<string>,
): Set<string> {
  const paths = new Set<string>()
  for (const field of visibleFields) {
    const path = field.split('.').filter(Boolean)
    if (path.length > 0 && readSettingsSchemaAtPath(schema, path)) {
      paths.add(settingsPathKey(path))
    }
  }
  return paths
}

function readSettingsSchemaAtPath(schema: SettingsJsonSchema, path: readonly string[]): SettingsJsonSchema | undefined {
  let current: SettingsJsonSchema | undefined = schema
  for (const segment of path) {
    current = current?.properties?.[segment]
    if (!current) {
      return undefined
    }
  }
  return current
}

function isReadOnlySettingsField(
  path: readonly string[],
  schema: SettingsJsonSchema,
  expose?: boolean | SettingsExposure,
  ui?: SettingsUiHints,
): boolean {
  return Boolean(
    schema.readOnly
    || settingsControlHintAtPath(path, schema, ui).readonly
    || isSettingsPathReadOnly(path, expose),
  )
}

function settingsControlHintAtPath(
  path: readonly string[],
  schema: SettingsJsonSchema,
  ui?: SettingsUiHints,
): SettingsUiControlHint {
  const pathKey = settingsPathKey(path)
  return {
    ...(schema['x-qua-ui'] || {}),
    ...(ui?.controls?.[pathKey] || {}),
    ...(path.length === 1 ? ui?.controls?.[path[0]] || {} : {}),
  }
}

function isSettingsPathExcluded(path: readonly string[], context: SettingsVisibilityContext): boolean {
  for (let index = 1; index <= path.length; index += 1) {
    if (context.exclude.has(settingsPathKey(path.slice(0, index)))) {
      return true
    }
  }
  return false
}

function isSettingsPathReadOnly(path: readonly string[], expose?: boolean | SettingsExposure): boolean {
  const readonly = expose && typeof expose === 'object' ? expose.readonly || [] : []
  for (let index = 1; index <= path.length; index += 1) {
    if (readonly.includes(settingsPathKey(path.slice(0, index)))) {
      return true
    }
  }
  return false
}

function isSettingsPathReadOnlyInContext(path: readonly string[], context: SettingsVisibilityContext): boolean {
  for (let index = 1; index <= path.length; index += 1) {
    if (context.readonly.has(settingsPathKey(path.slice(0, index)))) {
      return true
    }
  }
  return false
}

function isSettingsPathExplicitlyIncluded(path: readonly string[], context: SettingsVisibilityContext): boolean {
  return path.length > 0 && Boolean(context.include?.has(settingsPathKey(path)))
}

function hasIncludedSettingsDescendant(path: readonly string[], include: ReadonlySet<string>): boolean {
  const prefix = `${settingsPathKey(path)}.`
  for (const included of include) {
    if (included.startsWith(prefix)) {
      return true
    }
  }
  return false
}

function createSettingsExposeIssue(path: readonly string[]): SettingsValidationIssue {
  const pathText = settingsPathKey(path)
  return {
    path: pathText,
    message: `Setting "${pathText}" is not exposed for renderer updates.`,
    keyword: 'expose',
  }
}

function settingsPathKey(path: readonly string[]): string {
  return path.join('.')
}

function inferSettingsControl(field: string, schema: SettingsJsonSchema): SettingsUiControlHint {
  const options = createOptions(schema)
  const type = Array.isArray(schema.type) ? schema.type.find(item => item !== 'null') : schema.type
  const label = schema.title || titleFromField(field)
  if (options.length > 0) {
    return { control: 'select', label, description: schema.description, options }
  }
  if (type === 'boolean') {
    return { control: 'switch', label, description: schema.description }
  }
  if (type === 'number' || type === 'integer') {
    return {
      control: schema.minimum !== undefined || schema.maximum !== undefined ? 'slider' : 'number',
      label,
      description: schema.description,
      min: schema.minimum,
      max: schema.maximum,
      step: schema.multipleOf,
    }
  }
  if (type === 'string' && schema.format === 'color') {
    return { control: 'color', label, description: schema.description }
  }
  if (type === 'object') {
    return { control: 'group', label, description: schema.description }
  }
  return { control: 'text', label, description: schema.description }
}

function createOptions(schema: SettingsJsonSchema): SettingsUiOption[] {
  return (schema.enum || []).map(value => ({
    value,
    label: typeof value === 'string' ? titleFromField(value) : String(value),
  }))
}

function titleFromField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function validateSettingsValue(
  schema: SettingsJsonSchema,
  value: unknown,
  path: string,
  options: SettingsValueValidationOptions = {},
): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = []
  const type = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  const validateNested = options.validateNested !== false

  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    issues.push({ path, message: `Expected constant value for "${path}".`, keyword: 'const' })
  }
  if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) {
    issues.push({ path, message: `Value for "${path}" is not one of the allowed options.`, keyword: 'enum' })
  }
  if (type.length > 0 && !type.some(item => valueMatchesType(value, item))) {
    issues.push({ path, message: `Value for "${path}" does not match the expected type.`, keyword: 'type' })
    return issues
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `Value for "${path}" must be at least ${schema.minimum}.`, keyword: 'minimum' })
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `Value for "${path}" must be at most ${schema.maximum}.`, keyword: 'maximum' })
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      issues.push({ path, message: `Value for "${path}" must be greater than ${schema.exclusiveMinimum}.`, keyword: 'exclusiveMinimum' })
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      issues.push({ path, message: `Value for "${path}" must be less than ${schema.exclusiveMaximum}.`, keyword: 'exclusiveMaximum' })
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `Value for "${path}" is too short.`, keyword: 'minLength' })
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path, message: `Value for "${path}" is too long.`, keyword: 'maxLength' })
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `Value for "${path}" does not match the required pattern.`, keyword: 'pattern' })
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `Array "${path}" has too few items.`, keyword: 'minItems' })
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({ path, message: `Array "${path}" has too many items.`, keyword: 'maxItems' })
    }
  }

  if (validateNested && isPlainSettingsObject(value)) {
    const properties = schema.properties || {}
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedSchema = properties[key]
      if (!nestedSchema && schema.additionalProperties === false) {
        issues.push({ path: `${path}.${key}`, message: `Unknown setting "${path}.${key}".`, keyword: 'additionalProperties' })
      }
      else if (nestedSchema) {
        issues.push(...validateSettingsValue(nestedSchema, nestedValue, `${path}.${key}`))
      }
    }
  }

  return issues
}

function valueMatchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'null':
      return value === null
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return isPlainSettingsObject(value)
    case 'array':
      return Array.isArray(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return Number.isInteger(value)
    case 'string':
      return typeof value === 'string'
    default:
      return true
  }
}
