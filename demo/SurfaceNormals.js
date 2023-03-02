/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class SurfaceNormals {
    frame(glsl, {time}) {
        glsl({time, Mesh:[64,128], Grid:[5,5],
              Aspect:'fit', Perspective:0.5, DepthTest:1}, `
        varying vec3 normal;
        //VERT
        vec3 surface_f(vec2 p) {
            p *= TAU;
            vec2 c = sin(time+p*vec2(ID));
            float r = 0.2 + 0.05*c.x + 0.08*c.y;
            vec3 pos = vec3(cos(p.x)*r+0.5, sin(p.x)*r, 0);
            pos.zx *= rot2(p.y);
            pos *= 0.3;
            pos.xz += (vec2(ID)-vec2(Grid-1)*0.5)*0.5;
            return pos;
        }
        vec4 vertex() {
            vec4 pos = vec4(SURF(surface_f, UV, normal, 1e-3), 1.0);
            pos.zx *= rot2(time*0.2);
            pos.z -= 0.3;
            pos.zy *= rot2(PI/5.0);
            return pos;
        }
        //FRAG
        void fragment() {
            out0 = vec4(normal*0.6, 1);
            vec2 m = UV*vec2(Mesh)/4.0;
            out0.rgb += (isoline(m.x)+isoline(m.y))*0.2;
            // useful for debugging incorrect face ordering
            // out0.r += float(!gl_FrontFacing);
        }`);
    }
}
