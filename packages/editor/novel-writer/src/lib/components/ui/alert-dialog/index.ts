import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
import Cancel from './alert-dialog-cancel.svelte'
import Content from './alert-dialog-content.svelte'
import Description from './alert-dialog-description.svelte'
import Title from './alert-dialog-title.svelte'

const Root = AlertDialogPrimitive.Root
const Trigger = AlertDialogPrimitive.Trigger

export {
  Cancel,
  Content,
  Description,
  Root,
  Title,
  Trigger,
}
