/** @jsxImportSource @quajs/native-ui */
import { Button, Column, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function TitleScreen({ view }: { view: NativeAppView }) {
  return (
    <Stack class="main-menu">
      <Text id="native-main-menu-title" class="main-menu-title">{view.title}</Text>
      <Text id="native-main-menu-subtitle" class="main-menu-subtitle">{view.englishTitle}</Text>
      <Column id="native-main-menu-actions" class="main-menu-actions">
        <Button id="native-main-menu-continue" class="main-menu-action" disabled={!view.canContinue} onClick={ui.open('continue')}>继续阅读</Button>
        <Button id="native-main-menu-start" class="main-menu-action" onClick={ui.open('story')}>{view.t('ui.title.start')}</Button>
        <Button id="native-main-menu-load" class="main-menu-action" onClick={ui.open('load')}>{view.t('ui.title.load')}</Button>
        <Button id="native-main-menu-story-tree" class="main-menu-action" onClick={ui.open('story-tree')}>{view.t('ui.title.storyTree')}</Button>
        <Button id="native-main-menu-config" class="main-menu-action" onClick={ui.open('settings')}>{view.t('ui.title.config')}</Button>
      </Column>
    </Stack>
  )
}
