import type { BacklogEntry } from '@quajs/plugin-backlog'
import { QuaBacklogEntry } from '@quajs/renderer-vue/plugins/backlog'
import { defineComponent, h, nextTick, onMounted, ref, type PropType } from 'vue'

/** Product layout only. Entries and replay/rewind intents remain owned by the plugin. */
export const DemoBacklogPanel = defineComponent({
  name: 'DemoBacklogPanel',
  props: {
    entries: { type: Array as PropType<readonly BacklogEntry[]>, required: true },
    close: { type: Function as PropType<() => void | Promise<void>>, required: true },
  },
  setup(props) {
    const list = ref<HTMLOListElement>()
    const scrollTo = (edge: 'start' | 'end') => {
      if (!list.value) return
      list.value.scrollTop = edge === 'start' ? 0 : list.value.scrollHeight
      list.value.focus({ preventScroll: true })
    }
    onMounted(async () => {
      await nextTick()
      scrollTo('end')
    })
    return () => h('section', {
      class: 'qua-backlog-panel', role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': 'demo-backlog-title', 'data-qua-input-ignore': '',
    }, [
      h('header', { class: 'qua-backlog-header' }, [
        h('h2', { id: 'demo-backlog-title', class: 'qua-backlog-title' }, '对话记录'),
        h('button', { type: 'button', class: 'qua-backlog-close', onClick: props.close }, '返回阅读'),
      ]),
      h('ol', { ref: list, class: 'qua-backlog-list', tabindex: 0, 'aria-label': '已读内容' },
        props.entries.length ? props.entries.map((entry, index) => h(QuaBacklogEntry, { key: entry.id, entry, index }))
          : [h('li', { class: 'qua-backlog-empty' }, '还没有读过的内容。')]),
      h('footer', { class: 'vn-backlog-footer' }, [
        h('span', { class: 'vn-backlog-hint' }, '向上滚动，查看前文'),
        h('nav', { 'aria-label': '记录位置' }, [
          h('button', { type: 'button', onClick: () => scrollTo('start') }, '最早记录'),
          h('button', { type: 'button', onClick: () => scrollTo('end') }, '最近记录'),
        ]),
      ]),
    ])
  },
})
