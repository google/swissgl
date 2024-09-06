/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class ReactionDiffusion {
    static Tags = ['3d', 'simulation'];

    constructor(glsl, gui) {
        this.glsl = glsl;
        this.step_n = 3;
        this.twist = 2;
        gui.add(this, 'reset');
        gui.add(this, 'step_n', 0, 20, 1);
        gui.add(this, 'twist', 0, 5, 1);
        this.reset();
    }

    reset() {
        this.state = this.glsl({FP:`1.0, exp(-400.0*dot(XY,XY))*hash(I.xyx).x, 0, 0`}, 
        {size:[256, 256], format:'rgba16f', filter:'linear', story:2, tag:'state'});
    }

    step() {
        this.glsl({FP:`
            vec2 v = Src(I).xy;
            vec2 ds = Src_step()*0.5;
            #define S(x,y) Src(UV+ds*vec2(x,y)).xy
            vec2 blur = (S(-1,-1)+S(1,-1)+S(-1,1)+S(1,1))/4.0;
            v = mix(v, blur, vec2(1.0, 0.5));
            float k=.05444,   f=.02259;
            float r = v.x*v.y*v.y;
            FOut.xy = v + vec2(-r+f*(1.0-v.x), r-(f+k)*v.y);
        `}, this.state);
    }

    frame(glsl, params) {
        const {state, twist} = this;
        for (let i=0; i<this.step_n; ++i) this.step();

        const bg = [0.05,0.1,0.2];
        glsl({Aspect: 'fit', DepthTest:1, Mesh:[200,400], Grid:[1],
            state: state[0], ...params, twist, bg, Clear:[...bg,1], VP:`
            float v = state(UV).y;
            varying vec3 color = mix(bg, vec3(1.0,0.75,0.1), sqrt(v)*1.8);
            float r = mix(0.1, 0.6, v);
            vec3 pos = vec3(0);
            pos.xz = rot2((UV.x+UV.y*twist + time*0.02)*TAU)[0]*r + vec2(0.6, 0);
            pos.yx *= rot2(UV.y*TAU);
            VPos = wld2proj(pos);
            `, FP:'color,1'
        })
    }
}
