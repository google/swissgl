<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { SwissGL } from './swissgl.js';

	const dispatch = createEventDispatcher<{ glsl: SwissGL }>();

	export let canvas: HTMLCanvasElement | undefined = undefined;
	export let glsl: SwissGL | undefined = undefined;

	onMount(() => {
		glsl = SwissGL(canvas!);
		dispatch('glsl', glsl);
	});
</script>

<canvas
	bind:this={canvas}
	{...$$restProps}
	on:click
	on:mousedown
	on:mouseup
	on:mousemove
	on:mouseenter
	on:mouseleave
	on:pointerdown
	on:pointerup
	on:pointercancel
	on:pointermove
	on:pointerenter
	on:pointerover
	on:pointerleave
	on:pointerout
	on:wheel><slot /></canvas
>

<style>
	canvas {
		width: var(--width, 100%);
		height: var(--height, 100%);
	}
</style>
