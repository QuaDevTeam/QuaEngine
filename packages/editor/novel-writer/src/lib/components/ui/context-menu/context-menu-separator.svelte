<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ContextMenuPrimitive.SeparatorProps = $props();
</script>

<ContextMenuPrimitive.Separator
	bind:ref
	data-slot="context-menu-separator"
	class={cn("nw-context-menu-separator bg-border -mx-1 my-1 h-px", className)}
	{...restProps}
/>

<style>
	:global(.nw-context-menu-separator) {
		height: 1px;
		margin: 4px -4px;
		background: var(--border);
	}
</style>
