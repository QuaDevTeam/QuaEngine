<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Button as ShadcnButton, type ButtonSize } from './button'

  type Props = {
    type?: 'button' | 'submit' | 'reset'
    variant?: 'default' | 'secondary' | 'ghost' | 'destructive'
    size?: 'sm' | 'md' | 'icon'
    disabled?: boolean
    class?: string
    onclick?: (event: MouseEvent) => void
    title?: string
    'aria-label'?: string
    children?: Snippet
  }

  let {
    type = 'button',
    variant = 'default',
    size = 'md',
    disabled = false,
    class: className = '',
    onclick,
    title,
    'aria-label': ariaLabel,
    children,
  }: Props = $props()

  const shadcnSize = $derived((size === 'md' ? 'default' : size) as ButtonSize)
  const buttonClass = $derived([
    'nw-button',
    variant === 'default' && 'nw-button-default',
    variant === 'secondary' && 'nw-button-secondary',
    variant === 'ghost' && 'nw-button-ghost',
    variant === 'destructive' && 'nw-button-destructive',
    size === 'sm' && 'nw-button-sm',
    size === 'icon' && 'nw-button-icon',
    className,
  ].filter(Boolean).join(' '))
</script>

<ShadcnButton
  class={buttonClass}
  {disabled}
  size={shadcnSize}
  {type}
  {variant}
  {onclick}
  {title}
  aria-label={ariaLabel}
>
  {@render children?.()}
</ShadcnButton>

<style>
  :global(.nw-button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 14px;
    border: 1px solid transparent;
    border-radius: 7px;
    font-size: 14px;
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }

  :global(.nw-button:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }

  :global(.nw-button-default) {
    background: var(--accent);
    color: #fff;
  }

  :global(.nw-button-default:hover:not(:disabled)) {
    background: var(--accent-strong);
  }

  :global(.nw-button-secondary) {
    border-color: var(--border);
    background: var(--surface);
    color: var(--text);
  }

  :global(.nw-button-secondary:hover:not(:disabled)) {
    border-color: var(--border-strong);
    background: var(--surface-muted);
  }

  :global(.nw-button-ghost) {
    background: transparent;
    color: var(--text-muted);
  }

  :global(.nw-button-ghost:hover:not(:disabled)) {
    background: var(--surface-muted);
    color: var(--text);
  }

  :global(.nw-button-destructive) {
    background: var(--danger);
    color: #fff;
  }

  :global(.nw-button-sm) {
    min-height: 30px;
    padding: 0 10px;
    font-size: 12px;
  }

  :global(.nw-button-icon) {
    width: 36px;
    padding: 0;
  }
</style>
