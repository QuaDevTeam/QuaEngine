import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_TEMPLATE_NAME = 'visual-novel-vue'

export type TemplateName = typeof DEFAULT_TEMPLATE_NAME

export interface TemplateDefinition {
  name: TemplateName
  title: string
  description: string
  directory: string
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const templates: Record<TemplateName, TemplateDefinition> = {
  'visual-novel-vue': {
    name: 'visual-novel-vue',
    title: 'Visual Novel Vue',
    description: 'Vue + Vite starter with QuaEngine, QuaScript, renderer preset, and Quack asset builds.',
    directory: resolve(packageRoot, 'templates/visual-novel-vue'),
  },
}

export function listTemplates(): TemplateDefinition[] {
  return Object.values(templates)
}

export function getTemplate(name: string): TemplateDefinition {
  const template = templates[name as TemplateName]
  if (!template) {
    throw new Error(`Unknown template "${name}". Available templates: ${listTemplates().map(item => item.name).join(', ')}`)
  }
  return template
}
