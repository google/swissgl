/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

// Inspired by https://cargocollective.com/sagejenson/physarum
class Physarum {
    static Tags = ['2d', 'simulation'];

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
        glsl({field:this.field[0], ...this.U, FP:`field(UV*viewScale).x`});
    }

    step(glsl) {
        const field = this.field = glsl({FP:`
        vec2 dp = Src_step();
        float x=UV.x, y=UV.y;
        float l=x-dp.x, r=x+dp.x, u=y-dp.y, d=y+dp.y;
        #define S(x,y) (Src(vec2(x,y)))
        FOut = 0.95*(S(x,y)+S(l,y)+S(r,y)+S(x,u)+S(x,d)+S(l,u)+S(r,u)+S(l,d)+S(r,d))/9.0;
        `}, {story:2, format:'rgba8', tag:'field'});

        const points = glsl({field:field[0], ...this.U, FP:`
        FOut = Src(I);
        vec2 wldSize = vec2(field_size());
        if (FOut.w == 0.0 || FOut.x>=wldSize.x || FOut.y>=wldSize.y) {
            FOut = vec4(hash(ivec3(I, 123)), 1.0);
            FOut.xyz *= vec3(wldSize, TAU); 
            return;
        }
        vec2 dir = vec2(cos(FOut.z), sin(FOut.z));
        mat2 R = rot2(radians(senseAng));
        vec2 sense = senseDist*dir;
        #define F(p) field((FOut.xy+(p))/wldSize).x
        float c=F(sense), r=F(R*sense), l=F(sense*R);
        float rotAng = radians(moveAng);
        if (l>c && c>r) {
            FOut.z -= rotAng;
        } else if (r>c && c>l) {
           FOut.z += rotAng;
        } else if (c<=r && c<=l) {
           FOut.z += sign(hash(ivec3(FOut.xyz*5039.)).x-0.5)*rotAng;
        }
        FOut.xy += dir*moveDist;
        FOut.xy = mod(FOut.xy, wldSize);
        `}, {scale:this.U.density/16, story:2, format:'rgba32f', tag:'points'});
        
        glsl({points: points[0], Grid: points[0].size, Blend: 's+d', VP:`
        VOut.xy = 2.0 * (points(ID.xy).xy+XY*2.0)/vec2(ViewSize) - 1.0;`, FP:`
        smoothstep(1.0, 0.0, length(XY))`}, field[0]);
    }
}
