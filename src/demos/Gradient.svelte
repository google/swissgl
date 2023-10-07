<script lang="ts">
	import { onMount } from 'svelte';
	import { Canvas } from '$lib/index.js';

	let raf: number;

	onMount(() => () => cancelAnimationFrame(raf));
</script>

<Canvas
	on:glsl={(e) => {
		const glsl = e.detail;
		raf = requestAnimationFrame(function render(t) {
			t /= 1000; // ms to sec
			glsl.adjustCanvas();
			glsl({
				t, // pass uniform 't' to GLSL
				Mesh: [10, 10], // draw a 10x10 tessellated plane mesh
				// Vertex shader expression returns vec4 vertex position in
				// WebGL clip space. 'XY' and 'UV' are vec2 input vertex
				// coordinates in [-1,1] and [0,1] ranges.
				VP: `XY*0.8+sin(t+XY.yx*2.0)*0.2,0,1`,
				FP: `UV,0.5,1`
			});
			raf = requestAnimationFrame(render);
		});
	}}
></Canvas>
