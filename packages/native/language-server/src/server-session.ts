import type {
  NativeUiDiagnostic,
  NativeUiLanguageOptions,
  NativeUiPosition,
  NativeUiProjectDocumentLink,
  NativeUiProjectIndex,
  NativeUiProjectReference,
} from './index'
import type { NativeLanguageServerSettings } from './server-settings'
import {
  buildNativeUiProjectIndex,
  findNativeUiProjectReferences,
  getNativeUiProjectDocumentLinks,
  uriToFilePath,
} from './index'
import { normalizeSettings } from './server-settings'

export interface NativeLanguageServerDocument {
  getText: () => string
  languageId: string
  uri: string
  version?: number
}

export interface NativeLanguageServerPositionParams {
  position: NativeUiPosition
  textDocument: {
    uri: string
  }
}

export interface NativeLanguageServerSessionOptions {
  resolveDocumentLink?: (link: NativeUiProjectDocumentLink) => NativeUiProjectDocumentLink
}

export class NativeLanguageServerSession {
  private initializationSettings: NativeLanguageServerSettings = {}
  private workspaceSettings: NativeLanguageServerSettings | undefined
  private readonly resolveDocumentLink: (link: NativeUiProjectDocumentLink) => NativeUiProjectDocumentLink

  constructor(options: NativeLanguageServerSessionOptions = {}) {
    this.resolveDocumentLink = options.resolveDocumentLink ?? (link => link)
  }

  setInitializationOptions(options: unknown): void {
    this.initializationSettings = normalizeSettings(readInitializationSettings(options))
    this.workspaceSettings = undefined
  }

  setWorkspaceConfiguration(settings: unknown): void {
    this.workspaceSettings = normalizeSettings(readWorkspaceSettings(settings))
  }

  currentSettings(): NativeLanguageServerSettings {
    return this.workspaceSettings ?? this.initializationSettings
  }

  documentOptions(document: NativeLanguageServerDocument): NativeUiLanguageOptions {
    const settings = this.currentSettings()
    return {
      filePath: uriToFilePath(document.uri),
      format: settings.format,
      languageId: document.languageId,
      lint: settings.lint,
    }
  }

  projectIndex(documents: readonly NativeLanguageServerDocument[]): NativeUiProjectIndex {
    const settings = this.currentSettings()
    return buildNativeUiProjectIndex(documents.map(document => ({
      filePath: uriToFilePath(document.uri),
      languageId: document.languageId,
      source: document.getText(),
      uri: document.uri,
      version: document.version,
    })), {
      language: {
        lint: settings.lint,
      },
    })
  }

  diagnosticsForDocument(index: NativeUiProjectIndex, uri: string): NativeUiDiagnostic[] {
    const compilerDiagnostics = index.documents.find(item => item.uri === uri)?.diagnostics ?? []
    return [
      ...compilerDiagnostics,
      ...this.missingAssetDiagnosticsForDocument(index, uri),
    ]
  }

  findReferenceAtPosition(
    index: NativeUiProjectIndex,
    params: NativeLanguageServerPositionParams,
  ): NativeUiProjectReference | undefined {
    return findNativeUiProjectReferences(index, {
      uri: params.textDocument.uri,
    }).find(reference => containsPosition(reference.range, params.position))
  }

  private missingAssetDiagnosticsForDocument(
    index: NativeUiProjectIndex,
    uri: string,
  ): NativeUiDiagnostic[] {
    return getNativeUiProjectDocumentLinks(index, uri)
      .filter(link => link.kind === 'asset')
      .map(this.resolveDocumentLink)
      .filter(link => !link.resolved)
      .map(link => ({
        code: 'NATIVE_UI_ASSET_MISSING',
        message: `Native UI asset "${link.path}" could not be resolved.`,
        range: link.pathRange,
        severity: 'warning' as const,
        source: 'native-ui' as const,
      }))
  }
}

function readInitializationSettings(options: unknown): unknown {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    return undefined

  const input = options as { quaNative?: unknown, settings?: unknown }
  return input.quaNative ?? input.settings
}

function readWorkspaceSettings(settings: unknown): unknown {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    return undefined

  return (settings as { quaNative?: unknown }).quaNative
}

function containsPosition(range: NativeUiProjectReference['range'], position: NativeUiPosition): boolean {
  return comparePosition(position, range.start) >= 0 && comparePosition(position, range.end) <= 0
}

function comparePosition(left: NativeUiPosition, right: NativeUiPosition): number {
  return left.line - right.line || left.character - right.character
}
