/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

// Inspired by the video https://youtu.be/p4YirERTVF0?t=480
class ParticleLife3d extends ParticleLife {
    static Tags = ['3d', 'simulation', 'shadows'];
    
    constructor(glsl, gui) {
        super(glsl, gui);
        this.inertia = 0.4;
        this.shadowmap = new Shadowmap(glsl, gui);
    }

    reset() {
        for (let i=0; i<2; ++i) {
            this.glsl({K:this.K, seed:123}, `
                vec3 pos = (hash(ivec3(I, seed))-0.5)*10.0;
                float color = floor(UV.x*K);
                out0 = vec4(pos, color);`,
                this.points);
        }
    }

    drawScene(params) {
        const glsl = this.shadowmap.glsl;
        const shadowPass = !params.shadowmap;
        const target = shadowPass ? 
            glsl({Clear:0}, '', {size:[1024, 1024], format:'depth', tag:'shadowmap'}) : null;
        params = {...params, shadowPass, DepthTest:1};

        const { K, points, worldExtent } = this;
        glsl({...params, K, worldExtent,
            points: points[0], Grid: points[0].size,
        }, `
        varying vec3 color;
        //VERT
        vec4 vertex() {
            vec4 d = points(ID.xy);
            color = cos((d.w/K+vec3(0,0.33,0.66))*TAU)*0.5+0.5;
            PointSize = 0.13/worldExtent;
            Normal = vec3(0,0,1);
            return emitVertex(d.xyz/worldExtent*1.3);
        }
        //FRAG
        void fragment() {
            if (length(XY)>1.0) discard;
            emitFragment(color);
        }`, target);

        if (!shadowPass) {
            for (const face of ['back', 'front'])
            glsl({...params, Grid:[6,1], Blend:'d*(1-sa)+s',
                Face:face, DepthTest:face=='front'?'keep':1}, `
            varying vec3 portalPos;
            //VERT
            vec4 vertex() {
                vec3 p = cubeVert(XY, ID.x)*0.5+0.5;
                Normal = -cubeVert(vec2(0), ID.x);
                portalPos.xy = Normal.z!=0. ? p.xy : (Normal.x!=0. ? p.yz : p.zx);
                portalPos.z = abs(Normal.x)+abs(Normal.y)*2.0;
                return emitVertex((p-0.5)*1.3);
            }
            //FRAG
            void fragment() {
                if (!gl_FrontFacing) {
                    vec2 c = XY; c*=c; c*=c;
                    float ao = 1.0-(c.x+c.y)*0.4;
                    if (Normal.z<-0.5) {  // ceiling
                        float spot = smoothstep(0.995, 0.999, -dot(getLightDir(), getEyeDir()));
                        out0 = vec4(clamp(vec3(0.9, 0.8, 0.7)*(0.5+ao*0.5)+spot, 0., 1.), 1);
                    } else {
                        emitFragment(vec3(ao));
                    }
                    float edge = sqrt(isoline(UV.x*4.0)+isoline(UV.y*4.0));
                    out0 = mix(out0, vec4(0,0,0,1), edge*0.1);
                }
                vec2 dp=portalmap_step()*0.5, p=clamp(portalPos.xy, dp,1.0-dp);
                p = (p+vec2(portalPos.z,0)) / vec2(3,1);
                float portal = portalmap(p).r;
                out0 = mix(out0, vec4(0.5, 1.0, 1.5, 1.0), portal);
            }`);
        }
        return target;
    }

    frame(glsl, params) {
        this.step();
        const { points, worldExtent } = this;
        const [sx, sy] = points[0].size
        const portalmap = glsl({worldExtent, points: points[0], Grid: [sx, sy, 3],
            Clear:0, Blend:'max(s,d)', portalR:0.1}, `
            varying vec3 dp;
            //VERT
            vec4 vertex() {
                vec3 p = 2.0*points(ID.xy).xyz/worldExtent;
                vec3 proj = ID.z==0 ? p.xyz : (ID.z==1 ? p.yzx : p.zxy);
                vec2 v = clamp(proj.xy+XY*portalR,-1.0, 1.0);
                dp = vec3(v-proj.xy, 1.0-abs(proj.z))/portalR;
                return vec4((v.x*0.5+0.5+float(ID.z))/3.0*2.0-1.0, v.y, 0,1);
            }
            //FRAG
            void fragment() {out0 = vec4(1.0-length(dp));}`, {size:[256*3, 256]});
        const shadowmap = this.drawScene(params);
        this.drawScene({...params, Aspect:'fit', shadowmap, portalmap});
    }
}