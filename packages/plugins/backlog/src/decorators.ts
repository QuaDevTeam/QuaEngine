export const backlogDecoratorMappings = {
  Backlog: {
    function: 'setBacklogPolicyWithEngine',
    module: '@quajs/plugin-backlog',
  },
  NoBacklog: {
    function: 'setBacklogPolicyWithEngine',
    module: '@quajs/plugin-backlog',
  },
} as const

export const decorators = backlogDecoratorMappings
