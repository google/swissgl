/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class DotCamera {
    constructor(glsl, gui) {
        this.video = document.createElement('video');
        navigator.mediaDevices.getUserMedia({ video: true })
          .then((stream) => {
            this.video.srcObject = stream;
            this.video.play();
          }).catch((error) => {
            console.log('Error accessing camera:', error);
          });
    }

    frame(glsl, {time, canvasSize}) {
        let tex;
        if (this.video.videoWidth == 0) {
            tex = glsl({time, 
                FP:`step(0.0, sin(length(XY)*20.0-time*3.0+atan(XY.x,XY.y)*3.))*0.25`},
                {size:[512, 512], tag:'tmp'});
        } else {
            tex = glsl({},
                {size:[this.video.videoWidth, this.video.videoHeight], data:this.video, tag:'video'});
        }
        const lum = glsl({tex:tex.edge.linear, MipGen:1, 
                VP:`vec2 r = vec2(ViewSize)/vec2(tex_size()); r /= max(r.x, r.y); VPos.xy = XY/r;`,
                FP:`dot(tex(1.0-UV).rgb, vec3(0.21,0.72,0.07))`}, {scale:1/2, format:'r8', tag:'lum'});
        const merged = glsl({T:lum.edge.miplinear, FP:`
            for (float lod=0.; lod<8.0; lod+=1.0) {FOut.x += textureLod(T, UV, lod).x;}
            FOut = vec4(FOut.x/8.0);
        `}, {size:lum.size, format:'r16f', tag:'merged'});
        const grad = glsl({T:merged.edge, FP:`
            vec2 s=T_step();
            float a=T(UV-s).r, b=T(UV+vec2(s.x,-s.y)).r, c=T(UV+vec2(-s.x,s.y)).r, d=T(UV+s).r;
            FOut = vec4(b+d-a-c, c+d-a-b, 0, 0);`
        }, {size:lum.size, format:'rgba16f', tag:'grad'});

        const arg = {canvasSize}, imgForce = grad;
        const field = glsl({}, {scale:1/4, format:'rgba16f', filter:'linear', tag:'field'});
        let points;
        for (let i=0; i<10; ++i) {
            points = glsl({...arg, field, imgForce:imgForce.edge.linear, seed: Math.random()*124237, FP: `
                vec4 p=Src(I), f=field(p.xy);
                if (p.w == 0.0) {
                    FOut = vec4(hash(ivec3(I, seed)).xy, 0.0, 1.0);
                    return;
                }
                if (f.z>2.5) {p.xy = hash(ivec3(I,seed)).xy;}
                vec2 force = f.xy*10.0 + imgForce(p.xy).xy*20.0;
                p.xy = clamp(p.xy + force/canvasSize, vec2(0), vec2(1));
                FOut = p;
            `}, {scale:1/8, story:2, format:'rgba32f', tag:'points'});

            glsl({...arg, points:points[0], Grid: points[0].size, Blend:'s+d', Clear:0, VP:`
                VPos.xy = (points(ID.xy).xy + XY*15.0/canvasSize)*2.0-1.0;
                `, FP:`vec3(XY,1.)*exp(-dot(XY,XY)*vec3(4,4,8)),0`},
                field)
        }
        // draw dots on screen
        glsl({...arg, points:points[0], Grid: points[0].size, Blend:'s+d', VP:`
        VPos.xy = (points(ID.xy).xy + XY*4.0/canvasSize)*2.0-1.0;
        `, FP:`exp(-dot(XY,XY)*3.0)`})
    }
}
