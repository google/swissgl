<script lang="ts">
	import { onMount } from 'svelte';
	import SwissGL from '$lib/index.js';

	let canvas: HTMLCanvasElement;

	onMount(() => {
		const glsl = SwissGL(canvas);
		glsl.loop(({ time }) => {
			glsl.adjustCanvas();
			glsl({
				time,
				Aspect: 'cover',
				FP: `
sin(length(XY)*vec3(30,30.5,31)
-time+atan(XY.x,XY.y)*3.),1`
			});
		});
		return glsl.stop;
	});
</script>

<canvas bind:this={canvas} />

<style>
	canvas {
		width: 100%;
		height: 100%;
	}
</style>
