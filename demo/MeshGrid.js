/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class MeshGrid {
    static Tags = ['2d'];
    frame(glsl, {time}) {
        glsl({time, Grid:[5,5], Mesh:[4,4], Aspect:'fit'}, `
        varying vec3 color;
        //VERT
        vec4 vertex() {
            color = hash(ID);
            vec2 pos = (vec2(ID)+0.5+XY*(0.5-0.5/vec2(Mesh+1)));
            pos += sin(UV*TAU+time).yx*0.1*(sin(time*0.5));
            return vec4(2.0*pos/vec2(Grid)-1.0, 0.0, 1.0);
        }
        //FRAG
        void fragment() {
            out0 = vec4(mix(color, vec3(1.0), wireframe()*0.5), 1.0);
        }`);
    }
}
