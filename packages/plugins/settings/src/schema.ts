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
import { cloneSettingsValue, isPlainSettingsObject, pickSettingsValues } from './runtime/json'

export interface SettingsScopeProjectionInput {
  contribution: AnySettingsScopeContribution
  defaults: SettingsValues
  values: SettingsValues
  errors?: readonly SettingsValidationIssue[]
}

export function createSettingsScopeProjection(input: SettingsScopeProjectionInput): SettingsScopeProjection | undefined {
  const { contribution } = input
  const player = contribution.player
  if (!player || player.expose === false) {
    return undefined
  }

  const schema = normalizeObjectSchema(player.schema)
  const visibleFields = getVisibleSettingsFields(schema, player.expose, player.ui)
  if (visibleFields.size === 0) {
    return undefined
  }

  const filteredSchema = filterSettingsSchema(schema, visibleFields)
  const ui = createSettingsUiHints(filteredSchema, player.ui, visibleFields)

  return {
    version: contribution.version,
    title: contribution.title || filteredSchema.title,
    description: contribution.description || filteredSchema.description,
    schema: filteredSchema,
    ui,
    defaults: pickSettingsValues(input.defaults, visibleFields),
    values: pickSettingsValues(input.values, visibleFields),
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
  const visibleFields = getVisibleSettingsFields(schema, expose, ui)
  const issues: SettingsValidationIssue[] = []

  if (!isPlainSettingsObject(patch)) {
    return [{ path: '', message: 'Settings patch must be an object.', keyword: 'type' }]
  }

  for (const [key, value] of Object.entries(patch)) {
    if (!visibleFields.has(key)) {
      issues.push({
        path: key,
        message: `Setting "${key}" is not exposed for renderer updates.`,
        keyword: 'expose',
      })
      continue
    }
    const propertySchema = schema.properties?.[key]
    if (propertySchema && isReadOnlySettingsField(key, propertySchema, expose, ui)) {
      issues.push({
        path: key,
        message: `Setting "${key}" is read-only and cannot be updated by the renderer.`,
        keyword: 'readOnly',
      })
      continue
    }
    if (propertySchema) {
      issues.push(...validateSettingsValue(propertySchema, value, key))
    }
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
  const properties = schema.properties || {}
  const baseFields = expose && typeof expose === 'object' && expose.include
    ? new Set(expose.include)
    : new Set(Object.keys(properties))

  const excluded = new Set(expose && typeof expose === 'object' ? expose.exclude || [] : [])
  const fields = new Set<string>()

  for (const field of baseFields) {
    const property = properties[field]
    const control = ui?.controls?.[field]
    if (!property || excluded.has(field) || property.writeOnly || property['x-qua-expose'] === false || control?.hidden) {
      continue
    }
    fields.add(field)
  }

  return fields
}

export function createSettingsUiHints(
  schema: SettingsJsonSchema,
  ui: SettingsUiHints | undefined,
  visibleFields = getVisibleSettingsFields(schema, true, ui),
): SettingsUiHints | undefined {
  const controls: Record<string, SettingsUiControlHint> = {}
  for (const field of visibleFields) {
    const property = schema.properties?.[field]
    if (!property) {
      continue
    }
    controls[field] = {
      ...inferSettingsControl(field, property),
      ...(property['x-qua-ui'] || {}),
      ...(ui?.controls?.[field] || {}),
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

function filterSettingsSchema(schema: SettingsJsonSchema, visibleFields: ReadonlySet<string>): SettingsJsonSchema {
  const properties: Record<string, SettingsJsonSchema> = {}
  for (const field of visibleFields) {
    const property = schema.properties?.[field]
    if (property) {
      properties[field] = cloneSettingsValue(property)
    }
  }

  return {
    ...cloneSettingsValue(schema),
    properties,
    required: schema.required?.filter(field => visibleFields.has(field)),
    additionalProperties: false,
  }
}

function isReadOnlySettingsField(
  field: string,
  schema: SettingsJsonSchema,
  expose?: boolean | SettingsExposure,
  ui?: SettingsUiHints,
): boolean {
  return Boolean(
    schema.readOnly
    || ui?.controls?.[field]?.readonly
    || (expose && typeof expose === 'object' && expose.readonly?.includes(field)),
  )
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

function validateSettingsValue(schema: SettingsJsonSchema, value: unknown, path: string): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = []
  const type = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []

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

  if (isPlainSettingsObject(value)) {
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
