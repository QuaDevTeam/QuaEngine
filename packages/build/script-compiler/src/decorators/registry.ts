import type { DecoratorMapping } from '../core/types'
import type { DecoratorCompilationResult, DecoratorCompileInput, DecoratorCompiler, ImplicitDecoratorCompileInput } from './types'
import { createCharacterDecoratorCompiler } from '@quajs/character/script-compiler'
import { createFlowControlDecoratorCompiler } from '@quajs/engine/script-compiler'
import { createAnimationDecoratorCompiler } from '@quajs/plugin-animation/script-compiler'
import { createAudioDecoratorCompiler } from '@quajs/plugin-audio/script-compiler'
import { createBackgroundDecoratorCompiler } from '@quajs/plugin-background/script-compiler'
import { createBacklogDecoratorCompiler } from '@quajs/plugin-backlog/script-compiler'
import { createStoryGraphDecoratorCompiler } from '@quajs/story-graph/script-compiler'

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

  compileImplicit(input: ImplicitDecoratorCompileInput): Array<{ compiler: DecoratorCompiler, result: DecoratorCompilationResult }> {
    const results: Array<{ compiler: DecoratorCompiler, result: DecoratorCompilationResult }> = []
    const visited = new Set<DecoratorCompiler>()

    for (const compiler of this.compilers) {
      if (visited.has(compiler) || typeof compiler.compileImplicit !== 'function') {
        continue
      }

      visited.add(compiler)
      const compiled = compiler.compileImplicit(input)
      if (!compiled) {
        continue
      }

      compiled.forEach(result => results.push({ compiler, result }))
    }

    return results
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
  registry.register(createFlowControlDecoratorCompiler())
  registry.register(createCharacterDecoratorCompiler())
  registry.register(createBackgroundDecoratorCompiler())
  registry.register(createAudioDecoratorCompiler())
  registry.register(createAnimationDecoratorCompiler())
  registry.register(createStoryGraphDecoratorCompiler())
  registry.register(createBacklogDecoratorCompiler())
  return registry
}
