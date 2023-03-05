/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

// Visualization of Particle Lenia fields as 3d landscape
class FancyLenia extends ParticleLenia {
    reset() {
        super.reset();
        this.trails = this.glsl(`0`, {size:[1024, 1024], format:'r8'});
    }

    step() {
        super.step();
        const {glsl, trails} = this;
        glsl({Blend:'d-s'}, `2./255.`, trails);
        this.renderSpots(trails, 0.2);
    }

    frame(glsl, cameraParams) {
        for (let i=0; i<this.step_n; ++i) {
            this.step();
        }
    
        const {params, viewR, state, trails} = this; 
        const fieldU = glsl({...params, viewR,
            state:state[0], Grid:state[0].size, Clear:0.0, Blend:'s+d'
        },`
        varying vec2 p;
        //VERT
        vec4 vertex() {
            p = (UV*2.0-1.0)*(mu_k+3.0*sigma_k);
            vec2 pos = state(ID).xy + p;
            return vec4(pos/viewR, 0, 1);
        }
        //FRAG
        void fragment() {
            out0 = peak_f(length(p), mu_k, sigma_k).xxxx*w_k;
        }`, {size:[256, 256], format:'rgba16f'});

        const viewParams = {viewR, ...cameraParams, scaleU: 0.25,
            DepthTest: 1, Aspect:'mean'};
        glsl({fieldU, trails, ...params, ...viewParams,
              Mesh:[100, 100]}, `
        vec4 vertex() {
          vec4 pos = vec4(XY, 0.0, 1.0);
          pos.z += fieldU(UV).x*scaleU;
          return wld2proj(pos);
        }
        //FRAG
        void fragment() {
          out0.a = 1.0;
          float U = fieldU(UV).x;
          if (U>0.1) {
              vec2 m = 20.0*mat2(1,0.5,0,sin(TAU/6.))*UV;
              float iso = isoline(m.x)+isoline(m.y)+isoline(m.x-m.y);
              iso += isoline(fieldU(UV).x*10.0);
              iso = min(iso/3.0, 0.5)*smoothstep(0.1, 0.5, U);
              out0.rgb += iso;
          }
          float G = peak_f(U, mu_g, sigma_g).x;
          out0.rgb = mix(out0.rgb, vec3(0.6, 0.8, 0.3), G);
          out0 = mix(out0, vec4(1), trails(UV).x);
        }
        `);

        glsl({state:state[0], Grid:state[0].size, Mesh: [32,8], fieldU,
              ...viewParams}, `
        varying vec3 normal;
        //VERT
        vec4 vertex() {
            vec4 pos = vec4(state(ID).xy, 0.0, 1.0);
            pos.xy /= viewR;
            pos.z = fieldU(pos.xy*0.5+0.5).x*scaleU;
            normal = uv2sphere(UV);
            pos.xyz += normal*0.015;
            return wld2proj(pos);
        }
        //FRAG
        void fragment() {
            float a = normal.z*0.7+0.3;
            out0 = vec4(vec3(1.0-a*a*0.75), 1.0);
        }`);
    }
}
