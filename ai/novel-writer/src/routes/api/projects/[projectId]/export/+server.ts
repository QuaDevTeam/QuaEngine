import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createProjectExport, NoCompletedArtifactsError } from '$server/export'

export const GET: RequestHandler = async ({ params }) => {
  try {
    const archive = await createProjectExport(params.projectId)
    const body = archive.bytes.buffer.slice(
      archive.bytes.byteOffset,
      archive.bytes.byteOffset + archive.bytes.byteLength,
    ) as ArrayBuffer
    return new Response(body, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': contentDisposition(archive.filename),
        'Content-Length': String(archive.bytes.byteLength),
        'Content-Type': 'application/zip',
      },
    })
  }
  catch (caught) {
    if (caught instanceof NoCompletedArtifactsError) {
      return json({ error: '没有可导出的已完成内容。' }, { status: 409 })
    }
    if (isNotFound(caught)) {
      error(404, 'Project not found.')
    }
    throw caught
  }
}

function contentDisposition(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '_') || 'novel-writer-export.zip'
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function isNotFound(caught: unknown): boolean {
  return Boolean(caught && typeof caught === 'object' && 'code' in caught && caught.code === 'ENOENT')
}
