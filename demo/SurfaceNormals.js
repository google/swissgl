/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class SurfaceNormals {
    frame(glsl, t) {
        glsl({t, Mesh:[64,128], Grid:[5,5],
              Aspect:'fit', Perspective:0.5, DepthTest:1}, `
        varying vec2 uv;
        varying vec3 normal;
        //VERT
        vec3 pos_f(vec2 p) {
            p *= TAU;
            vec2 c = sin(t+p*vec2(ID));
            float r = 0.2 + 0.05*c.x + 0.08*c.y;
            vec3 pos = vec3(cos(p.x)*r+0.5, sin(p.x)*r, 0);
            pos.xz *= rot2(p.y);
            pos *= 0.3;
            pos.xz += (vec2(ID)-vec2(Grid-1)*0.5)*0.5;
            return pos;
        }
        vec3 surf_f(vec2 uv, out vec3 normal) {
          const vec2 e = vec2(0.001,0.0);
          vec3 p = pos_f(uv);
          vec3 u = pos_f(uv+e)-p;
          vec3 v = pos_f(uv+e.yx)-p;
          normal = normalize(cross(v, u));
          return p;
        }
        vec4 vertex(vec2 p) {
            uv = p*vec2(Mesh)/4.0;
            vec4 pos = vec4(surf_f(p, normal), 1.0);
            pos.zx *= rot2(t*0.2);
            pos.z -= 0.3;
            pos.zy *= rot2(PI/5.0);
            return pos;
        }
        //FRAG
        float isoline(float v) {
            float distToInt = abs(v-round(v));
            return smoothstep(max(fwidth(v), 0.0001), 0.0, distToInt);
        }
        void fragment() {
            out0 = vec4(normal*0.6, 1);
            out0.rgb += (isoline(uv.x)+isoline(uv.y))*0.2;
        }`);
    }
}
