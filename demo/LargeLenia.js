/** @license
 * Copyright 2023 Google LLC.
 * Copyright 2023 João Paquim
 * SPDX-License-Identifier: Apache-2.0
 */

import ParticleLenia from './ParticleLenia.js';

// Model description:
// https://google-research.github.io/self-organising-systems/particle-lenia/
// https://observablehq.com/@znah/particle-lenia-from-scratch
export default class LargeLenia extends ParticleLenia {
  static Tags = ['2d', 'simulation'];

  constructor(glsl, gui) {
    super(glsl, gui);
    const prevGlsl = this.glsl;
    this.glsl = (param, target) =>
      prevGlsl(
        {
          ...param,
          Inc: [
            `
#define FOR2(V,A,B) for(ivec2 V=ivec2(A);V.y<(B).y;++V.y) for(V.x=ivec2(A).x;V.x<(B).x;++V.x)
bool box_intersects(vec4 a, vec4 b) {return a.x<b.z && a.y<b.w && b.x<a.z && b.y<a.w;}`,
          ].concat(param.Inc || []),
        },
        target,
      );

    this.params = {
      ...this.params,
      dt: 0.3,
      mu_k: 1.5,
      sigma_k: 1.0,
      w_k: 0.0,
      mu_g: 1.0,
      sigma_g: 0.2,
      c_rep: 0.8,
    };
    this.updateNormCoef();
    this.viewR = 200.0;
    this.magnify = 0.0;
    this.reset();
  }

  reset() {
    const size = 256;
    this.state = this.glsl(
      {
        seed: Math.random() * 1234567,
        FP: `
vec3 r = hash(I.xyx);
FOut = vec4(r.xy*300.0-150.0,0,0);`,
      },
      { size: [size, size], story: 2, format: 'rgba32f', tag: 'state' },
    );
    this.sort_phase = 0;
    this.step_i = 0;
    for (let i = 0; i < size * 2; ++i) this.sortIndex();
  }

  sortIndex() {
    this.glsl(
      {
        rc: this.sort_phase & 1,
        eo: (this.sort_phase >> 1) & 1,
        FP: `
uniform int rc, eo;
void fragment() {
  ivec2 I = ivec2(gl_FragCoord.xy);
  int i0 = (rc==1)?I.x:I.y;
  int i1 = i0 + ((i0+eo)&1)*2-1;
  ivec2 I1 = (rc==1)?ivec2(i1, I.y):ivec2(I.x, i1);
  I1 = clamp(I1, ivec2(0), ViewSize-1);
  vec4 v0=Src(I), v1=Src(I1);
  bool less = (rc==1) ? v0.x<v1.x : v0.y<v1.y;
  FOut = (i0<i1 == less) ? v0:v1;
}`,
      },
      this.state,
    );
    this.sort_phase = (this.sort_phase + 1) % 4;
  }

  updateIndex() {
    this.sortIndex();
    const { state } = this;
    const bbox = (this.bbox = this.glsl(
      {
        S: state[0],
        FP: `
FOut = vec4(1000, 1000, -1000, -1000);
int D = S_size()[0]/ViewSize[0];
ivec2 base = I * D;
FOR2(i, 0, ivec2(D)) {
    vec2 p = S(base+i).xy;
    FOut.xy = min(FOut.xy, p);
    FOut.zw = max(FOut.zw, p);
}`,
      },
      { size: state[0].size, scale: 1 / 4, format: 'rgba32f', tag: 'bbox' },
    ));

    this.nhood = this.glsl(
      {
        bbox,
        ...this.params,
        FP: `
float r = mu_k+sigma_k*3.0;
vec4 query = bbox(I)+vec4(-r,-r,r,r);
FOut = vec4(I,I);
FOR2(i, 0, ViewSize) {
    if (box_intersects(bbox(i), query)) {
        vec2 fi = vec2(i);
        FOut.xy = min(FOut.xy, fi);
        FOut.zw = max(FOut.zw, fi);
    }
}`,
      },
      { size: bbox.size, format: 'rgba32f', tag: 'nhood' },
    );
  }

  step() {
    if (this.step_i++ % 8 == 0) this.updateIndex();
    const { bbox, nhood, state } = this;
    this.glsl(
      {
        ...this.params,
        bbox,
        nhood,
        FP: `
vec4 d = Src(I);
vec2 pos = d.xy, vel=d.zw;
vec2 R_grad=vec2(0), U_grad=vec2(0);
float U = peak_f(0.0, mu_k, sigma_k).x*w_k;
float rmax = mu_k+sigma_k*3.0;
vec4 querybox = vec4(pos-rmax, pos+rmax);
int D = ViewSize[0]/bbox_size()[0];
ivec4 nhoodBox = ivec4(nhood(I/D));
FOR2(i0, nhoodBox.xy, nhoodBox.zw+1) {
    if (!box_intersects(bbox(i0), querybox)) continue;
    FOR2(i, i0*D, (i0+1)*D) {
        if (i==I) continue;
        vec2 pos1 = Src(i).xy;
        vec2 dp = pos-pos1;
        float r = length(dp);
        dp /= max(r,1e-8);
        if (r<1.0) {
        R_grad -= dp*(1.0-r);
        }
        vec2 K = peak_f(r, mu_k, sigma_k)*w_k;
        U_grad += K.g*dp;
        U += K.x;
    }
}
vec2 G = peak_f(U, mu_g, sigma_g);
vel = vel*0.5-(R_grad*c_rep - G.g*U_grad);
pos += dt*vel*dt;
FOut = vec4(pos,vel);`,
      },
      state,
    );
  }

  frame(glsl, params) {
    const { viewR, state } = this;
    for (let i = 0; i < this.step_n; ++i) this.step();

    const [x, y, press] = params.pointer;
    const mag = (this.magnify = this.magnify * 0.8 + press * 0.2);
    const [w, h] = params.canvasSize;
    const c = (w + h) / 2;
    const aspect = [c / w, c / h];
    const vR = viewR + (20 - viewR) * mag;
    const center = [(mag * 2 * viewR * x) / c, (mag * 2 * viewR * y) / c];
    const viewParams = { viewR: vR, center, aspect };

    this.glsl({
      state: state[0],
      Grid: state[0].size,
      ...viewParams,
      ...this.params,
      Blend: `s+d`,
      VP: `
varying vec2 uv = XY*(mu_k+sigma_k*3.0);
VPos.xy=aspect*(state(ID.xy).xy + uv - center)/viewR;`,
      FP: `peak_f(length(uv), mu_k, sigma_k).x*w_k*vec4(0.2,0.4,0.3,1)`,
    });

    this.glsl({
      state: state[0],
      Grid: state[0].size,
      ...viewParams,
      pointR: 0.4,
      Blend: 'd*(1-sa)+s',
      VP: `
varying vec4 color = vec4(1.0);
VPos.xy=aspect*(state(ID.xy).xy + XY*pointR - center)/viewR;`,
      FP: `exp(-dot(XY,XY)*4.)*color`,
    });
  }
}
