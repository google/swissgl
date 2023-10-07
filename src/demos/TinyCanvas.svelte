<script lang="ts">
	import { onMount } from 'svelte';
	import { Canvas, type SwissGL } from '$lib/index.js';

	let glsl: SwissGL;

	onMount(() => glsl.stop);
</script>

<Canvas
	on:glsl={(e) => {
		glsl = e.detail;
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
	}}
></Canvas>
