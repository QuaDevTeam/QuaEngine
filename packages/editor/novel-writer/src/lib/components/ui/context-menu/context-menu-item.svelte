<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		inset = false,
		variant = "default",
		children,
		...restProps
	}: ContextMenuPrimitive.ItemProps & {
		inset?: boolean;
		variant?: "default" | "destructive";
	} = $props();
</script>

<ContextMenuPrimitive.Item
	bind:ref
	data-slot="context-menu-item"
	data-inset={inset}
	data-variant={variant}
	class={cn(
		"nw-context-menu-item focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset=true]:pl-8 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</ContextMenuPrimitive.Item>

<style>
	:global(.nw-context-menu-item) {
		position: relative;
		display: flex;
		width: 100%;
		min-height: 30px;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: var(--radius-xs);
		color: var(--text);
		font-size: 13px;
		line-height: 1.35;
		user-select: none;
		outline: none;
		cursor: default;
		transition:
			background 100ms ease,
			color 100ms ease,
			opacity 100ms ease;
	}

	:global(.nw-context-menu-item[data-inset="true"]) {
		padding-left: 32px;
	}

	:global(.nw-context-menu-item svg) {
		width: 14px;
		height: 14px;
		flex: 0 0 auto;
		pointer-events: none;
	}

	:global(.nw-context-menu-item:hover:not([data-disabled])),
	:global(.nw-context-menu-item:focus:not([data-disabled])),
	:global(.nw-context-menu-item[data-highlighted]:not([data-disabled])) {
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	:global(.nw-context-menu-item[data-variant="destructive"]) {
		color: var(--danger);
	}

	:global(.nw-context-menu-item[data-variant="destructive"]:hover:not([data-disabled])),
	:global(.nw-context-menu-item[data-variant="destructive"]:focus:not([data-disabled])),
	:global(.nw-context-menu-item[data-variant="destructive"][data-highlighted]:not([data-disabled])) {
		background: var(--danger-soft);
		color: var(--danger);
	}

	:global(.nw-context-menu-item[data-disabled]) {
		pointer-events: none;
		opacity: 0.48;
	}
</style>
