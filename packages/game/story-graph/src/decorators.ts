export const storyGraphDecoratorMappings = {
  Chapter: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Scene: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Entry: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Node: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Label: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Lane: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Route: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  StoryTimeline: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Protagonist: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Interaction: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  EmitStoryEvent: {
    function: 'emitStoryEventWithEngine',
    module: '@quajs/story-graph',
  },
  ChapterSelect: {
    function: 'setStoryChapterSelectWithEngine',
    module: '@quajs/story-graph',
  },
} as const

export const decorators = storyGraphDecoratorMappings
