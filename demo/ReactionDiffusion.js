/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class ReactionDiffusion {
    static Tags = ['2d', 'simulation'];

    constructor(glsl, gui) {
        this.glsl = glsl;
        this.step_n = 1;
        gui.add(this, 'reset');
        gui.add(this, 'step_n', 0, 20, 1);
        this.reset();
    }

    reset() {
        this.state = this.glsl({FP:`1.0, exp(-400.0*dot(XY,XY))*hash(I.xyx).x, 0, 0`}, 
        {size:[256, 256], format:'rgba16f', filter:'linear', story:2, tag:'state'});
    }

    step() {
        this.glsl({FP:`
            vec2 v = Src(I).xy;
            {
                ivec2 D=Src_size();
                #define S(x,y) Src(ivec2(x,y)).xy            
                int x=I.x, y=I.y, l=(x-1+D.x)%D.x, r=(x+1)%D.x, u=(y-1+D.y)%D.y, d=(y+1)%D.y;
                vec2 blur = v/4.0 + (S(l,y)+S(r,y)+S(x,u)+S(x,d))/8.0 + (S(l,u)+S(r,u)+S(l,d)+S(r,d))/16.0;
                v = mix(v, blur, vec2(1.0, 0.5));
            }
            const float k=0.05684, f=0.02542;
            float r = v.x*v.y*v.y;
            FOut.xy = v + vec2(-r+f*(1.0-v.x), r-(f+k)*v.y);
            `}, this.state);
        
    }

    frame(glsl, params) {
        const {state} = this;
        for (let i=0; i<this.step_n; ++i) this.step();

        const [x, y, _] = params.pointer;
        const s = 2.0/Math.min(...params.canvasSize);
        const touchPos = [x*s, y*s];
        const Inc = `
        vec2 state2screen(vec2 v) {
            return vec2((1.0-v.x)*2.0,v.y*4.0+0.1)-1.0;
        }`;

        const hist = glsl({state:state[0], Grid: state[0].size, Blend:'s+d',
        Clear:0, Inc, VP:`
        vec2 v = state(ID.xy).xy;
        VPos.xy = state2screen(v) + XY*0.006;
        `, FP:`exp(-dot(XY,XY)*4.0)`},
        {size:[512, 512], format:'rgba16f',  filter:'linear', tag:'hist', wrap:'edge'});

        glsl({state:state[0], hist, Aspect:'fit', touchPos, Inc, FP:`
        vec2 v = state(UV).xy;
        FOut = vec4(sqrt(v.y));

        float h = sqrt(hist(UV).x);
        FOut.rgb = mix(FOut.rgb, h*vec3(1,0.3,0.05), min(h, 0.8));

        float r = length(state2screen(v)-touchPos)*20.0;
        float s = length(XY-touchPos)*20.0;
        FOut.g += exp(-r*r) + exp(-s*s);`})
    }
}
