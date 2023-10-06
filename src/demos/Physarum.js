/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

// Inspired by https://cargocollective.com/sagejenson/physarum
class Physarum {
    static Tags = ['2d', 'simulation'];

    constructor(glsl, gui) {
        const U = this.U = {follow:false};
        const controllers = [];
        const par = (s, v, ...arg)=>{U[s]||=v;controllers.push(gui.add(U,s,...arg))};
        const presets = {
            worms: {senseFlip: false, senseAng:15, senseDist:10,moveAng:7,moveDist:1},
            mesh:{senseFlip:false, senseAng:45, senseDist:15, moveAng:17,moveDist:1},        
            flocks: {senseFlip: true, senseAng:40, senseDist:36,moveAng:7,moveDist:1},
            swirl:{senseFlip: true, senseAng:1.28, senseDist: 19, moveAng: 7, moveDist: 2},    
        };
        this.preset = 'worms';
        gui.add(this, 'preset', Object.keys(presets)).onChange(name=>{
            updateObject(U, presets[name]);
            controllers.forEach(c=>c.updateDisplay());
        });
        par('step_n',      1,    0, 20, 1);
        par('dt',          1,    0.3, 1.0);
        par('density',     1,    1, 4,  1);
        par('senseFlip',   false);
        par('senseAng',   40,    0, 180  );
        par('senseDist',  36,    1, 50   );
        par('moveAng',     7,    0, 180  );
        par('moveDist',    1,    0, 10   );
        par('zoom',        1,    1, 8);
        gui.add(U,'follow');
        updateObject(U, presets[this.preset]);
    }

    frame(glsl) {
        for (let i=0; i<this.U.step_n; ++i) {
            this.step(glsl);
        }
        const points = this.points[0];
        const common = {field:this.field[0], ...this.U, points, Inc:`
        vec2 wld2scr(vec2 p) {
            vec2 d = follow?points(ivec2(0)).xy : vec2(field_size())*0.5;
            return 2.0*zoom*(p-d.xy)/vec2(field_size()); //*rot2(d.z-PI/2.)
        }`};
        glsl({...common, VP:`
        varying vec2 uv = XY*2.;
        VPos.xy = wld2scr(uv*vec2(field_size()));`,
        FP:`field(uv).x`});

        glsl({...this.U, ...common, Grid: [1,1,4], Blend: 's+d*(1-sa)', VP:`
        vec4 p = points(ID.xy);
        varying vec4 color = ID.z==0 ? vec4(0,1,0,0.5):vec4(1,0,0,0.5); 
        if (ID.z>0) {p.xy += rot2(p.z+radians(senseAng)*float(ID.z-2))[0]*senseDist;}
        VPos.xy = wld2scr(p.xy+XY*10.0/zoom);`,
        FP:`smoothstep(1.0, 0.0, length(XY))*color`});
    }

    step(glsl) {
        const U=this.U, dt=U.dt;
        const field = this.field = glsl({dt, Inc:`
        float unpack(float x){return exp((x-1.0)*4.0);}
        float pack(float x){return log(x)/4.0+1.0;}`, FP:`
        vec2 dp = Src_step();
        float x=UV.x, y=UV.y;
        float l=x-dp.x, r=x+dp.x, u=y-dp.y, d=y+dp.y;
        #define S(x,y) unpack(Src(vec2(x,y)).r)
        float v0 = S(x,y);
        float v1 = 0.95*(v0+S(l,y)+S(r,y)+S(x,u)+S(x,d)+S(l,u)+S(r,u)+S(l,d)+S(r,d))/9.0;
        FOut.x = pack(clamp(mix(v0, v1, dt),1e-5,1.));
        `}, {story:2, format:'rgba8', filter:'linear', tag:'field'});

        const points = this.points = glsl({field:field[0], ...this.U, 
            rotAng:(1-U.senseFlip*2)*U.moveAng/180.0*Math.PI, FP:`
        FOut = Src(I);
        vec2 wldSize = vec2(field_size());
        if (FOut.w == 0.0 || FOut.x>=wldSize.x || FOut.y>=wldSize.y) {
            FOut = vec4(hash(ivec3(I, 123)), 1.0);
            FOut.xyz *= vec3(wldSize, TAU); 
            return;
        }
        vec2 dir = vec2(cos(FOut.z), sin(FOut.z));
        mat2 R = rot2(radians(senseAng));
        vec2 sense = senseDist*dir;
        #define F(p) field((FOut.xy+(p))/wldSize).x
        float c=F(sense), r=F(R*sense), l=F(sense*R);
        if (l>c && c>r) {
            FOut.z -= rotAng*dt;
        } else if (r>c && c>l) {
           FOut.z += rotAng*dt;
        } else if (c<=r && c<=l) {
           FOut.z += sign(hash(ivec3(FOut.xyz*5039.)).x-0.5)*rotAng*sqrt(dt);
        }
        FOut.xy += dir*moveDist*dt;
        FOut.xy = mod(FOut.xy, wldSize);
        `}, {scale:this.U.density/16, story:2, format:'rgba32f', tag:'points'});
        
        glsl({dt, points: points[0], Grid: points[0].size, Blend: 's+d', VP:`
        VPos.xy = 2.0 * (points(ID.xy).xy+XY*2.0)/vec2(ViewSize) - 1.0;`, FP:`
        smoothstep(1.0, 0.0, length(XY))*dt`}, field[0]);
    }
}
