export interface DemoHud {
  chapter: string
  route: string
  signal: string
}

export interface DemoToast {
  id: number
  message: string
  tone: 'info' | 'success' | 'warning'
}

export type HudPatch = Partial<DemoHud>

export interface ChoiceOption<T extends string> {
  id: T
  text: string
  description?: string
}
