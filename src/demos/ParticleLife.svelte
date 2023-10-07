<script lang="ts">
	import { onMount } from 'svelte';
	import { Canvas } from '$lib/index.js';

	let raf: number;

	onMount(() => () => cancelAnimationFrame(raf));
</script>

<Canvas
	on:glsl={(e) => {
		const glsl = e.detail;
		const K = 6;
		const F = glsl(
			{ K, FP: `float(I.x==I.y) + 0.1*float(I.x==(I.y+1)%int(K))` },
			{ size: [K, K], format: 'r16f', tag: 'F' }
		);
		glsl({ F, FP: `F(I/20).x*3.` });
		const points = glsl({}, { size: [30, 10], story: 3, format: 'rgba32f', tag: 'points' });
		for (let i = 0; i < 2; ++i) {
			glsl(
				{
					K,
					seed: 123,
					FP: `
vec2 pos = (hash(ivec3(I, seed)).xy-0.5)*10.;
float color = floor(UV.x*K);
FOut = vec4(pos, 0.0, color);`
				},
				points
			);
		}
		raf = requestAnimationFrame(function render(t) {
			glsl(
				{
					F,
					worldExtent: 15,
					repulsion: 2,
					inertia: 0.1,
					dt: 0.1,
					past: points[1],
					FP: `
vec3 wrap(vec3 p) {
	return (fract(p/worldExtent+0.5)-0.5)*worldExtent;
}
void fragment() {
	FOut = Src(I);
	vec3 force = vec3(0);
	for (int y = 0; y < ViewSize.y; ++y)
	for (int x = 0; x < ViewSize.x; ++x) {
    vec4 data1 = Src(ivec2(x, y));
		vec3 dpos = wrap(data1.xyz-FOut.xyz);
		float r = length(dpos);
		if (r>3.) continue;
		dpos /= r+1e-8;
		float rep = max(1.-r, 0.)*repulsion;
		float f = F(ivec2(FOut.w, data1.w)).x;
		float inter = f*max(1.-abs(r-2.), 0.);
		force += dpos*(inter-rep);
  }
	vec3 vel = wrap(FOut.xyz-past(I).xyz)*pow(inertia, dt);
	FOut.xyz = wrap(FOut.xyz+vel+.5*force*dt*dt);
}`
				},
				points
			);
			glsl.adjustCanvas();
			glsl({
				K,
				worldExtent: 15,
				points: points[0],
				Grid: points[0].size,
				Aspect: 'fit',
				Blend: 'd*(1-sa)+s*sa',
				VP: `
vec4 d = points(ID.xy);
varying vec3 color = cos((d.w/K+vec3(0,0.33,0.66))*TAU)*0.5+0.5;
VPos.xy = 2.*(d.xy+XY/8.)/worldExtent;`,
				FP: `color,smoothstep(1.,0.6,length(XY))`
			});
			raf = requestAnimationFrame(render);
		});
	}}
></Canvas>
