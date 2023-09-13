/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

// Visualization of Particle Lenia fields as 3d landscape
class FancyLenia extends ParticleLenia {
    static Tags = ['3d', 'simulation'];

    constructor(glsl, gui) {
        super(glsl, gui);
        this.meanEnergy = 0.0;
        gui.add(this, 'meanEnergy', 0.0, 1.0, 0.001).listen();
    }

    reset() {
        super.reset();
        this.trails = this.glsl({Clear:0}, {size:[1024, 1024], format:'r8', filter:'linear', tag:'trails'});
    }

    step() {
        super.step();
        const {glsl, trails} = this;
        glsl({Blend:'d-s', FP:`2./255.`}, trails);
        this.renderSpots(trails, 0.2);
    }

    frame(_, cameraParams) {
        for (let i=0; i<this.step_n; ++i) {
            this.step();
        }

        const {params, viewR, state, trails, glsl} = this; 
        const fieldU = glsl({...params, viewR,
            state:state[0], Grid:state[0].size, Clear:0.0, Blend:'s+d', VP:`
        varying vec2 p = (UV*2.0-1.0)*(mu_k+3.0*sigma_k);
        VPos.xy = (state(ID.xy).xy + p)/viewR;`, FP:`
        peak_f(length(p), mu_k, sigma_k).x*w_k`}, 
        {size:[256, 256], format:'rgba16f', filter:'linear', tag:'fieldU'});

        const viewParams = {viewR, ...cameraParams, scaleU: 0.25,
            DepthTest: 1, Aspect:'mean'};
        glsl({fieldU, trails, ...params, ...viewParams,
              Mesh:[100, 100], VP:`
        float z = fieldU(UV).x*scaleU-0.25;
        VPos = wld2proj(vec4(XY, z, 1));`, FP:`
        float U = fieldU(UV).x;
        if (U>0.1) {
            vec2 m = 20.0*mat2(1,0.5,0,sin(TAU/6.))*UV;
            float iso = isoline(m.x)+isoline(m.y)+isoline(m.x-m.y);
            iso += isoline(fieldU(UV).x*10.0);
            iso = min(iso/3.0, 0.5)*smoothstep(0.1, 0.5, U);
            FOut.rgb += iso;
        }
        float G = peak_f(U, mu_g, sigma_g).x;
        FOut.rgb = mix(FOut.rgb, vec3(0.6, 0.8, 0.3), G);
        FOut = mix(FOut, vec4(1), trails(UV).x);`});

        glsl({state:state[0], Grid:state[0].size, Mesh: [32,8], fieldU, ...viewParams, VP:`
        vec4 pos = vec4(state(ID.xy).xy, 0.0, 1.0);
        pos.xy /= viewR;
        pos.z = fieldU(pos.xy*0.5+0.5).x*scaleU-0.25;
        varying vec3 normal = uv2sphere(UV);
        pos.xyz += normal*0.015;
        VPos = wld2proj(pos);`, FP:`
        float a = normal.z*0.7+0.3;
        FOut = vec4(vec3(1.0-a*a*0.75), 1.0);`});

        glsl({state:state[0], FP:`
        ivec2 sz = state_size();
        float E = 0.0;
        for (int y=0; y<sz.y; ++y)
        for (int x=0; x<sz.x; ++x) {
            E += state(ivec2(x,y)).w;
        }
        FOut.x = E / float(sz.x*sz.y);`},
        {size:[1,1], format:'r32f', tag:'meanE'}).read([],d=>this.meanEnergy=d[0]);
    }
}
