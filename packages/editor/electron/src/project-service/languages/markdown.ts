import type { EditorProject } from '@quajs/editor-core'
import type { IWorkspace } from 'vscode-markdown-languageservice'
import { basename, dirname, join, relative, resolve } from 'node:path'
import MarkdownIt from 'markdown-it'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { createLanguageService, githubSlugifier, LogLevel } from 'vscode-markdown-languageservice'
import { URI } from 'vscode-uri'
import { readProjectDocument } from '../documents.js'

export const markdownToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) }
/** Indexed project paths only. No Markdown link can read outside the opened project. */
export function markdownLanguage(project: EditorProject, buffers: Map<string, TextDocument>) {
  const emptyEvent = () => ({ dispose() {} })
  const localPath = (uri: URI): string | undefined => {
    if (uri.scheme !== 'file')
      return undefined
    const path = relative(project.root, uri.fsPath).replaceAll('\\', '/')
    return path === '' || project.entries.some(entry => entry.path === path) || project.directories.includes(path) ? path : undefined
  }
  const open = async (uri: URI): Promise<TextDocument | undefined> => {
    if (localPath(uri) === undefined || !uri.path.toLowerCase().endsWith('.md'))
      return undefined
    const buffer = buffers.get(uri.fsPath)
    if (buffer)
      return buffer
    try {
      const document = await readProjectDocument(project.root, uri.fsPath)
      // The revision changes whenever disk contents do; the service is recreated on index refresh.
      return TextDocument.create(uri.toString(), 'markdown', 0, document.text)
    }
    catch { return undefined }
  }
  const workspace: IWorkspace = {
    workspaceFolders: [URI.file(project.root)],
    onDidChangeMarkdownDocument: emptyEvent,
    onDidCreateMarkdownDocument: emptyEvent,
    onDidDeleteMarkdownDocument: emptyEvent,
    hasMarkdownDocument: uri => localPath(uri) !== undefined && uri.path.toLowerCase().endsWith('.md'),
    openMarkdownDocument: open,
    getAllMarkdownDocuments: async () => (await Promise.all(project.files.filter(path => path.endsWith('.md')).slice(0, 256).map(path => open(URI.file(join(project.root, path)))))).filter((doc): doc is TextDocument => Boolean(doc)),
    stat: async (uri) => {
      const path = localPath(uri)
      return path === undefined ? undefined : { isDirectory: !path || project.directories.includes(path) }
    },
    readDirectory: async (uri) => {
      if (localPath(uri) === undefined)
        return []
      return [...project.entries.map(entry => ({ path: entry.path, isDirectory: false })), ...project.directories.map(path => ({ path, isDirectory: true }))]
        .filter(entry => entry.path && dirname(resolve(project.root, entry.path)) === uri.fsPath)
        .map(entry => [basename(entry.path), { isDirectory: entry.isDirectory }] as const)
    },
  }
  const parser = new MarkdownIt('commonmark')
  return createLanguageService({
    workspace,
    parser: { slugifier: githubSlugifier, tokenize: async document => parser.parse(document.getText(), {}) },
    logger: { level: LogLevel.Off, log() {} },
  })
}
