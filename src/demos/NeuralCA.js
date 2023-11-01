/** @license
 * Copyright 2023 Google LLC.
 * Copyright 2023 João Paquim
 * SPDX-License-Identifier: Apache-2.0
 */

// Based on "μNCA: Texture Generation with Ultra-Compact Neural Cellular Automata"
// https://arxiv.org/abs/2111.13545
export default class NeuralCA {
	static Tags = ['2d', 'ca'];
	constructor() {
		this.W = new Float32Array([
			-67, 1, 2, 44, -13, -59, 4, 30, -1, 16, -57, 9, -10, -4, -2, -41, 19, -18, -1, 8, -4, 35, 8,
			0, -4, -4, -1, 0, 34, 31, 21, -25, 4, 13, 18, -57, -79, -22, -25, 71, -12, -11, 24, 27, -17,
			-8, -7, 6, 11, 10, 4, 0, 4, 1, 2, 7, -26, -33, -15, -3, 22, 27, 20, -34
		]);
		this.b = new Float32Array([2, -5, -14, 9]);
	}
	frame(glsl) {
		const state = glsl(
			{
				W: this.W,
				b: this.b,
				FP: `
        uniform mat4 W[4];
        uniform vec4 b;
        vec4 rule(vec4 s, vec4 p) {
          return 1e-3*(b + W[0]*s + W[1]*p + W[2]*abs(s) + W[3]*abs(p));     
        }
        void fragment() {
          vec4 s = Src(UV);
          if (s == vec4(0)) {
            ivec2 I = ivec2(gl_FragCoord.xy);
            FOut = 0.1+vec4(hash(I.xyy).x)*0.4;
            return;
          }
          vec2 dp = Src_step();
          float x=UV.x, y=UV.y;
          float l=x-dp.x, r=x+dp.x, u=y-dp.y, d=y+dp.y;
          #define R(x, y) Src(vec2(x, y))
          // perception
          vec4 p = R(l,u)*vec4(1,1,-1, 1) + R(x,u)*vec4(2,2,0, 2) + R(r,u)*vec4(1,1,1, 1)
                 + R(l,y)*vec4(2,2,-2, 0) +  s*vec4(-12,-12,0, 0) + R(r,y)*vec4(2,2,2, 0)
                 + R(l,d)*vec4(1,1,-1,-1) + R(x,d)*vec4(2,2,0,-2) + R(r,d)*vec4(1,1,1,-1);
          vec4 ds = rule(s-0.5, p);  // NCA rule application
          FOut = s+ds;
        }`
			},
			{ story: 2, scale: 1 / 4, tag: 'state' }
		);
		glsl({ tex: state[0], FP: `tex(UV)*2.-.5` });
	}
}
