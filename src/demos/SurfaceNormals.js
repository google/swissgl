/** @license
 * Copyright 2023 Google LLC.
 * Copyright 2023 João Paquim
 * SPDX-License-Identifier: Apache-2.0
 */

export default class SurfaceNormals {
	static Tags = ['3d'];

	frame(glsl, params) {
		glsl({
			...params,
			Mesh: [64, 128],
			Grid: [5, 5],
			Aspect: 'fit',
			DepthTest: 1,
			VP: `
        vec3 surface_f(vec2 p) {
            vec2 c = sin(time+p*vec2(ID)*TAU);
            vec3 pos = torus(p, 1.0, 0.4 + 0.1*c.x + 0.15*c.y)/8.0;
            pos.xy += (vec2(ID)-vec2(Grid-1)*0.5)*0.4;
            return pos;
        }
        void vertex() {
            varying vec3 normal;
            vec4 pos = vec4(SURF(surface_f, UV, normal, 1e-3), 1.0);
            VPos = wld2proj(pos);
        }`,
			FP: `
            FOut = vec4(normal*0.6, 1);
            vec2 m = UV*vec2(Mesh)/4.0;
            FOut.rgb += (isoline(m.x)+isoline(m.y))*0.2;
            // useful for debugging incorrect face ordering
            // FOut.r += float(!gl_FrontFacing);
        `
		});
	}
}
