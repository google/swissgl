<script lang="ts">
	import { onMount } from 'svelte';
	import Canvas from './Canvas.svelte';
	import type { SwissGL } from './swissgl.js';

	export let f: (arg: { glsl: SwissGL; time: number }) => void;

	export let canvas: HTMLCanvasElement | undefined = undefined;
	export let glsl: SwissGL | undefined = undefined;

	onMount(() => glsl!.stop);
</script>

<Canvas
	bind:canvas
	bind:glsl
	on:glsl={(e) => {
		glsl = e.detail;
		glsl.loop(f);
	}}
	{...$$restProps}><slot /></Canvas
>
