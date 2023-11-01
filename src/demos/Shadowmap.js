/** @license
 * Copyright 2023 Google LLC.
 * Copyright 2023 João Paquim
 * SPDX-License-Identifier: Apache-2.0
 */

export default class Shadowmap {
	static Tags = ['3d', 'shadows'];

	constructor(glsl, gui) {
		this.glsl = glsl.hook((glsl, p, t) =>
			glsl(
				{
					...p,
					Inc:
						`
        uniform sampler2D shadowmap;
        uniform bool shadowPass;
        varying vec4 shadowCoord;
        varying vec3 Normal, WldPos;
        float PointSize;
        const float lightZ = 1.5;
        #ifdef VERT
        void emitVertex(vec3 pos) {
            vec2 dp = XY*PointSize;
            WldPos = pos;
            vec4 s = vec4(pos.xy+dp, -pos.z, lightZ-pos.z);
            shadowCoord = vec4(s.xyz+s.w, s.w*2.0);
            vec4 viewPos = wld2view(vec4(pos, 1.0)) + vec4(dp,0,0);
            VPos = shadowPass ? s : view2proj(viewPos);
        }
        #else
        vec3 getLightDir() {
            return normalize(vec3(0,0,lightZ)-WldPos);;
        }
        vec3 getEyeDir() {
            return normalize(cameraPos()-WldPos);
        }
        void emitFragment(vec3 color) {
            if (shadowPass) return;
            vec3 lightDir = getLightDir();
            float diff = textureProj(shadowmap, shadowCoord).x*shadowCoord.w - shadowCoord.z;
            float shadow = smoothstep(-0.02, -0.01, diff); // bias
            vec3 n = normalize(Normal);
            float diffuse = max((dot(lightDir, n)), 0.0)*shadow;
            vec3 eyeDir = getEyeDir();
            float spec = smoothstep(0.997, 1.0, dot(n, normalize(lightDir+eyeDir)))*shadow;
            FOut = vec4((diffuse*0.6+0.2)*color + spec*0.3, 1.0);
            FOut.rgb = sqrt(FOut.rgb); // gamma
        }
        #endif
        ` + (p.Inc || '')
				},
				t
			)
		);
	}

	drawScene(params) {
		const { glsl } = this;
		const shadowPass = !params.shadowmap;
		const target = shadowPass
			? glsl({}, { size: [1024, 1024], format: 'depth', tag: 'shadowmap' })
			: null;
		params = { ...params, shadowPass, DepthTest: 1 };
		// sphere
		glsl(
			{
				...params,
				Grid: [3],
				Mesh: [32, 32],
				Clear: [0.5, 0.5, 0.8, 1],
				VP: `
        Normal = uv2sphere(UV);
        emitVertex(Normal*0.3-vec3(0,0,0.3));`,
				FP: `
        emitFragment(vec3(0.8, 0.2, 0.2));`
			},
			target
		);
		// spirals
		glsl(
			{
				...params,
				Mesh: [10, 256],
				VP: `
        vec3 surf(vec2 uv) {
            float s = uv.y*TAU*8.0;
            float r1 = 0.7+cos(s)*0.15;
            vec3 p = torus(vec2(uv.x, uv.y*3.0), r1, 0.02);
            p.z += sin(s)*0.15;
            return erot(p, normalize(vec3(1,-1,0)), time*0.25)-vec3(0,0,0.3);
        }
        void vertex() {
            emitVertex(SURF(surf, UV, Normal, 1e-3));
        }`,
				FP: `emitFragment(vec3(0.3, 0.7, 0.2));`
			},
			target
		);
		// snow
		glsl(
			{
				...params,
				Grid: [16, 16, 16],
				VP: `
        PointSize = 0.005;
        Normal = vec3(0,0,1);
        vec3 p = fract(hash(ID)-time*vec3(0.01,0.01,0.1));
        emitVertex((p-0.5)*2.0);`,
				FP: `
        if (length(XY)>1.0) discard;
        emitFragment(vec3(0.9, 0.9, 0.8));`
			},
			target
		);
		// floor
		glsl(
			{
				...params,
				Face: 'front',
				VP: `
        Normal = vec3(0,0,1);
        emitVertex(vec3(XY, -0.8));`,
				FP: `
        emitFragment(vec3(0.6));`
			},
			target
		);
		return target;
	}

	frame(_, params) {
		const shadowmap = this.drawScene(params);
		this.drawScene({ ...params, Aspect: 'mean', shadowmap });
		//this.glsl({tex:shadowmap, View:[20, 20, 256, 256], FP:`1.0-tex(UV).x`});
	}
}
