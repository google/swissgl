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
        super.render(trails, 0.2);
    }

    render() {
        const {params, viewR, glsl, state, trails} = this; 
        const fieldU = glsl({...params, viewR,
            state:state[0], Grid:state[0].size, Clear:0.0, Blend:'s+d'
        },`
        varying vec2 p;
        //VERT
        vec4 vertex(vec2 uv) {
            p = (uv*2.0-1.0)*(mu_k+3.0*sigma_k);
            vec2 pos = state(ID).xy + p;
            return vec4(pos/viewR, 0, 1);
        }
        //FRAG
        void fragment() {
            out0 = peak_f(length(p), mu_k, sigma_k).xxxx*w_k;
        }`, {size:[256, 256], format:'rgba16f'});

        const viewParams = {viewR, scaleU: 0.25, cameraAngles:[0.0, 0.7],
            DepthTest: 1, Perspective: 0.5, Aspect:'fit'};
        const viewInc = `
        uniform vec2 cameraAngles;
        vec4 wld2view(vec4 pos) {
          pos.xyz *= 1.3;
          pos.xy *= rot2(cameraAngles.x);
          pos.yz *= rot2(cameraAngles.y);
          return pos;
        }`;
        
        glsl({fieldU, trails, ...params, ...viewParams,
              Mesh:[100, 100]}, viewInc+`
        varying vec2 uv;
        //VERT
        vec4 vertex(vec2 p) {
          vec4 pos = vec4(p*2.0-1.0, 0.0, 1.0);
          uv = 0.5*pos.xy+0.5;
          pos.z += fieldU(uv).x*scaleU;
          return wld2view(pos);
        }
        //FRAG
        float isoline(float v) {
          float distToInt = abs(v-round(v));
          return smoothstep(max(fwidth(v), 0.0001), 0.0, distToInt);
        }
        void fragment() {
          out0.a = 1.0;
          float U = fieldU(uv).x;
          if (U>0.1) {
              vec2 m = 20.0*mat2(1,0.5,0,sin(TAU/6.))*uv;
              float iso = isoline(m.x)+isoline(m.y)+isoline(m.x-m.y);
              iso += isoline(fieldU(uv).x*10.0);
              iso = min(iso/3.0, 0.5)*smoothstep(0.1, 0.5, U);
              out0.rgb += iso;
          }
          float G = peak_f(U, mu_g, sigma_g).x;
          out0.rgb = mix(out0.rgb, vec3(0.6, 0.8, 0.3), G);
          out0 = mix(out0, vec4(1), trails(uv).x);
        }
        `);

        glsl({state:state[0], Grid:state[0].size, Mesh: [32,8], fieldU,
              ...viewParams}, viewInc+`
        varying vec3 normal;
        //VERT
        vec4 vertex(vec2 uv) {
            vec4 pos = vec4(state(ID).xy, 0.0, 1.0);
            pos.xy /= viewR;
            pos.z = fieldU(pos.xy*0.5+0.5).x*scaleU;
            normal = uv2sphere(uv);
            pos.xyz += normal*0.015;
            return wld2view(pos);
        }
        //FRAG
        void fragment() {
            float a = normal.z*0.7+0.3;
            out0 = vec4(vec3(1.0-a*a*0.75), 1.0);
        }`);
    }
}
