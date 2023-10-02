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
            this.glsl({K:this.K, seed:123, FP:`
                vec3 pos = (hash(ivec3(I, seed))-0.5)*10.0;
                float color = floor(UV.x*K);
                FOut = vec4(pos, color);`}, this.points);
        }
    }

    drawPoints(glsl, params, target) {
        const { K, points, worldExtent } = this;
        glsl({...params, K, worldExtent, DepthTest:1,
            points: points[0], Grid: points[0].size, VP:`
        vec4 d = points(ID.xy);
        varying vec3 color = cos((d.w/K+vec3(0,0.33,0.66))*TAU)*0.5+0.5;
        PointSize = 0.13/worldExtent;
        Normal = vec3(0,0,1);
        emitVertex(d.xyz/worldExtent*1.3);`, FP:`
        if (length(XY)>1.0) discard;
        emitFragment(color);`}, target);
    }

    frame(_, params) {
        this.step();

        const glsl = this.shadowmap.glsl;
        const shadowmap = glsl({Clear:0}, {size:[2048, 2048], format:'depth', tag:'shadowmap'});
        this.drawPoints(glsl, {...params, shadowPass:true}, shadowmap);
        params = {...params, shadowmap, shadowPass:false, Aspect:'fit'};
        this.drawPoints(glsl, params);

        const { points, worldExtent } = this;
        const [sx, sy] = points[0].size
        const portalmap = glsl({worldExtent, points: points[0], Grid: [sx, sy, 3],
            Clear:0, Blend:'max(s,d)', portalR:0.1, VP:`
            vec3 p = 2.0*points(ID.xy).xyz/worldExtent;
            vec3 proj = ID.z==0 ? p.xyz : (ID.z==1 ? p.yzx : p.zxy);
            vec2 v = clamp(proj.xy+XY*portalR,-1.0, 1.0);
            varying vec3 dp = vec3(v-proj.xy, 1.0-abs(proj.z))/portalR;
            VPos = vec4((v.x*0.5+0.5+float(ID.z))/3.0*2.0-1.0, v.y, 0,1);`, FP:`
            1.0-length(dp)`}, {size:[256*3, 256], filter:'linear', tag:'portalmap'});

        for (const face of ['back', 'front'])
        glsl({...params, portalmap, Grid:[6,1], Blend:'d*(1-sa)+s',
            portalColor: face=='back'?[0.5, 1.0, 1.5]:[1.5, 1.0, 0.5],
            Face:face, DepthTest:face=='front'?'keep':1, VP:`
        vec3 p = cubeVert(XY, ID.x)*0.5+0.5;
        Normal = -cubeVert(vec2(0), ID.x);
        varying vec3 portalPos = vec3(
            Normal.z!=0. ? p.xy : (Normal.x!=0. ? p.yz : p.zx),
            abs(Normal.x)+abs(Normal.y)*2.0);
        emitVertex((p-0.5)*1.3);`, FP:`
        if (!gl_FrontFacing) {
            vec2 c = XY; c*=c; c*=c;
            float ao = 1.0-(c.x+c.y)*0.4;
            if (Normal.z<-0.5) {  // ceiling
                float spot = smoothstep(0.995, 0.999, -dot(getLightDir(), getEyeDir()));
                FOut = vec4(clamp(vec3(0.9, 0.8, 0.7)*(0.5+ao*0.5)+spot, 0., 1.), 1);
            } else {
                emitFragment(vec3(ao));
            }
            float edge = sqrt(isoline(UV.x*4.0)+isoline(UV.y*4.0));
            FOut = mix(FOut, vec4(0,0,0,1), edge*0.1);
        }
        vec2 dp=portalmap_step()*0.5, p=clamp(portalPos.xy, dp,1.0-dp);
        p = (p+vec2(portalPos.z,0)) / vec2(3,1);
        float portal = portalmap(p).r;
        FOut = mix(FOut, vec4(portalColor, 1.0), portal);`});
    }
}