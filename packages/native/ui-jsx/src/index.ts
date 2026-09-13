// Public API for @quajs/native-ui
// Import components and action helpers; the JSX runtime is resolved
// automatically via tsconfig "jsxImportSource": "@quajs/native-ui".

export type {
  BackdropProps,
  BoxProps,
  ButtonProps,
  ColumnProps,
  ContainerProps,
  DividerProps,
  GridProps,
  ImageProps,
  LayerProps,
  PanelProps,
  QuiBaseProps,
  QuiChildren,
  QuiControlOption,
  QuiIntent,
  QuiNode,
  QuiNodeKind,
  RichTextProps,
  RowProps,
  SafeAreaProps,
  ScrollProps,
  SelectProps,
  SliderProps,
  SpacerProps,
  StackProps,
  SwitchProps,
  TextProps,
  VideoProps,
} from './types'

export {
  Backdrop,
  Box,
  Button,
  Column,
  Divider,
  Grid,
  Image,
  Layer,
  Panel,
  RichText,
  Row,
  SafeArea,
  Scroll,
  Select,
  Slider,
  Spacer,
  Stack,
  Switch,
  Text,
  Video,
} from './components'

export { choice, isQuiIntent, save, settings, ui } from './intents'

// Fragment is exported for explicit <Fragment> usage; the JSX transform also
// resolves it automatically from the runtime.
export { Fragment } from './jsx-runtime'
