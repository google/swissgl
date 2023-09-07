/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class GameOfLife {
    static Tags = ['2d', 'ca'];
    frame(glsl) {
        const state = glsl({FP:`
        FOut = Src(I);
        if (FOut.w == 0.0) {
            float v = float((I.x^I.y+100)%9==0);
            FOut = vec4(v,0,0,1);
            return;
        }
        ivec2 sz = Src_size();
        int x=I.x,l=(x-1+sz.x)%sz.x,r=(x+1)%sz.x;
        int y=I.y,d=(y-1+sz.y)%sz.y,u=(y+1)%sz.y;
        #define S(u,v) (Src(ivec2(u,v)).x)
        float nhood = S(l,y)+S(r,y)+S(x,u)+S(x,d)+S(l,u)+S(l,d)+S(r,u)+S(r,d);
        float v = float(nhood<3.5 && nhood>1.5 && (FOut.x+nhood) > 2.5);
        FOut = vec4(v,0,0,1);
        `}, {scale:1/4, story:2, tag:'state'});
        const fade = glsl({S:state[0], Blend:'d*sa+s', FP:`S(I).xxx,0.9`},
            {size:state[0].size, tag:'fade'})
        glsl({fade, FP:`fade(UV).x`});
    }
}
