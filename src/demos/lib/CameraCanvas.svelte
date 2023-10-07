<script lang="ts">
	import { onMount } from 'svelte';
	import { Canvas } from '$lib/index.js';
	import glsl_include from './include.glsl?raw';

	export let r;

	let canvas: HTMLCanvasElement;

	// viewParams
	let canvasSize = new Float32Array(2);
	let pointer = new Float32Array(3);
	let cameraYPD = new Float32Array(3);

	let raf: number;

	onMount(() => () => cancelAnimationFrame(raf));

	function resetCamera() {
		cameraYPD.set([(Math.PI * 3) / 4, Math.PI / 4, 1.8]);
	}

	function setPointer(e: PointerEvent, buttons: number) {
		const [w, h] = canvasSize;
		const [x, y] = [e.offsetX - w / 2, h / 2 - e.offsetY];
		pointer.set([x, y, buttons]);
		return [x, y];
	}
</script>

<Canvas
	bind:canvas
	on:glsl={(e) => {
		const glsl = e.detail;

		resetCamera();

		raf = requestAnimationFrame(function render(t) {
			raf = requestAnimationFrame(render);
			glsl.adjustCanvas(1);
			canvasSize.set([canvas.clientWidth, canvas.clientHeight]);

			r({ Inc: glsl_include, t, v: { canvasSize, pointer, cameraYPD }, glsl });
		});
	}}
	on:pointerdown={(e) => {
		if (!e.isPrimary) return;
		setPointer(e, e.buttons);
	}}
	on:pointerout={(e) => setPointer(e, 0)}
	on:pointerup={(e) => setPointer(e, 0)}
	on:pointermove={(e) => {
		const [px, py, _] = pointer;
		const [x, y] = setPointer(e, e.buttons);
		if (!e.isPrimary || e.buttons != 1) return;
		let [yaw, pitch, dist] = cameraYPD;
		yaw -= (x - px) * 0.01;
		pitch += (y - py) * 0.01;
		pitch = Math.min(Math.max(pitch, 0), Math.PI);
		cameraYPD.set([yaw, pitch, dist]);
	}}
></Canvas>
