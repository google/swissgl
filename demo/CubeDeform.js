/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class CubeDeform {
    frame(glsl, {time, viewProjMatrix}) {
        glsl({time, viewProjMatrix, Grid:[6,1], Mesh:[20, 20],
        Aspect:'fit', DepthTest:1}, `
        varying vec3 color;
        varying vec3 normal;
        //VERT
        vec3 surface_f(vec2 xy) {
            vec3 pos = cubeVert(xy, ID.x);
            pos += sin(pos*PI+time).zxy*0.2;
            pos = mix(pos, normalize(pos)*1.5, sin(time)*0.8+0.2);
            return pos*0.4;
        }
        vec4 vertex() {
            color = cubeVert(vec2(0), ID.x)*0.5+0.5;
            vec4 v = vec4(SURF(surface_f, XY, normal, 1e-3), 1.0);
            v.xy *= rot2(PI/4.+time*0.2);
            v.yz *= rot2(PI/3.0);
            return viewProjMatrix*v;
        }
        //FRAG
        void fragment() {
            out0.rgb = color*(dot(normal, normalize(vec3(1)))*0.5+0.5);
            vec2 m = UV*4.0;
            out0.rgb = mix(out0.rgb, vec3(1.0), (isoline(m.x)+isoline(m.y))*0.25);
            out0.a = 1.0;
        }`);
    }
}
