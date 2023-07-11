/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class DotCamera {
    constructor(glsl, gui) {
        this.tmp = glsl({},{size:[1,1], tag:'tmp'}); // placeholder
        this.field = this.tmp;
        
        this.video = document.createElement('video');
        navigator.mediaDevices.getUserMedia({ video: true })
          .then((stream) => {
            this.video.srcObject = stream;
            this.video.play();
          }).catch((error) => {
            console.log('Error accessing camera:', error);
          });
    }

    calcForceField(glsl) {
        if (this.video.videoWidth == 0) {
            return this.tmp;
        }
        const filter = {filter:'linear', wrap:'edge'};
        const tex = glsl({}, {size:[this.video.videoWidth, this.video.videoHeight], data:this.video, tag:'video'});
        let lum = glsl({tex, FP:`dot(tex(1.0-UV).rgb, vec3(0.21,0.72,0.07))`},
            {size:tex.size, ...filter, tag:'lum'});
        const levels = {lum0:lum};
        for (let i=1; i<=6; ++i) {
            levels[`lum${i}`] = lum = glsl({T:lum, FP: `
                vec2 d = T_step()*0.8;
                FOut.r = 0.25 * (T(UV+d).r + T(UV-d).r + T(UV+vec2(d.x,-d.y)).r + T(UV+vec2(-d.x,d.y)).r);
                `}, {size:lum.size, scale:1/2, ...filter, tag:`lum${i}`});
        }
        const merged = glsl({...levels, FP:`
            sqrt((lum0(UV).r+lum1(UV).r+lum2(UV).r+lum3(UV).r+lum4(UV).r+lum5(UV).r+lum6(UV).r)/7.0)`},
            {size:tex.size, format:'r16f', ...filter, tag:'merged'});
        const grad = glsl({T:merged, FP:`
            vec2 s=T_step();
            float a=T(UV-s).r, b=T(UV+vec2(s.x,-s.y)).r, c=T(UV+vec2(-s.x,s.y)).r, d=T(UV+s).r;
            FOut = vec4(b+d-a-c, c+d-a-b, 0, 0);`},
            {size:tex.size, format:'rgba16f', ...filter, tag:'grad'});
        return grad;
    }

    frame(glsl, {canvasSize}) {
        const arg = {canvasSize};

        const imgForce = this.calcForceField(glsl);

        let points;
        for (let i=0; i<10; ++i) {
            points = glsl({...arg, field:this.field, imgForce, seed: Math.random()*124237, FP: `
                vec4 p=Src(I), f=field(p.xy);
                if (p.w == 0.0) {
                    FOut = vec4(hash(ivec3(I, seed)).xy, 0.0, 1.0);
                    return;
                }
                if (f.z>1.9) {p.xy += 0.2*(hash(ivec3(I,seed)).xy-0.5)/canvasSize;}
                vec2 force = f.xy*10.0 + imgForce(p.xy).xy*20.0;
                p.xy = clamp(p.xy + force/canvasSize, vec2(0), vec2(1));
                FOut = p;
            `}, {scale:1/8, story:2, format:'rgba32f', tag:'points'});

            this.field = glsl({...arg, points:points[0], Grid: points[0].size, Blend:'s+d', Clear:0, VP:`
                VPos.xy = (points(ID.xy).xy + XY*15.0/canvasSize)*2.0-1.0;
                `, FP:`vec3(XY,1.)*exp(-dot(XY,XY)*vec3(4,4,8)),0`},
                {scale:1/4, format:'rgba16f', filter:'linear', tag:'field'})
        }

        // draw dots on screen
        glsl({...arg, points:points[0], Grid: points[0].size, Blend:'s+d', VP:`
        VPos.xy = (points(ID.xy).xy + XY*4.0/canvasSize)*2.0-1.0;
        `, FP:`exp(-dot(XY,XY)*3.0)`})
    }
}
