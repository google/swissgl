/** @license
 * Copyright 2023 Google LLC.
 * SPDX-License-Identifier: Apache-2.0
 */

// Inspired by the video https://youtu.be/p4YirERTVF0?t=480
class ParticleLife {
	static Tags = ['2d', 'simulation'];
	constructor(glsl, gui) {
		this.glsl = glsl;
		this.step_n = 1;
		this.dt = 0.1;
		this.worldExtent = 15.0;
		this.repulsion = 2.0;
		this.inertia = 0.1;
		gui.add(this, 'step_n', 0, 50, 1);
		gui.add(this, 'dt', 0.0, 0.5);
		gui.add(this, 'worldExtent', 10, 50);
		gui.add(this, 'repulsion', 0.0, 10.0);
		gui.add(this, 'inertia', 0.0, 1.0);
		gui.add(this, 'reset');
		const K = (this.K = 6);
		this.F = glsl(
			{ K, FP: `float(I.x==I.y) + 0.1*float(I.x==(I.y+1)%int(K))` },
			{ size: [K, K], format: 'r16f', tag: 'F' }
		);
		this.points = glsl({}, { size: [30, 10], story: 3, format: 'rgba32f', tag: 'points' });
		this.reset();
	}

	reset() {
		for (let i = 0; i < 2; ++i) {
			this.glsl(
				{
					K: this.K,
					seed: 123,
					FP: `
                vec2 pos = (hash(ivec3(I, seed)).xy-0.5)*10.0;
                float color = floor(UV.x*K);
                FOut = vec4(pos, 0.0, color);`
				},
				this.points
			);
		}
	}

	step(touchPos) {
		touchPos = touchPos || [-1000, 0, 0];
		const { K, F, points, worldExtent, repulsion, inertia, dt } = this;
		for (let i = 0; i < this.step_n; ++i)
			this.glsl(
				{
					F,
					touchPos,
					worldExtent,
					repulsion,
					inertia,
					dt,
					past: points[1],
					FP: `
        vec3 wrap(vec3 p) {
          return (fract(p/worldExtent+0.5)-0.5)*worldExtent;
        }
        void fragment() {
            FOut = Src(I);
            vec3 force=vec3(0);
            for (int y=0; y<ViewSize.y; ++y)
            for (int x=0; x<ViewSize.x; ++x) {
              vec4 data1 = Src(ivec2(x,y));
              vec3 dpos = wrap(data1.xyz-FOut.xyz);
              float r = length(dpos);
              if (r>3.0) continue;
              dpos /= r+1e-8;
              float rep = max(1.0-r, 0.0)*repulsion;
              float f = F(ivec2(FOut.w, data1.w)).x;
              float att = f*max(1.0-abs(r-2.0), 0.0);
              force += dpos*(att-rep);
            }
            vec3 touchVec = (touchPos-FOut.xyz);
            force += touchVec*exp(-dot(touchVec, touchVec))*50.0;
            vec3 vel = wrap(FOut.xyz-past(I).xyz)*pow(inertia, dt);
            FOut.xyz = wrap(FOut.xyz+vel+0.5*force*(dt*dt));
        }`
				},
				points
			);
	}

	frame(glsl, params) {
		const { K, points, worldExtent } = this;
		let touchPos;
		if (params.pointer[2]) {
			const [x, y, _] = params.pointer;
			const s = worldExtent / Math.min(...params.canvasSize);
			touchPos = [x * s, y * s, 0];
		}
		this.step(touchPos);

		const field = glsl(
			{
				K,
				worldExtent,
				points: points[0],
				Grid: [...points[0].size, 4],
				Blend: 's+d',
				Clear: 0.0,
				VP: `
            vec4 d = points(ID.xy);
            varying vec3 color = cos((d.w/K+vec3(0,0.33,0.66))*TAU)*0.5+0.5;
            VPos.xy = 2.0*(d.xy+XY*1.5)/worldExtent;
            VPos.xy -= 2.0*vec2(ID.z%2, ID.z/2)*sign(d.xy);`,
				FP: `color*smoothstep(1.0, 0.8, length(XY)),1`
			},
			{ size: [256, 256], format: 'rgba16f', filter: 'linear', tag: 'field' }
		);
		glsl({ field, Aspect: 'fit', FP: `sqrt(field(UV))*0.07` });

		glsl({
			K,
			worldExtent,
			points: points[0],
			Grid: points[0].size,
			Aspect: 'fit',
			Blend: 'd*(1-sa)+s*sa',
			VP: `
            vec4 d = points(ID.xy);
            varying vec3 color = cos((d.w/K+vec3(0,0.33,0.66))*TAU)*0.5+0.5;
            VPos.xy = 2.0*(d.xy+XY/8.0)/worldExtent;`,
			FP: `color, smoothstep(1.0, 0.6, length(XY))`
		});
	}
}
