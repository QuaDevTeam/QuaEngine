import { z } from 'zod'

export const runModeSchema = z.enum(['yolo', 'step'])

export const projectSeedSchema = z.object({
  worldbuilding: z.string().max(50000).optional(),
  characters: z.string().max(50000).optional(),
  outline: z.string().max(50000).optional(),
  allowExpertChanges: z.boolean().optional(),
}).optional()

export const configUpdateSchema = z.object({
  deepSeekApiKey: z.string().optional(),
  deepSeekBaseUrl: z.string().url().optional(),
  deepSeekModel: z.enum(['deepseek-v4-pro', 'deepseek-v4-flash']).optional(),
  defaultReasoningEffort: z.enum(['high', 'max']).optional(),
  tavilyApiKey: z.string().optional(),
  tavilyBaseUrl: z.string().url().optional(),
  defaultMaxRevisionLoops: z.number().int().min(1).max(200).optional(),
})

export const createProjectSchema = z.object({
  title: z.string().min(1).max(120),
  brief: z.string().min(1).max(20000),
  mode: runModeSchema.default('step'),
  maxRevisionLoops: z.number().int().min(1).max(200).optional(),
  seed: projectSeedSchema,
})

export const updateProjectInputSchema = z.object({
  title: z.string().min(1).max(120),
  brief: z.string().min(1).max(20000),
  mode: runModeSchema,
  maxRevisionLoops: z.number().int().min(1).max(200).optional(),
  seed: projectSeedSchema,
})

export const runRequestSchema = z.object({
  mode: runModeSchema.optional(),
  chapterIndex: z.number().int().nonnegative().optional(),
})

export const approvalRequestSchema = z.object({
  artifactId: z.string().min(1),
  action: z.enum(['approve', 'request_changes', 'manual_edit', 'regenerate']),
  note: z.string().max(10000).optional(),
  markdown: z.string().max(200000).optional(),
})

export const messageRequestSchema = z.object({
  content: z.string().min(1).max(20000),
})

export const sandboxExecRequestSchema = z.object({
  command: z.string().min(1).max(4000),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
})
