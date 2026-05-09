import type { DecoratorMapping } from '../core/types'
import type { DecoratorCompilationResult, DecoratorCompileInput, DecoratorCompiler } from './types'
import { createCharacterDecoratorCompiler } from '@quajs/character/script-compiler'
import { createAnimationDecoratorCompiler } from '@quajs/plugin-animation/script-compiler'
import { createBackgroundDecoratorCompiler } from '@quajs/plugin-background/script-compiler'

export class DecoratorCompilerRegistry {
  private readonly compilers: DecoratorCompiler[] = []
  private readonly runtimeHelperModules = new Map<string, string>()
  private readonly runtimeHelperOrder: string[] = []

  register(compiler: DecoratorCompiler): void {
    this.compilers.push(compiler)

    if (compiler.runtimeHelperModules) {
      Object.entries(compiler.runtimeHelperModules).forEach(([helper, module]) => {
        if (!this.runtimeHelperModules.has(helper)) {
          this.runtimeHelperModules.set(helper, module)
          this.runtimeHelperOrder.push(helper)
        }
      })
    }
  }

  getCompiler(decoratorName: string, mapping: DecoratorMapping[string]): DecoratorCompiler | undefined {
    return this.compilers.find(compiler => compiler.supports(decoratorName, mapping))
  }

  compile(input: DecoratorCompileInput): { compiler: DecoratorCompiler, result: DecoratorCompilationResult } | null {
    const compiler = this.getCompiler(input.decorator.name, input.mapping)
    if (!compiler) {
      return null
    }

    const result = compiler.compile(input)
    if (!result) {
      return null
    }

    return { compiler, result }
  }

  getRuntimeHelperModule(helperName: string): string | undefined {
    return this.runtimeHelperModules.get(helperName)
  }

  getRuntimeHelperNames(): string[] {
    return [...this.runtimeHelperOrder]
  }

  hasCompilerModule(moduleName: string): boolean {
    return this.compilers.some(compiler => compiler.module === moduleName)
  }
}

export function createDefaultDecoratorCompilerRegistry(): DecoratorCompilerRegistry {
  const registry = new DecoratorCompilerRegistry()
  registry.register(createCharacterDecoratorCompiler())
  registry.register(createBackgroundDecoratorCompiler())
  registry.register(createAnimationDecoratorCompiler())
  return registry
}
