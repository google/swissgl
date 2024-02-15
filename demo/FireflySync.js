/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */
// inspired by https://www.youtube.com/watch?v=d77GdblhvEo
class FireflySync {
    static Tags = ['2d', 'simulation'];
    constructor(glsl, gui) {
        this.glsl = glsl;
        this.step_n = 1;
        this.opt = {releaseTime: 0.5, flashRadius: 0.04};
        gui.add(this, 'step_n', 0, 50, 1);
        gui.add(this.opt, 'flashRadius', 0.01, 0.1, 0.01);
        gui.add(this.opt, 'releaseTime', 0.0, 1.0, 0.01);
        gui.add(this, 'reset');
        this.points = glsl({}, {size:[40,40], story:2,
                             format:'rgba32f', tag:'points'});
        this.field = null;
        this.reset();
    }

    reset() {
        this.glsl({seed:123, FP:`
            vec3 r = hash(ivec3(I, seed));
            // xy:[0..1]x[0..1], angle:[0..TAU], phase:[0..1]
            FOut = vec4(r.xy, r.z*TAU, fract(r.z*100.0));`},
            this.points);
    }

    step(touch, aspect) {
        const {points, opt} = this;
        const field = this.field = this.glsl({Clear:0, ...opt,
            aspect, points:points[0], Grid:points[0].size, Blend:'s+d', VP:`
            vec4 d = points(ID.xy);
            float flash = float(d.w==0.0);
            VPos.xy = d.xy*2.0-1.0 + flash*flashRadius*XY*aspect;`, 
            FP:`smoothstep(1.0, 0.9, length(XY))`},
        {size:[512, 512], warp:'edge', tag:'field'});

        this.glsl({touch, aspect, field, ...opt, FP:`
            vec4 d = Src(I);
            d.xy += rot2(d.z)[0]*aspect * 0.001;  // move forward
            vec3 rng = hash(ivec3(d.xyz*12345.0));
            if (d.x<=0.0 || d.y<=0.0 || d.x>=1.0 || d.y>=1.0) {
                d.z = rng.x*TAU;
                d.xy = clamp(d.xy, 0.0, 1.0);
            }
            d.z += rng.x-0.5;  // random steering
            float sense = field(d.xy).r * step(releaseTime, d.w);
            d.w = d.w+0.01 + sense*0.05;
            if (d.w>1.0) { d.w = 0.0;}
            if (touch.z>0.0 && length((touch.xy-d.xy)/aspect)<0.1) {
                d.w = rng.x;
            }
            FOut = d;
        `}, points);
    }

    frame(glsl, params) {
        const [w, h]=params.canvasSize, r=w+h, aspect=[r/w, r/h];
        let [x, y, press] = params.pointer;
        [x, y] = [x/w+0.5, y/h+0.5]
        const touch = [x,y,press];
        for (let i=0; i<this.step_n; ++i) {
            this.step(touch, aspect);
        }
        const {points, opt} = this;

        // draw perception radius
        glsl({aspect, points:points[0], ...opt, Blend:'s+d', VP:`
            VPos.xy = points(ID.xy).xy*2.0-1.0 + flashRadius*XY*aspect;`,FP:`
            float r = (length(XY)-0.95)*40.0;
            FOut=vec4(exp(-r*r)*0.5)`});

        // draw points
        glsl({aspect, points:points[0], Grid:points[0].size, Blend:'s+d', ...opt, VP:`
            vec4 d = points(ID.xy);
            float flash = exp(-d.w*d.w*400.0);
            varying vec3 color = mix(vec3(0.2,0.2,0.2), vec3(1,1,0.5), flash);
            float r = mix(0.005, 0.01, flash);
            VPos.xy = d.xy*2.0-1.0+r*XY*aspect;`, 
            FP:`color*smoothstep(1.0, 0.5, length(XY)),1.0`});
    }
}
