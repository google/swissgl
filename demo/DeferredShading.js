/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

class DeferredShading {
    static Tags = ['3d'];
    
    frame(glsl, params) {
        // draw objects
        const gbuf = glsl({...params, Mesh:[64,128], Grid:[5,5,3],
              Aspect:'fit', DepthTest:1, Clear:0, Inc:`
        varying vec3 normal, wldPos;`, VP:`
        vec3 surface_f(vec2 p) {
            vec2 c = sin(time+p*vec2(ID)*TAU);
            vec3 pos = torus(p, 1.0, 0.4 + 0.1*c.x + 0.15*c.y)/8.0;
            pos.xz *= rot2(float(ID.x+ID.y+ID.z));
            pos.xyz += (vec3(ID)-vec3(Grid-1)*0.5)*0.4;
            return pos;
        }
        void vertex() {
            wldPos = SURF(surface_f, UV, normal, 1e-3);
            VOut = wld2proj(wldPos);
        }`, FP:`
            FOut = vec4(0.7, 0.7, 0.7, 1.0);
            vec2 m = UV*vec2(Mesh)/4.0;
            FOut.rgb += (isoline(m.x)+isoline(m.y))*0.2; // color
            FOut1.xyz = normalize(normal);               // normal
            FOut2.xyz = wldPos;                          // wldPos
        `}, {format:'rgba16f+depth', tag:'gbuf', layern:3});

        // common lights passes code
        const lightArgs = {...params, Face:'front', Grid:[9, 9, 7],
            Aspect:'fit', Blend:'s+d', DepthTest:'keep', Inc:`
            varying vec3 lightPos, lightColor;`, VP:`
            void vertex() {
                lightPos = vec3(ID-Grid/2)*0.2;
                lightPos.xy *= rot2(time*0.1+lightPos.z);
                lightColor = hash(ID+1)*5.0;
                VOut = wld2proj(lightPos+uv2sphere(UV)*lightR);
            }`};

        // accumulate surface lights
        const light = glsl({...lightArgs, lightR:0.3, 
            Mesh:[32,64], Clear:0, gbuf, FP:`
        vec4 color  = gbuf(ivec3(I,0));
        if (color.a == 0.0) discard;
        vec3 normal = gbuf(ivec3(I,1)).xyz;
        vec3 wldPos = gbuf(ivec3(I,2)).xyz;
        vec3 lightDir = lightPos-wldPos;
        float r = length(lightDir)+1e-10;
        float diff = max(dot(normal, lightDir/r), 0.0);
        float att = color.a/(1.0+r*r*2e4);
        FOut = vec4(color.rgb*lightColor*att*diff, 1.0);
        `
        }, {format:'rgba16f', tag:'light', depth:gbuf.depth});
        
        // add light source points
        glsl({...lightArgs, lightR:0.005, Mesh:[16,8], FP:`lightColor*0.3,1`}, light);

        // render to screen
        glsl({light, FP:`sqrt(light(UV))`})
    }
}
