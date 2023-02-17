/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

// Inspired by https://cargocollective.com/sagejenson/physarum
class Physarum {

    constructor(glsl, gui) {
        const U = this.U = {};
        const par = (s, v, ...arg)=>{U[s]=v;gui.add(U,s,...arg)};
        par('step_n',      1,    0, 20, 1);
        par('density',     1,    1, 4,  1);
        par('senseAng',  5.5, -180, 180  );
        par('senseDist',  18,    1, 50   );
        par('moveAng',    45,    0, 180  );
        par('moveDist',    2,    0, 10   );
        par('viewScale',   1,    1, 3,  1);
    }

    frame(glsl) {
        for (let i=0; i<this.U.step_n; ++i) {
            this.step(glsl);
        }
        glsl({field:this.field[0], ...this.U}, `field(P*viewScale).x`);
    }

    step(glsl) {
        const field = this.field = glsl(`
        vec2 dp = Src_step();
        float x=P.x, y=P.y;
        float l=x-dp.x, r=x+dp.x, u=y-dp.y, d=y+dp.y;
        #define S(x,y) (Src(vec2(x,y)))
        out0 = 0.95*(S(x,y)+S(l,y)+S(r,y)+S(x,u)+S(x,d)+S(l,u)+S(r,u)+S(l,d)+S(r,d))/9.0;
        `, {story:2, format:'rgba8'});

        const points = glsl({field:field[0], ...this.U}, `
        out0 = Src(I);
        vec2 wldSize = vec2(field_size());
        if (out0.w == 0.0 || out0.x>=wldSize.x || out0.y>=wldSize.y) {
            out0 = vec4(hash(ivec3(I, 123)), 1.0);
            out0.xyz *= vec3(wldSize, TAU); 
            return;
        }
        vec2 dir = vec2(cos(out0.z), sin(out0.z));
        mat2 R = rot2(radians(senseAng));
        vec2 sense = senseDist*dir;
        #define F(p) field((out0.xy+(p))/wldSize).x
        float c=F(sense), r=F(R*sense), l=F(sense*R);
        float rotAng = radians(moveAng);
        if (l>c && c>r) {
            out0.z -= rotAng;
        } else if (r>c && c>l) {
           out0.z += rotAng;
        } else if (c<=r && c<=l) {
           out0.z += sign(hash(ivec3(out0.xyz*5039.)).x-0.5)*rotAng;
        }
        out0.xy += dir*moveDist;
        out0.xy = mod(out0.xy, wldSize);
        `, {scale:this.U.density/16, story:2, format:'rgba32f'});
        
        glsl({points: points[0], Grid: points[0].size, Blend: 's+d'}, `
        varying vec2 r;
        //VERT
        vec4 vertex(vec2 uv) {
            vec4 d = points(ID);
            r = uv*2.0-1.0;
            return vec4(2.0*(d.xy+r*2.0)/vec2(ViewSize)-1.0, 0.0, 1.0);
        }
        //FRAG
        void fragment() {
            out0 = vec4(smoothstep(1.0, 0.0, length(r)));
        }`, field[0]);
    }
}
