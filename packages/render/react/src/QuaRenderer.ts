import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import type { QuaWebDomRendererHost, QuaWebDomRendererHostOptions, QuaWebRendererOptions, QuaWebRendererSnapshot, RendererActions, StageRenderPlane } from '@quajs/renderer-web'
import type { QuaWebDomRendererPlugin } from '@quajs/renderer-web/plugins/core'
import type { CSSProperties, ReactNode } from 'react'
import { createQuaWebDomRendererHost } from '@quajs/renderer-web'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { QuaRendererContext } from './context'

export interface QuaRendererSlotProps {
  view: Readonly<QuaViewProjection>
  layout: QuaViewProjection['layout']
  background: QuaViewProjection['background']
  characters: QuaViewProjection['characters']
  dialogue: QuaViewProjection['dialogue']
  choices: QuaViewProjection['choices']
  effects: QuaViewProjection['effects']
  animations: QuaViewProjection['animations']
  plugins: QuaViewProjection['plugins']
  actions: RendererActions
}

export interface QuaRendererProps {
  pipeline: Pipeline
  assets?: QuaAssets
  initialView?: QuaViewProjection
  plugins?: readonly RendererPlugin[]
  runtimePluginLoader?: QuaWebRendererOptions['runtimePluginLoader']
  autoReady?: boolean
  rendererId?: string
  unstyled?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode | ((props: QuaRendererSlotProps) => ReactNode)
  childrenPlane?: StageRenderPlane
  onHost?: (host: QuaWebDomRendererHost | undefined) => void
}

export function QuaRenderer(props: QuaRendererProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const host = useRef<QuaWebDomRendererHost | undefined>(undefined)
  const latestOptions = useRef<QuaWebDomRendererHostOptions | undefined>(undefined)
  const reportedOnHost = useRef<QuaRendererProps['onHost']>(undefined)
  const mounted = useRef(false)
  const [childrenMount, setChildrenMount] = useState<HTMLElement>()
  const [snapshot, setSnapshot] = useState<QuaWebRendererSnapshot>()

  const hasChildren = props.children !== null && props.children !== undefined && props.children !== false
  const setChildrenMountSafe = useMemo(
    () => (node: HTMLElement | undefined) => {
      if (mounted.current) {
        setChildrenMount(node)
      }
    },
    [],
  )
  const childrenLayer = useMemo(
    () => {
      if (!hasChildren) {
        return undefined
      }
      return createReactChildrenLayer(
        props.childrenPlane || 'safe',
        setChildrenMountSafe,
        () => mounted.current,
      )
    },
    [hasChildren, props.childrenPlane, setChildrenMountSafe],
  )
  const hostPlugins = useMemo(
    () => [
      ...(props.plugins || []),
      ...(childrenLayer ? [childrenLayer] : []),
    ],
    [props.plugins, childrenLayer],
  )

  const options = useMemo(() => container.current
    ? createHostOptions(container.current, props, hostPlugins)
    : undefined, [
    props.pipeline,
    props.assets,
    props.initialView,
    props.plugins,
    props.runtimePluginLoader,
    props.autoReady,
    props.rendererId,
    props.unstyled,
    hostPlugins,
  ])
  latestOptions.current = options

  useEffect(() => {
    mounted.current = true
    if (!container.current || host.current) {
      return () => {
        mounted.current = false
      }
    }

    const current = createQuaWebDomRendererHost(createHostOptions(container.current, props, hostPlugins))
    host.current = current
    reportedOnHost.current = props.onHost
    reportedOnHost.current?.(current)
    const unsubscribe = current.subscribe(setSnapshot)
    void current.mount().catch(error => reportHostError(current, error, 'react-renderer:mount'))

    return () => {
      unsubscribe()
      mounted.current = false
      reportedOnHost.current?.(undefined)
      reportedOnHost.current = undefined
      host.current = undefined
      void current.destroy().catch(error => reportHostError(current, error, 'react-renderer:destroy'))
    }
  }, [])

  useEffect(() => {
    const previousOnHost = reportedOnHost.current
    const nextOnHost = props.onHost
    if (previousOnHost === nextOnHost || !host.current) {
      return
    }

    previousOnHost?.(undefined)
    reportedOnHost.current = nextOnHost
    reportedOnHost.current?.(host.current)
  }, [props.onHost])

  useEffect(() => {
    if (!host.current || !latestOptions.current) {
      return
    }

    void host.current.update(latestOptions.current)
      .catch(error => reportHostError(host.current, error, 'react-renderer:update'))
  }, [options])

  const context = useMemo(() => ({
    host: host.current,
    snapshot,
    view: snapshot?.view,
    actions: snapshot?.actions,
  }), [snapshot])

  return createElement(
    QuaRendererContext.Provider,
    { value: context },
    createElement('div', {
      'ref': container,
      'className': props.className,
      'style': props.style,
      'data-qua-react-renderer': '',
    }),
    childrenMount ? createPortal(renderChildren(props.children, snapshot), childrenMount) : null,
  )
}

function createHostOptions(
  container: Element,
  props: QuaRendererProps,
  plugins: readonly (RendererPlugin | QuaWebDomRendererPlugin)[],
): QuaWebDomRendererHostOptions {
  return {
    container,
    pipeline: props.pipeline,
    assets: props.assets,
    initialView: props.initialView,
    plugins,
    runtimePluginLoader: props.runtimePluginLoader,
    autoReady: props.autoReady,
    rendererId: props.rendererId,
    unstyled: props.unstyled,
  }
}

function createReactChildrenLayer(
  plane: StageRenderPlane,
  setMount: (node: HTMLElement | undefined) => void,
  isMounted: () => boolean,
): QuaWebDomRendererPlugin {
  let mount: HTMLElement | undefined
  return {
    name: '@quajs/renderer-react/children',
    setup() {},
    destroy() {
      mount = undefined
      if (isMounted()) {
        setMount(undefined)
      }
    },
    layers: [{
      id: '@quajs/renderer-react/children',
      order: 10_000,
      plane,
      render(context) {
        if (!mount) {
          const node = context.document.createElement('div')
          node.className = 'qua-react-layer'
          node.dataset.quaReactLayer = ''
          mount = node
        }
        setMount(mount)
        return mount
      },
    }],
  }
}

function renderChildren(
  children: QuaRendererProps['children'],
  snapshot: QuaWebRendererSnapshot | undefined,
): ReactNode {
  if (typeof children !== 'function') {
    return children
  }
  if (!snapshot) {
    return null
  }
  return children(createSlotProps(snapshot.view, snapshot.actions))
}

function createSlotProps(
  view: Readonly<QuaViewProjection>,
  actions: RendererActions,
): QuaRendererSlotProps {
  return {
    view,
    layout: view.layout,
    background: view.background,
    characters: view.characters,
    dialogue: view.dialogue,
    choices: view.choices,
    effects: view.effects,
    animations: view.animations,
    plugins: view.plugins,
    actions,
  }
}

function reportHostError(
  host: QuaWebDomRendererHost | undefined,
  error: unknown,
  phase: string,
): void {
  const controller = host?.getController()
  if (controller) {
    void controller.reportError(error, {
      message: 'React renderer failed.',
      phase,
    })
    return
  }
  console.warn('[quajs:renderer-react] Renderer host failed.', error)
}
