import type { NativeUiDiagnostic, NativeUiLanguageOptions } from './types'
import { analyzeQssSource } from './qss'

// sass-embedded is an optional peer — import lazily so the package can be used
// in environments where only QSS (not SCSS) is needed.
async function loadSass() {
  try {
    return await import('sass-embedded')
  }
  catch {
    throw new Error(
      'sass-embedded is required to compile .qss.scss files. '
      + 'Add it as a dependency: pnpm add -D sass-embedded',
    )
  }
}

export interface CompileQssScssOptions extends NativeUiLanguageOptions {
  /**
   * Absolute URL string (e.g. `import.meta.url` or `pathToFileURL(id).href`)
   * passed to the sass compiler so relative `@use` / `@forward` paths resolve
   * correctly. Omit when the source has no `@use` imports.
   */
  url?: string
}

export interface QssScssCompileResult {
  /** Compiled QSS output (flat CSS subset understood by the native renderer). */
  qss: string
  diagnostics: NativeUiDiagnostic[]
}

/**
 * Compile a SCSS source string to QSS.
 *
 * Pipeline:
 *   .scss  →  sass-embedded (full SCSS language: variables, nesting, mixins, @use)
 *          →  flat CSS
 *          →  analyzeQssSource  (validates native renderer property support)
 *          →  NativeUiDiagnostic[]
 *
 * The returned `qss` string is flat CSS the QSS parser can consume directly —
 * no further transformation is needed before feeding it to the projection
 * pipeline or the wgpu renderer.
 */
export async function compileQssScss(
  scss: string,
  options: CompileQssScssOptions = {},
): Promise<QssScssCompileResult> {
  const sass = await loadSass()

  let css: string
  try {
    const result = sass.compileString(scss, {
      style: 'expanded',
      ...(options.url ? { url: new URL(options.url) } : {}),
    })
    css = result.css
  }
  catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    return {
      qss: '',
      diagnostics: [{
        code: 'scss-compile-error',
        message: raw,
        severity: 'error',
        source: 'qss',
      }],
    }
  }

  // Run the compiled CSS through the QSS analyser so unsupported native
  // renderer properties surface as diagnostics in the editor / build.
  const qssDoc = analyzeQssSource(css, { ...options, languageId: 'qss' })
  return { qss: css, diagnostics: qssDoc.diagnostics }
}
