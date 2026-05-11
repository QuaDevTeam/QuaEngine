import type { QuaStateSerializer } from '../types/base'

export const jsonStateSerializer: QuaStateSerializer = {
  serialize: state => JSON.parse(JSON.stringify(state)),
  deserialize: serializedState => JSON.parse(JSON.stringify(serializedState)),
}

export function assertStateSerializer(serializer: QuaStateSerializer): QuaStateSerializer {
  if (typeof serializer.serialize !== 'function' || typeof serializer.deserialize !== 'function') {
    throw new TypeError('State serializer must provide serialize and deserialize functions.')
  }

  return serializer
}
