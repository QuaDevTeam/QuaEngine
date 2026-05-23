export {
  detectPackageManager,
  getInstallCommand,
  getRunScriptCommand,
  isPackageManager,
} from './package-manager'

export type { PackageManager } from './package-manager'

export {
  createQuaGame,
  createTemplateVariables,
  inferProjectName,
  normalizeProjectName,
  scaffoldProject,
} from './scaffold'

export type {
  CreateQuaGameOptions,
  ScaffoldProjectOptions,
  ScaffoldProjectResult,
  TemplateVariables,
} from './scaffold'

export {
  DEFAULT_TEMPLATE_NAME,
  getTemplate,
  listTemplates,
} from './templates'

export type { TemplateDefinition, TemplateName } from './templates'
