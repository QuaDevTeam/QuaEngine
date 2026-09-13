import type { ExtensionContext } from 'vscode'
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

interface QuaNativeClientSettings {
  format?: {
    indentSize?: number
    insertFinalNewline?: boolean
  }
  lint?: {
    allowPreviewFeatures?: boolean
    maxSelectorDepth?: number
    strictComponents?: boolean
  }
}

let client: LanguageClient | undefined

const nativeDocumentLanguages = new Set(['qua-ui', 'qua-style'])
const nativeAssetFixAllKind = 'source.fixAll.quaNativeAssets'

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath('server/server.js')
  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

  client = startQuaNativeLanguageClient(serverModule, projectRoot)

  context.subscriptions.push(
    vscode.commands.registerCommand('quaNative.formatDocument', async () => {
      await vscode.commands.executeCommand('editor.action.formatDocument')
    }),
    vscode.commands.registerCommand('quaNative.validateOpenDocuments', async () => {
      await sendQuaNativeConfiguration()
      await vscode.commands.executeCommand('workbench.actions.view.problems')
    }),
    vscode.commands.registerCommand('quaNative.fixAllAssetReferences', async () => {
      await fixAllNativeAssetReferences()
    }),
    vscode.commands.registerCommand('quaNative.restartLanguageServer', async () => {
      await restartQuaNativeLanguageClient(serverModule, projectRoot)
      vscode.window.showInformationMessage('Qua Native language server restarted.')
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('quaNative')) {
        sendQuaNativeConfiguration()
          .catch(error => vscode.window.showWarningMessage(`Qua Native configuration sync failed: ${String(error)}`))
      }
    }),
    {
      dispose: () => {
        client?.stop()
      },
    },
  )
}

export function deactivate(): Thenable<void> | undefined {
  const activeClient = client
  client = undefined
  return activeClient?.stop()
}

function startQuaNativeLanguageClient(serverModule: string, projectRoot: string | undefined): LanguageClient {
  const nextClient = new LanguageClient(
    'quaNative',
    'Qua Native',
    {
      run: {
        module: serverModule,
        transport: TransportKind.ipc,
      },
      debug: {
        module: serverModule,
        options: {
          execArgv: ['--nolazy', '--inspect=6011'],
        },
        transport: TransportKind.ipc,
      },
    },
    {
      documentSelector: [
        {
          language: 'qua-ui',
          scheme: 'file',
        },
        {
          language: 'qua-style',
          scheme: 'file',
        },
      ],
      initializationOptions: {
        projectRoot,
        quaNative: getQuaNativeSettings(),
      },
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{qui,qss,json}'),
      },
    },
  )

  nextClient.start().catch(error => vscode.window.showWarningMessage(`Qua Native language server failed to start: ${String(error)}`))
  return nextClient
}

async function restartQuaNativeLanguageClient(serverModule: string, projectRoot: string | undefined): Promise<void> {
  const activeClient = client
  client = undefined
  await activeClient?.stop()
  client = startQuaNativeLanguageClient(serverModule, projectRoot)
}

async function sendQuaNativeConfiguration(): Promise<void> {
  await client?.sendNotification('workspace/didChangeConfiguration', {
    settings: {
      quaNative: getQuaNativeSettings(),
    },
  })
}

async function fixAllNativeAssetReferences(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || !nativeDocumentLanguages.has(editor.document.languageId)) {
    vscode.window.showInformationMessage('Open a QUI or QSS document before running Qua Native asset fixes.')
    return
  }

  await vscode.commands.executeCommand('editor.action.codeAction', {
    apply: 'first',
    kind: nativeAssetFixAllKind,
  })
}

function getQuaNativeSettings(): QuaNativeClientSettings {
  const configuration = vscode.workspace.getConfiguration('quaNative')
  return {
    lint: {
      strictComponents: configuration.get<boolean>('lint.strictComponents', true),
      allowPreviewFeatures: configuration.get<boolean>('lint.allowPreviewFeatures', false),
      maxSelectorDepth: configuration.get<number>('lint.maxSelectorDepth', 3),
    },
    format: {
      indentSize: configuration.get<number>('format.indentSize', 2),
      insertFinalNewline: configuration.get<boolean>('format.insertFinalNewline', true),
    },
  }
}
