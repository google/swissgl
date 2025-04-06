/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class Wave2D {
    static Tags = ['3d', 'simulation'];

    constructor(glsl, gui) {
        this.glsl = glsl;
        this.step_n = 1;
        this.U = {
            dt:0.5,
            decay:0.001,
            sineGordon:0.0,
        };
        gui.add(this, 'reset');
        gui.add(this, 'step_n', 0, 20, 1);
        gui.add(this.U, 'dt', 0, 0.5);
        gui.add(this.U, 'decay', 0, 0.1, 0.0001);
        gui.add(this.U, 'sineGordon', 0, 3.0, 0.01);
        this.reset();
    }

    reset() {
        this.state = this.glsl({FP:`
            vec2 p = XY*32.;
            FOut.x = exp(-dot(p,p))*2.0;
        `}, {size:[256, 256], format:'rgba32f', wrap:'edge', story:2,tag:'grid'});
    }

    step() {
        this.glsl({...this.U, FP:`
            #define T(x,y) (Src(I+ivec2(x,y)).xy)
            vec2 v = T(0,0);
            vec2 lap = T(-1,0)+T(0,-1)+T(1,0)+T(0,1) - 4.0*v;
            v.y += (lap.x - sin(v.x)*sineGordon) * dt;
            v.y -= v.y*decay*dt;
            v.x += dt * v.y;
            FOut = vec4(v, lap);
        `}, this.state);
    }

    frame(glsl, params) {
        const [mouseX, mouseY, buttons] = params.pointer;
        if (buttons != 0) {
            const [w, h] = params.canvasSize;
            const dx = -(mouseX+w/2), dy = -(mouseY+h/2); 
            const pickData = glsl({...params, 
                View:[dx,dy,w,h], Aspect:'fit', Clear:0,
                VP:'wld2proj(vec3(XY,0))', FP:`UV,0,1`},
                {size:[1,1], format:'rgba32f', tag:'pickData'});
            glsl({pickData, Blend:'s*sa+d*(1-sa)', 
                FP:`
                vec4 pick = pickData(ivec2(0));
                vec2 dp = (pick.xy-UV)*128.0;
                float a = exp(-dot(dp,dp)) * pick.a;
                FOut = vec4(0,0.5*a,0,a);
            `}, this.state[0])
        }
        const {state} = this;
        for (let i=0; i<this.step_n; ++i) this.step();

        glsl({state:state[0].linear, Mesh:state.size, ...params,
        Aspect:'fit', DepthTest:1, VP:`
            vec4 v = state(UV);
            varying vec4 color = vec4(v.xy*4., 0, 1)+0.3;
            VPos.z = v.x;
            VPos = wld2proj(VPos.xyz);
        `, FP:`color + (isoline(UV.x*20.0) + isoline(UV.y*20.0))*0.2`});
    }
}
