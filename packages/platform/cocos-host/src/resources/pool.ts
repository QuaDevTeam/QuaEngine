import type { CocosHostResource, CocosHostResourceKind } from '../index'

/** One native allocation per ID, with a lease for every successful acquisition. */
export class CocosResourcePool {
  private readonly counts = new Map<string, number>()
  private readonly pending = new Map<string, Promise<CocosHostResource | undefined>>()

  constructor(
    private readonly resources: Map<string, CocosHostResource>,
    private readonly hooks: {
      retain?: (resource: CocosHostResource) => void
      release?: (resource: CocosHostResource) => void
    } = {},
  ) {}

  async acquire(id: string, kind: CocosHostResourceKind, create: () => Promise<CocosHostResource | undefined>): Promise<CocosHostResource | undefined> {
    let pending = this.pending.get(id)
    if (!pending && !this.resources.has(id)) {
      pending = create().then((resource) => {
        if (!resource)
          return undefined
        if (resource.id !== id || resource.kind !== kind) {
          this.hooks.release?.(resource)
          throw new Error(`Cocos resource bridge must return the requested id "${id}" and kind "${kind}".`)
        }
        this.resources.set(id, resource)
        this.counts.set(id, 0)
        return resource
      }).finally(() => {
        if (this.pending.get(id) === pending)
          this.pending.delete(id)
      })
      this.pending.set(id, pending)
    }
    if (pending)
      await pending
    const resource = this.resources.get(id)
    if (!resource)
      return undefined
    if (resource.kind !== kind)
      throw new Error(`Cocos resource id "${id}" is already used by kind "${resource.kind}".`)
    this.retain(resource)
    return resource
  }

  retain(resource: CocosHostResource): void {
    if (this.resources.get(resource.id) !== resource)
      return
    const count = this.counts.get(resource.id) ?? 0
    if (count > 0)
      this.hooks.retain?.(resource)
    this.counts.set(resource.id, count + 1)
  }

  release(resource: CocosHostResource): void {
    if (this.resources.get(resource.id) !== resource)
      return
    const count = (this.counts.get(resource.id) ?? 0) - 1
    if (count <= 0) {
      this.counts.delete(resource.id)
      this.resources.delete(resource.id)
    }
    else {
      this.counts.set(resource.id, count)
    }
    // Without a native retain hook, the pool owns one native reference in total.
    if (count <= 0 || this.hooks.retain)
      this.hooks.release?.(resource)
  }
}
