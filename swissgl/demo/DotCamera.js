/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class DotCamera {
    constructor(glsl, gui) {
        this.video = document.createElement('video');
        this.dayMode = false; gui.add(this, 'dayMode');
        this.rgbMode = false; gui.add(this, 'rgbMode');
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
        if (this.video.videoWidth) {
            tex = glsl({}, {data:this.video, tag:'video'});
        } else {
            tex = glsl({time, FP:`step(0.0, sin(length(XY)*20.0-time*3.0+atan(XY.x,XY.y)*3.))*0.25`},
                {size:[512, 512], tag:'tmp'});
        }
        const blendParams = this.dayMode ? {Clear:1, Blend:'d-s'} : {Clear:0, Blend:'d+s'};
        const rgbMode = this.rgbMode;
        const lum = glsl({tex:tex.edge.linear, ...blendParams, rgbMode,
            VP:`vec2 r = vec2(ViewSize)/vec2(tex_size()); r /= max(r.x, r.y); VPos.xy = XY/r;`, FP:`
            FOut = tex(1.0-UV);
            if (!rgbMode) {
                FOut.r = dot(FOut.rgb, vec3(0.21,0.72,0.07));
            }`},
            {scale:1/2, tag:'lum'});
        const merged = glsl({T:lum.edge.miplinear, FP:`
            for (float lod=0.; lod<8.0; lod+=1.0) {FOut += textureLod(T, UV, lod);}
            FOut /= 8.0;`}, {size:lum.size, format:'rgba16f', tag:'merged'});
        const imgForce = glsl({T:merged.edge, FP:`
            vec2 s=T_step();
            vec4 a=T(UV-s), b=T(UV+vec2(s.x,-s.y)), c=T(UV+vec2(-s.x,s.y)), d=T(UV+s);
            FOut  = b+d-a-c; FOut1 = c+d-a-b;`
        }, {size:lum.size, layern:2, format:'rgba16f', tag:'grad'});

        const arg = {canvasSize, rgbMode};
        const field = glsl({}, {scale:1/4, format:'rgba16f', layern:3, filter:'linear', tag:'field'});
        let points;
        for (let i=0; i<10; ++i) {
            points = glsl({...arg, field:field.edge, imgForce:imgForce.edge.linear, seed: Math.random()*124237, FP: `
                int c = rgbMode ? I.x%3 : 0;
                vec4 p=Src(I), f=field(p.xy, c);
                if (p.w == 0.0) {
                    FOut = vec4(hash(ivec3(I, seed)).xy, 0.0, 1.0);
                    return;
                }
                if (f.z>3.0) {p.xy = hash(ivec3(I,seed)).xy;}
                vec2 imf = vec2(imgForce(p.xy,0)[c], imgForce(p.xy,1)[c]);
                vec2 force = f.xy*10.0 + imf.xy*20.0;
                p.xy = clamp(p.xy + force/canvasSize, vec2(0), vec2(1));
                FOut = p;
            `}, {scale:(rgbMode?1.7:1)/8, story:2, format:'rgba32f', tag:'points'});
            glsl({...arg, points:points[0], Grid: points[0].size, Blend:'s+d', Clear:0, VP:`
                VPos.xy = (points(ID.xy).xy + XY*15.0/canvasSize)*2.0-1.0;
                int c = rgbMode ? ID.x%3 : 0;
                varying vec3 color = vec3(c==0,c==1,c==2);`,FP:`
                vec4 v = vec4(vec3(XY,1.)*exp(-dot(XY,XY)*vec3(4,4,8)), 0);
                FOut=v*color.r; FOut1=v*color.g; FOut2=v*color.b;`}, field)
        }
        // draw dots on screen
        glsl({...arg, points:points[0], Grid: points[0].size, ...blendParams, VP:` 
            VPos.xy = (points(ID.xy).xy + XY*4.0/canvasSize)*2.0-1.0;
            int c = ID.x%3;
            varying vec3 color = rgbMode ? vec3(c==0,c==1,c==2) : vec3(1);`,
            FP:`color*exp(-dot(XY,XY)*3.0),1`})
    }
}
