export type PackageManager = 'pnpm' | 'npm' | 'yarn'

const PACKAGE_MANAGERS = new Set<PackageManager>(['pnpm', 'npm', 'yarn'])

export function isPackageManager(value: string | undefined): value is PackageManager {
  return Boolean(value && PACKAGE_MANAGERS.has(value as PackageManager))
}

export function detectPackageManager(userAgent = process.env.npm_config_user_agent): PackageManager {
  if (!userAgent) {
    return 'pnpm'
  }

  const [agent] = userAgent.split(' ')
  const name = agent?.split('/')[0]
  return isPackageManager(name) ? name : 'pnpm'
}

export function getInstallCommand(packageManager: PackageManager): readonly string[] {
  return packageManager === 'yarn' ? ['yarn'] : [packageManager, 'install']
}

export function getRunScriptCommand(packageManager: PackageManager, script: string): readonly string[] {
  return packageManager === 'npm'
    ? ['npm', 'run', script]
    : [packageManager, script]
}
