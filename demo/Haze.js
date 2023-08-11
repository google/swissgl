/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class Haze {
    constructor(glsl) {
        this.tmp = glsl({},{size:[2,2], tag:'tmp'}); // placeholder
        
        this.video = document.createElement('video');
        navigator.mediaDevices.getUserMedia({ video: true })
          .then((stream) => {
            this.video.srcObject = stream;
            this.video.play();
          }).catch((error) => {
            console.log('Error accessing camera:', error);
          });
        this.delay = 1;
        this.state = glsl({FP:`vec4(0.0)`}, {story:2, tag:'state'});
    }

    frame(glsl) {

        if(this.delay % 3 != 0){
            this.delay++;
            return;
        }
        this.delay = 1;
        
        let video;
        if (this.video.videoWidth == 0) {
            video = this.tmp;
        }else{
            video = glsl({}, {size:[this.video.videoWidth, this.video.videoHeight], data:this.video, tag:'video'});
        }

        let lum = glsl({video, FP:`dot(video(1.0-UV).rgb, vec3(0.21,0.72,0.07))`},
            {size:video.size, filter:'linear', wrap:'edge', tag:'lum'});
        
        glsl({lum:lum, seed:Math.random()*124237, FP:`
            void fragment(){
                vec4 src = Src(UV);
                float val = pow(lum(UV).r, 8.0) < hash(ivec3(I, seed)).x ? 0.0 : 1.0;
                FOut = src * 0.95 + vec4(val);
            }
        `}, this.state);
        glsl({tex:this.state[0], FP:`round(tex(UV))`});
    }
}