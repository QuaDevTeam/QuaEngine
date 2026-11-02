export const storyGraphDecoratorMappings = {
  Chapter: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  Scene: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  Entry: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  Node: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  Label: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  Lane: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  Route: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  StoryTimeline: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  Protagonist: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  Interaction: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  EmitStoryEvent: {
    function: 'emitStoryEventWithEngine',
    module: '@quajs/plugin-story-graph',
  },
  ChapterSelect: {
    function: 'setStoryChapterSelectWithEngine',
    module: '@quajs/plugin-story-graph',
  },
} as const

export const decorators = storyGraphDecoratorMappings
