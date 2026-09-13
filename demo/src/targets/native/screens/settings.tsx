/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Column, Divider, Panel, Slider, Stack, Switch, Text, Row } from '@quajs/native-ui'
import { settings, ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function SettingsOverlay({ view }: { view: NativeAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-settings-backdrop" class="system-backdrop" onDismiss={ui.close('settings')} />
      <Panel id="native-settings-panel" class="settings-panel">
        <Text id="native-settings-title" class="panel-title">{view.t('ui.settings.title')}</Text>
        <Column id="native-settings-list" class="settings-list">
          {view.settingItems.map(item => (
            <Row key={item.id} id={item.id} class="settings-row">
              <Text id={`${item.id}-label`} class="settings-label">{item.label}</Text>
              {item.type === 'slider' && (
                <Slider id={`${item.id}-slider`} class="settings-slider"
                  selectedIndex={item.selectedIndex}
                  options={item.options.map((opt, i) => ({
                    label: opt.label,
                    intent: settings.set(item.id, i),
                  }))} />
              )}
              {item.type === 'switch' && (
                <Switch id={`${item.id}-switch`} class="settings-switch"
                  selectedIndex={item.selectedIndex}
                  options={[
                    { label: item.options[0]?.label ?? view.t('ui.settings.off'), intent: settings.set(item.id, 0) },
                    { label: item.options[1]?.label ?? view.t('ui.settings.on'),  intent: settings.set(item.id, 1) },
                  ]} />
              )}
            </Row>
          ))}
        </Column>
        <Divider id="native-settings-divider" class="settings-divider" />
        <Row id="native-settings-actions" class="settings-actions">
          <Button id="native-settings-close" class="panel-action" onClick={ui.close('settings')}>{view.t('ui.common.close')}</Button>
        </Row>
      </Panel>
    </Stack>
  )
}
