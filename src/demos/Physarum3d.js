/** @license
 * Copyright 2023 Google LLC.
 * Copyright 2023 João Paquim
 * SPDX-License-Identifier: Apache-2.0
 */

export default class Physarum3d {
	static Tags = ['3d'];

	constructor(glsl, gui) {
		this.showVolume = true;
		gui.add(this, 'showVolume');
	}

	frame(glsl, params) {
		const D = 14,
			Inc = `const int D=${D}, D2=D*D;
        ivec2 pos2field(vec3 p) {
            ivec3 i = ivec3(fract(p)*float(D2));
            return i.xy+ivec2(i.z%D, i.z/D)*D2;
        }`;

		// diffusion
		const field = glsl(
			{
				Inc,
				FP: `
        ivec3 p = ivec3(I%D2, I.y/D2*D + I.x/D2);
        ivec3 a=(p-1+D2)%D2, b=(p+1)%D2;
        #define V(cx,cy,cz) Src(ivec2(cx.x+(cz.z%D)*D2, cy.y+(cz.z/D)*D2)).r
        FOut.r = Src(I).r*4.0+V(a,p,p)+V(b,p,p)+V(p,a,p)+V(p,b,p)+V(p,p,a)+V(p,p,b);
        FOut.r *= 0.99/(6.0+4.0);
        `
			},
			{ size: [D * D * D, D * D * D], story: 2, format: 'r16f', tag: 'field' }
		);

		// agent motion
		const points = glsl(
			{
				Inc,
				field: field[0],
				seed: Math.random() * 12312567,
				FP: `
        vec3 rndunit(ivec3 seed) {
            return normalize(tan(hash(seed)*2.-1.));
        }
        void fragment() {
            FOut = Src(I,0); FOut1 = Src(I,1);
            if (FOut.w == 0.0) {
                ivec3 r3 = ivec3(I, seed);
                FOut = vec4(hash(r3), 1.0);
                FOut1 = vec4(rndunit(r3.yxz), 0.0);
                return;
            }
            vec3 pos = FOut.xyz, dir = FOut1.xyz;
            vec3 turn = normalize(cross(rndunit(ivec3(I,seed)), dir));
            float senseDist = 0.02;
            float s0 = field(pos2field(pos + dir*senseDist)).r;
            float s1 = field(pos2field(pos + normalize(dir+turn*0.5)*senseDist)).r;
            if (s1>s0) {
                dir = normalize(dir+turn*0.1);
            }
            FOut.xyz = fract(pos + dir*0.001);
            FOut1.xyz = dir;
        }`
			},
			{ size: [256, 256], story: 2, format: 'rgba32f', layern: 2, tag: 'points' }
		);

		// deposit
		glsl(
			{
				points: points[0],
				Grid: points[0].size,
				Blend: 's+d',
				Inc,
				VP: `
        vec3 pos = points(ID.xy,0).xyz;
        int l = int(pos.z*float(D2));
        VPos.xy = (pos.xy+vec2(l%D, l/D))/float(D) + 0.5*XY/float(D2*D);
        VPos.xy = VPos.xy*2.0-1.0;
        `,
				FP: `1.0`
			},
			field[0]
		);

		// render agents
		glsl({
			...params,
			Aspect: 'fit',
			DepthTest: 1,
			points: points[0],
			Grid: points[0].size,
			Mesh: [6, 1],
			VP: `
        vec3 pos = points(ID.xy,0).xyz*2.0-1.0;
        vec3 dir = points(ID.xy,1).xyz;
        vec3 u=normalize(cross(dir, vec3(1))), v=cross(dir, u);
        vec2 p = rot2(UV.x*TAU)*vec2(0.5,0);
        pos += 0.01*mat3(u, v, dir*2.0)*vec3(p*UV.y, 1.0-UV.y);
        VPos = wld2proj(pos*0.75);
        `,
			FP: `1.0-UV.y*0.7`
		});

		// fake volume rendering
		if (this.showVolume) {
			glsl({
				...params,
				T: field[0],
				Grid: [(D * D) / 2, 3],
				Blend: 's+d',
				Aspect: 'fit',
				DepthTest: 'keep',
				Inc: Inc + `varying vec3 p;`,
				VP: `
            float l = float(ID.x)/float(Grid.x);
            p = vec3(UV,l);
            p = ID.y==0 ? p : (ID.y==1 ? p.xzy : p.zxy);
            VPos = wld2proj((p*2.0-1.0)*0.75);`,
				FP: `T(pos2field(p)).r*vec3(1,0.3,0.1)*0.005,1`
			});
		}
	}
}
