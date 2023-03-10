/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class Shadowmap {
    constructor(glsl, gui) {
        glsl.includes.push(`
            uniform sampler2D shadowmap;
            uniform bool shadowPass;
            varying vec4 shadowCoord;
            varying vec3 Normal, WldPos;
            float PointSize;
            const vec3 lightDir = normalize(vec3(0., -1., 1.));
            const vec3 lightU = normalize(cross(lightDir, vec3(0,0,1)));
            const vec3 lightV = cross(lightDir, lightU);
            #ifdef VERT
            vec4 emitVertex(vec3 pos) {
                vec2 dp = XY*PointSize;
                WldPos = pos;
                vec4 s = vec4(pos*mat3(lightU, lightV,-lightDir), 1.0);
                s.xy += dp; s.xyz *= 0.9;
                shadowCoord = vec4(s.xyz+s.w, s.w*2.0);
                vec4 viewPos = wld2view(vec4(pos, 1.0)) + vec4(dp,0,0);
                return shadowPass ? s : view2proj(viewPos);
            }
            #else
            void emitFragment(vec3 color) {
                if (shadowPass) return;
                float diff = textureProj(shadowmap, shadowCoord).x*shadowCoord.w - shadowCoord.z;
                float shadow = smoothstep(-0.02, -0.01, diff); // bias
                vec3 n = normalize(Normal);
                float diffuse = max((dot(lightDir, n)), 0.0)*shadow;
                vec3 eyeDir = normalize(cameraPos()-WldPos);
                float spec = pow(max(dot(n, normalize(lightDir+eyeDir)), 0.0), 100.0);
                spec = smoothstep(0.5, 0.7, spec)*shadow;
                out0 = vec4((diffuse*0.6+0.2)*color + spec*0.3, 1.0);
                out0.rgb = sqrt(out0.rgb); // gamma
            }
            #endif

            vec3 erot(vec3 p, vec3 ax, float ro) {
                return mix(dot(ax, p)*ax, p, cos(ro)) + cross(ax,p)*sin(ro);
            }
        `);
    }

    drawScene(glsl, params) {
        const shadowPass = !params.shadowmap;
        const target = shadowPass ? 
            glsl({size:[1024, 1024], format:'depth', tag:'shadowmap'}) : null;
        params = {...params, shadowPass, DepthTest:1};
        glsl({...params, Grid:[3], Mesh:[32,32], Clear:[.5,.5,.8,1]}, `
        vec4 vertex() {
            Normal = uv2sphere(UV);
            return emitVertex(Normal*0.3);
        }
        //FRAG
        void fragment() {emitFragment(vec3(0.8, 0.2, 0.2));}`, target);

        glsl({...params, Mesh:[10, 256]}, `
        vec3 surf(vec2 uv) {
            float s = uv.y*TAU*8.0;
            float r1 = 0.7+cos(s)*0.15;
            vec3 p = torus(vec2(uv.x, uv.y*3.0), r1, 0.02);
            p.z += sin(s)*0.15;
            return erot(p, normalize(vec3(1,-1,0)), time*0.25);
        }
        vec4 vertex() {
            return emitVertex(SURF(surf, UV, Normal, 1e-3));
        }
        //FRAG
        void fragment() {emitFragment(vec3(0.3, 0.7, 0.2));}
        `, target);

        glsl({...params, Grid:[16, 16, 16]}, `
        vec4 vertex() {
            PointSize = 0.005;
            Normal = lightDir;
            vec3 p = fract(hash(ID)-time*vec3(0.01,0.01,0.1));
            return emitVertex((p-0.5)*2.0);
        }
        //FRAG
        void fragment() {
            if (length(XY)>1.0) discard;
            emitFragment(vec3(0.9, 0.9, 0.8));
        }`, target)

        glsl(params, `
        vec4 vertex() {
            Normal = vec3(0,0,1);
            return emitVertex(vec3(XY, -0.4));
        }
        //FRAG
        void fragment() {emitFragment(vec3(0.6));}
        `, target)
        return target;
    }

    frame(glsl, params) {
        const shadowmap = this.drawScene(glsl, params);
        this.drawScene(glsl, {...params, Aspect:'mean', shadowmap});
        glsl({tex:shadowmap, View:[20, 20, 256, 256]}, `1.0-tex(UV).x`);
    }
}
