import type { ExtensionContext } from 'vscode'
import { createRequire } from 'node:module'
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext): void {
  const require = createRequire(import.meta.url)
  const serverModule = require.resolve('@quajs/language-server/server')

  client = new LanguageClient(
    'quascript',
    'QuaScript',
    {
      run: {
        module: serverModule,
        transport: TransportKind.ipc,
      },
      debug: {
        module: serverModule,
        options: {
          execArgv: ['--nolazy', '--inspect=6009'],
        },
        transport: TransportKind.ipc,
      },
    },
    {
      documentSelector: [
        {
          language: 'quascript',
          scheme: 'file',
        },
      ],
      initializationOptions: {
        projectRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      },
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{qs,ts,js,json}'),
      },
    },
  )

  client.start()
  context.subscriptions.push({
    dispose: () => {
      client?.stop()
    },
  })
}

export function deactivate(): Thenable<void> | undefined {
  const activeClient = client
  client = undefined
  return activeClient?.stop()
}
