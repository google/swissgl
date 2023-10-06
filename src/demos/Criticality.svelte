<script lang="ts">
	import { onMount } from 'svelte';
	import SwissGL, { type TextureTarget } from '$lib/index.js';

	let canvas: HTMLCanvasElement;

	let phaseDir = -0.5;

	onMount(() => {
		const glsl = SwissGL(canvas);
		const [W, H] = [40, 20];
		const field = glsl({}, { size: [W, H], story: 2, tag: 'field' }) as TextureTarget[];
		const stepInterval = 0.2;
		const coefs = { spont: 0.001, propagation: 1.1 };

		const shuffle = (n: number) =>
			Array(n)
				// @ts-ignore
				.fill()
				.map((_, i) => [Math.random(), i])
				.sort()
				.map((p) => p[1]);
		const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(x, b));
		const smoothstep = (t: number) => t * t * (3.0 - 2.0 * t);

		const shuffleTex = glsl(
			{},
			{ size: [W, H], format: 'r32f', tag: 'shuffle', data: new Float32Array(shuffle(W * H)) }
		);
		let lastStep = -1000,
			lastTime = 0;
		let phase = 0.1;

		glsl.loop(({ time }) => {
			glsl.adjustCanvas();
			if (time - lastStep > stepInterval) {
				lastStep = time;
				// compute mean activations
				const avg = glsl(
					{
						F: field[0],
						FP: `
float v = 0.0;
for (int y=0; y<F_size().y; ++y) {
    v += F(ivec2(I.x,y)).x;
}
FOut.x = v / float(F_size().y);
`
					},
					{ size: [W, 1], tag: 'avg' }
				);
				// propagate activations
				glsl(
					{
						...coefs,
						avg,
						seed: Math.random() * 12417,
						FP: `
vec3 r = hash(ivec3(I,seed));
float act = avg(ivec2(I.x-1,0)).x;
FOut.x = max(step(r.x, spont),
             step(r.y, act*propagation));
`
					},
					field
				);
			}
			// setup render data
			const dt = time - lastTime;
			lastTime = time;
			phase = clamp(phase + dt * phaseDir, 0.1, 1);
			const common = {
				phase: smoothstep(phase),
				W,
				H,
				shuffleTex,
				Aspect: 'x' as const,
				Inc: `
vec2 nodePos(ivec2 id) {
    float i = shuffleTex(id).x;
    vec2 p1 = 1.8*(vec2(id)+0.5-vec2(W,H)/2.)/W;
    vec2 p2 = rot2(i*2.4) * vec2(1.2*sqrt(i+.5)/W,0);
    return mix(p1,p2, phase);
}`
			};

			// draw edges
			glsl({
				...common,
				Grid: [W - 1, H],
				Blend: 's*sa+d*(1-sa)',
				VP: `
vec2 p1 = nodePos(ID.xy);
vec2 p2 = nodePos(ivec2(ID.x+1, int(hash(ID)*H)));
vec2 n = rot2(PI/2.)*normalize(p2-p1);
VPos.xy = mix(p1,p2,UV.x) + 0.002*XY.y*n;
`,
				FP: `0.3`
			});

			// draw nodes
			const t = (time - lastStep) / stepInterval;
			glsl({
				...common,
				t,
				F: field[0],
				F1: field[1],
				Blend: 's+d',
				Grid: [W, H],
				VP: `
float a = mix(F1(ID.xy).x, F(ID.xy).x, t);
float r = mix(0.01, 0.04, a);
varying vec4 color = mix(vec4(0.2,0.2,0.4,0.3), vec4(1.0), a);
VPos.xy = nodePos(ID.xy) + r*XY;
`,
				FP: `color*exp(-dot(XY,XY)*3.0)`
			});
		});
		return glsl.stop;
	});
</script>

<canvas bind:this={canvas} on:click={() => (phaseDir *= -1)} />

<style>
	canvas {
		width: 100vw;
		height: 100vh;
	}
</style>
