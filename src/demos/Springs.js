/** @license
 * Copyright 2023 Google LLC.
 * SPDX-License-Identifier: Apache-2.0
 */

class Springs {
	static Tags = ['2d'];

	constructor(glsl, gui) {
		this.glsl = glsl;
		this.reset();
		this.params = { waveRate: 4.0 };
		gui.add(this, 'reset');
		gui.add(this.params, 'waveRate', 0.0, 8.0);
	}

	reset() {
		const { glsl } = this;
		for (let i = 0; i < 2; ++i)
			this.points = glsl(
				{
					FP: `
            XY*rot2(PI+0.1)*0.6+vec2(0,0.3),0,(UV.x+UV.y)*10.0
        `
				},
				{ size: [64, 64], format: 'rgba32f', story: 2, tag: 'points' }
			);
	}

	frame(glsl, { time }) {
		const { points } = this;

		const next = glsl(
			{
				time,
				...this.params,
				points: points[0],
				prev: points[1],
				FP: `
            FOut = points(I);
            if ((I.x%8 == 0 && I.y==0) || I == ivec2(ViewSize.x-1,0)) return;
            vec3 vel = FOut.xyz-prev(I).xyz;
            vel.y -= 0.0005;
            FOut += vec4(vel, waveRate/60.0);
            if (FOut.y<-0.8) {
                FOut.x -= vel.x*0.8;
            }
        `
			},
			{ size: points[0].size, format: 'rgba32f', story: 2, tag: 'next' }
		);

		for (let i = 0; i < 8; ++i)
			glsl(
				{
					time,
					FP: `
            vec4 relax(vec3 p, vec3 p0, float dist) {
                vec3 dp = p-p0;
                return vec4(p0+dp/(length(dp)+1e-10)*dist, 1.0);
            }
            void fragment() {
                vec4 p = FOut = Src(I);
                if ((I.x%8 == 0 && I.y==0) || I == ivec2(ViewSize.x-1,0)) return;
                vec4 acc = vec4(0);
                ivec2 i, D = ViewSize;
                float f0 = sin(p.w);
                const int R = 1;
                for (i.y=-R; i.y<=R; ++i.y) if (I.y+i.y>=0 && I.y+i.y<D.y)
                for (i.x=-R; i.x<=R; ++i.x) if (I.x+i.x>=0 && I.x+i.x<D.x) {
                    if (abs(i.x)+abs(i.y)>1) continue;
                    if (i==ivec2(0)) continue;
                    vec4 p1 = Src(I+i);
                    float f1 = sin(p1.w);
                    float f = 1.0;// + 0.5*0.5*(f0+f1);
                    acc += relax(p.xyz, p1.xyz, f*length(vec2(i)/vec2(D)));
                }
                FOut.xyz = acc.xyz/acc.w;
                if (FOut.y<-0.8) {
                    FOut.y = -0.8;
                    FOut.x = mix(FOut.x, p.x, 0.9);
                }
            }`
				},
				next
			);
		glsl({ next: next[0], FP: `next(I)` }, points);

		glsl({ FP: `float(XY.y<-0.8)*0.5` });

		const [w, h] = points[0].size;
		glsl({
			points: next[0],
			Mesh: [w - 1, h - 1],
			Aspect: 'y',
			Blend: 'd*(1-sa)+s*sa',
			VP: `
        points(VID.xy).xy,0,1`,
			FP: `sqrt(isoline(UV.x*float(Mesh.x))+isoline(UV.y*float(Mesh.y)))`
		});
	}
}
