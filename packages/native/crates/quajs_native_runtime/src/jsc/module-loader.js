// This closure is scoped to one validated package graph. No global module cache
// retains package code after its last namespace/continuation is released.
const records = new Map()
let registrationOpen = true
// Called by the registration code appended in modules.rs.
// eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
function register(id, dependencies, declare) {
  if (!registrationOpen || records.has(id))
    throw new Error('Native module registration is closed')
  records.set(id, { id, dependencies, declare, namespace: Object.create(null), values: Object.create(null), subscribers: [], phase: 0 })
}
function resolve(specifier, base) {
  if (specifier.startsWith('@quajs/') && records.has(specifier))
    return specifier
  // Module identifiers must not contain control characters.
  // eslint-disable-next-line no-control-regex
  if ((!specifier.startsWith('./') && !specifier.startsWith('../')) || /[\\:\u0000-\u001F\u007F]/.test(specifier)) {
    throw new Error(`Undeclared native module import ${specifier} from ${base}`)
  }
  const parts = base.split('/')
  parts.pop()
  for (const part of specifier.split('/')) {
    if (part === '..') {
      if (!parts.length)
        throw new Error('Native module import escapes its QPK')
      parts.pop()
    }
    else if (part && part !== '.') {
      parts.push(part)
    }
  }
  const id = parts.join('/')
  if (!records.has(id))
    throw new Error(`Undeclared native module import ${specifier} from ${base}`)
  return id
}
function instantiate(id) {
  const record = records.get(id)
  if (!record)
    throw new Error(`Undeclared native module ${id}`)
  if (record.phase)
    return record
  record.phase = 1
  const publish = (name, value) => {
    const exports = typeof name === 'string' ? { [name]: value } : name
    let changed = false
    for (const key of Object.keys(exports)) {
      if (!Object.hasOwn(record.values, key)) {
        Object.defineProperty(record.namespace, key, { enumerable: true, get: () => record.values[key] })
      }
      if (!Object.hasOwn(record.values, key) || !Object.is(record.values[key], exports[key])) {
        record.values[key] = exports[key]
        changed = true
      }
    }
    if (changed) {
      for (const setter of record.subscribers.slice())
        setter(record.namespace)
    }
    return value
  }
  const declaration = record.declare(publish, Object.freeze({
    id,
    meta: Object.freeze({ url: `qpk:${id}` }),
    // Dynamic imports use exactly the same closed graph. Never delegate to JSC
    // host filesystem/network loading.
    import: specifier => Promise.resolve().then(() => evaluate(resolve(specifier, id))),
  }))
  record.execute = declaration.execute
  record.deps = record.dependencies.map((name, index) => {
    const dep = instantiate(resolve(name, id))
    const setter = declaration.setters[index]
    if (setter) {
      dep.subscribers.push(setter)
      setter(dep.namespace)
    }
    return dep
  })
  return record
}
function run(record) {
  if (record.error)
    throw record.error
  if (record.phase >= 2)
    return record.pending
  record.phase = 2
  const waits = record.deps.map(run).filter(Boolean)
  const execute = () => {
    try {
      const result = record.execute()
      if (result && typeof result.then === 'function') {
        return result.then(() => {
          record.phase = 3
          Object.preventExtensions(record.namespace)
        }, (error) => {
          record.error = error
          throw error
        })
      }
      record.phase = 3
      Object.preventExtensions(record.namespace)
    }
    catch (error) {
      record.error = error
      throw error
    }
  }
  const pending = waits.length ? Promise.all(waits).then(execute) : execute()
  record.pending = pending
  return pending
}
function evaluate(id) {
  registrationOpen = false
  const record = instantiate(id)
  const pending = run(record)
  return pending ? pending.then(() => record.namespace) : record.namespace
}
