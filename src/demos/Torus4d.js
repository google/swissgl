/** @license
 * Copyright 2023 Google LLC.
 * Copyright 2023 João Paquim
 * SPDX-License-Identifier: Apache-2.0
 */
export default class Torus4d {
	static Tags = ['3d'];
	frame(glsl, params) {
		glsl({
			...params,
			Mesh: [100, 100],
			Aspect: 'fit',
			AlphaCoverage: 1,
			DepthTest: 1,
			VP: `
            vec4 p = vec4(cos(XY*PI), sin(XY*PI))*0.6;
            p.xw *= rot2(time*0.4);
            VPos = wld2proj(vec4(p.xyz/(1.0-p.w)*0.5, 1));`,
			FP: `
            vec2 v = UV*rot2(PI/4.)*64.0/sqrt(2.);
            v = smoothstep(0.0, 1.0, (abs(v-round(v))-0.02)/fwidth(v));
            float a = 1.0-v.x*v.y;
            if (a<0.1) discard;
            FOut = vec4(gl_FrontFacing?vec3(.9,.9,.6):vec3(.6,.6,.9), a);`
		});
	}
}
