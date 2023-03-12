/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

// Inspired by the video https://youtu.be/p4YirERTVF0?t=480
class ParticleLife3D extends ParticleLife {
    constructor(glsl, gui) {
        super(glsl, gui);
        this.inertia = 0.4;
        new Shadowmap(glsl, gui);
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

    drawScene(glsl, params) {
        const shadowPass = !params.shadowmap;
        const target = shadowPass ? 
            glsl({Clear:0}, '', {size:[1024, 1024], format:'depth', tag:'shadowmap'}) : null;
        params = {...params, shadowPass, DepthTest:1};

        if (!shadowPass) {
            glsl({...params, Grid:[6,1], Aspect:'fit', Face:'back'}, `
            vec4 vertex() {
                Normal = -cubeVert(vec2(0), ID.x);
                return emitVertex(cubeVert(XY, ID.x)*0.5*1.3);
            }
            //FRAG
            void fragment() {
                float edge = isoline(UV.x*4.0)+isoline(UV.y*4.0);

                emitFragment(vec3(1.0-sqrt(edge)*0.4)*0.7);
            }`);
        }

        const { K, points, worldExtent } = this;
        glsl({...params,
            K, worldExtent,
            points: points[0],
            Grid: points[0].size,
            Aspect: 'fit'
        }, `
        varying vec3 color;
        //VERT
        vec4 vertex() {
            vec4 d = points(ID.xy);
            color = cos((d.w/K+vec3(0,0.33,0.66))*TAU)*0.5+0.5;
            PointSize = 0.13/worldExtent;
            Normal = lightDir;
            return emitVertex(d.xyz/worldExtent*1.3);
        }
        //FRAG
        void fragment() {
            if (length(XY)>1.0) discard;
            emitFragment(color);
        }`, target);
        return target;
    }

    frame(glsl, params) {
        this.step();
        const shadowmap = this.drawScene(glsl, params);
        this.drawScene(glsl, {...params, Aspect:'mean', shadowmap});
        //glsl({tex:shadowmap, View:[20, 20, 256, 256]}, `1.0-tex(UV).x`);
    }
}