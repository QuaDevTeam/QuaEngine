/** @jsxImportSource @quajs/native-ui */
import type { DemoAppView } from '../app'
import { Button, Column, Panel, Stack, Text, ui } from '@quajs/native-ui'

export function TitleScreen({ view }: { view: DemoAppView }) {
  return (
    <Stack id="demo-title-menu" class="main-menu" width={1920} height={1080}>
      <Text id="demo-title-opening" class="title-opening">明天，</Text>
      <Text id="native-main-menu-title" class="main-menu-title" role="heading">请再一次呼唤我</Text>
      <Panel id="demo-title-rule" class="title-rule" />
      <Column id="demo-title-actions" class="title-actions">
        <Button id="native-main-menu-start" class="title-menu-action" onClick={ui.open('story')}>{view.t('ui.title.start')}</Button>
        <Button id="native-main-menu-continue" class="title-menu-action" disabled={!view.canContinue} onClick={ui.open('continue')}>继续阅读</Button>
        <Button id="native-main-menu-load" class="title-menu-action" onClick={ui.open('load')}>{view.t('ui.title.load')}</Button>
        <Button id="native-main-menu-story-tree" class="title-menu-action" onClick={ui.open('story-tree')}>{view.t('ui.title.storyTree')}</Button>
        <Button id="native-main-menu-config" class="title-menu-action" onClick={ui.open('settings')}>{view.t('ui.title.config')}</Button>
        <Button id="native-main-menu-quit" class="title-menu-action" onClick={ui.open('quit-confirm')}>{view.t('ui.title.quit')}</Button>
      </Column>
    </Stack>
  )
}
