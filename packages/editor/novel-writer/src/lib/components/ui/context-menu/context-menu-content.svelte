<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		children,
		...restProps
	}: ContextMenuPrimitive.ContentProps = $props();
</script>

<ContextMenuPrimitive.Portal>
	<ContextMenuPrimitive.Content
		bind:ref
		data-slot="context-menu-content"
		class={cn(
			"nw-context-menu bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50 min-w-32 overflow-hidden rounded-md border p-1 shadow-md",
			className
		)}
		{sideOffset}
		{...restProps}
	>
		{@render children?.()}
	</ContextMenuPrimitive.Content>
</ContextMenuPrimitive.Portal>

<style>
	:global(.nw-context-menu) {
		z-index: 1000;
		min-width: 160px;
		overflow: hidden;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-md);
	}

	:global(.nw-context-menu[data-state="open"]) {
		animation: nw-context-menu-in 110ms ease-out;
	}

	@keyframes nw-context-menu-in {
		from {
			opacity: 0;
			transform: translateY(-2px) scale(0.98);
		}

		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
