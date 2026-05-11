export function applyStyleVars(element: HTMLElement, vars: Record<string, string | number> | undefined): void {
  if (!vars) {
    return
  }
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, String(value))
  }
}

export function assignData(element: HTMLElement, name: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    element.setAttribute(name, String(value))
  }
}
