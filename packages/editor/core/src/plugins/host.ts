/** Desktop-only contributions are activated lazily; they never enter game plugin lists. */
export interface EditorHostPlugin<Context, Instance extends { dispose: () => Promise<void> }> {
  id: string
  apiVersion: 1
  activate: (context: Context) => Instance
}

export class EditorHostPlugins {
  private readonly instances = new Map<string, { dispose: () => Promise<void> }>()

  activate<C, T extends { dispose: () => Promise<void> }>(plugin: EditorHostPlugin<C, T>, context: C): T {
    if (plugin.apiVersion !== 1)
      throw new Error(`Unsupported editor host plugin: ${plugin.id}`)
    let instance = this.instances.get(plugin.id)
    if (!instance) {
      instance = plugin.activate(context)
      this.instances.set(plugin.id, instance)
    }
    return instance as T
  }

  async dispose(): Promise<void> {
    for (const [id, instance] of this.instances) {
      await instance.dispose()
      this.instances.delete(id)
    }
  }
}
