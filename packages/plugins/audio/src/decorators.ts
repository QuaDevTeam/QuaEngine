export const audioDecoratorMappings = {
  AudioChapter: {
    function: 'configureAudioChapterWithEngine',
    module: '@quajs/plugin-audio',
  },
  LineId: {
    function: 'lineIdDirective',
    module: '@quajs/plugin-audio',
  },
  PlayVoice: {
    function: 'playVoiceWithEngine',
    module: '@quajs/plugin-audio',
  },
  PlayBGM: {
    function: 'playBGMWithEngine',
    module: '@quajs/plugin-audio',
  },
  PlaySFX: {
    function: 'playSFXWithEngine',
    module: '@quajs/plugin-audio',
  },
  PlayAmbient: {
    function: 'playAmbientWithEngine',
    module: '@quajs/plugin-audio',
  },
  SetAudioGain: {
    function: 'setAudioGainWithEngine',
    module: '@quajs/plugin-audio',
  },
  SetAudioEq: {
    function: 'setAudioEqWithEngine',
    module: '@quajs/plugin-audio',
  },
  SetAudioAutomation: {
    function: 'setAudioAutomationWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopAudio: {
    function: 'stopAudioWithEngine',
    module: '@quajs/plugin-audio',
  },
  PauseAudio: {
    function: 'pauseAudioWithEngine',
    module: '@quajs/plugin-audio',
  },
  ResumeAudio: {
    function: 'resumeAudioWithEngine',
    module: '@quajs/plugin-audio',
  },
  SeekAudio: {
    function: 'seekAudioWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopVoice: {
    function: 'stopVoiceWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopBGM: {
    function: 'stopBGMWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopSFX: {
    function: 'stopSFXWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopAmbient: {
    function: 'stopAmbientWithEngine',
    module: '@quajs/plugin-audio',
  },
} as const

export const decorators = audioDecoratorMappings
