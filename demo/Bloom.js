/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */
class Bloom {
    static Tags = ['3d', 'novr'];
    constructor(glsl, gui) {
        this.bloom = 2.0;
        this.gamma = 2.2;
        gui.add(this, 'bloom', 0.0, 10.0, 0.01);
        gui.add(this, 'gamma', 0.1, 3.0, 0.01);

        this.blurRadius = [ 3, 5, 7, 9, 11 ];
        this.blurKernel = this.blurRadius.map(r=>{
            const a = new Float32Array(12);
            a[0] = 1.0;
            let accum = a[0];
            for (let i=1; i<r; ++i) {
                a[i] = Math.exp(-5.0*i*i/r/r);
                accum += 2.0*a[i];
            }
            return a.map(x=>x/accum);
        });
    }

    frame(glsl, params) {
        const frame = glsl({...params, Grid:[40,6,6], 
            Aspect:'fit', DepthTest:1, Clear:0, VP:`
            vec3 p = cubeVert(XY,ID.z)*vec3(1.0,0.003,0.003);
            vec2 sz = vec2(Grid.xy-1);
            p.yz += (vec2(ID.xy)/sz*2.0 - 1.0)*vec2(1.0, 0.1);
            p.xy *= rot2(float(ID.y)*PI/2.0);
            VPos = wld2proj(p);
            vec3 rnd = hash(ivec3(ID.xyx+1));
            float e = max(0.0, sin(time*(1.0+rnd.z)*0.2+rnd.x*TAU)*40.0-39.0);
            vec3 c = rnd.g > 0.5 ? vec3(0.9, 0.5, 0.1) : vec3(0.11, 0.5, 0.9);
            c *= ID.z <= 1 ? 1.0 : 0.7;
            varying vec4 color = vec4(c*(e*0.75+0.25), e);

            `, FP:`color`},
            {tag:'frame', format:'rgba8+depth', msaa:4});
   
        
        let [w, h] = frame.size;
        const {DPR} = params;
        w /= DPR; h /= DPR;
        let inputTex = glsl({T:frame.linear, 
            FP:`vec4 c = T(UV); FOut = c*c.a;`}, 
            {size: [w, h], filter:'linear', wrap:'edge', tag:'lum'});
        
        const lodN = this.blurRadius.length, lods = {};
        for (let lod=0; lod<lodN; ++lod, w/=2, h/=2) {
            for (const dir of [[1,0],[0,1]]) {
                lods['L'+lod] = inputTex = glsl({T:inputTex, dir, 
                    R:this.blurRadius[lod], kernel:this.blurKernel[lod], FP:`
                    uniform float kernel[12];
                    uniform int R;
                    void fragment() {
                        FOut = T(UV)*kernel[0];
                        vec2 dp = dir/vec2(ViewSize), p=dp;
                        for (int i=1; i<R; i+=1, p+=dp) {
                            FOut += kernel[i] * (T(UV+p) + T(UV-p));
                        }
                    }`}, {size:[w, h], story:2, format:'rgb11f', 
                        filter:'linear', wrap:'edge', tag:`lod${lod}`})[0];
            }
        }
        const {bloom, gamma} = this;
        glsl({...lods, T:frame, bloom, gamma, FP:`
            vec4 acc = T(UV) + bloom*(L0(UV) + L1(UV) + L2(UV) + L3(UV) + L4(UV));
            FOut = pow(acc, vec4(1./gamma));
        `})
    }
}
