// Copyright 2023 Google LLC
// Copyright 2023 João Paquim

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Repeat/Loop?
// fbo:
// - multiple named render targets (Out...?)
// - stencil?
// - mipmaps?
// data texture subimage?
// integer textures
// glsl lib
// - hash (overloads)
// - 3d prim/helpers
// - universal geom (mesh)
// devicePixelRatio
// depth test modes

// pain points:
// - view transform params
// - fragment only aspect
// - tag already exists
// - texture/array uniform compatibility

import glsl_main_frag from './main.frag';
import glsl_main_vert from './main.vert';
import glsl_template from './template.glsl';

export type Canvas = HTMLCanvasElement; // | OffscreenCanvas;

const GL = WebGL2RenderingContext;
export type GL = WebGL2RenderingContext & {
  _indexVA?: VA;
  _samplers?: Record<string, WebGLSampler>;
};

type S =
  | 'BOOL'
  | 'BOOL_VEC2'
  | 'BOOL_VEC3'
  | 'BOOL_VEC4'
  | 'INT'
  | 'INT_VEC2'
  | 'INT_VEC3'
  | 'INT_VEC4'
  | 'FLOAT'
  | 'FLOAT_VEC2'
  | 'FLOAT_VEC3'
  | 'FLOAT_VEC4'
  | 'FLOAT_MAT2'
  | 'FLOAT_MAT3'
  | 'FLOAT_MAT4';

export type CpuArray = Uint8Array | Uint16Array | Float32Array | Uint32Array;
export type CpuArrayConstructor =
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Float32ArrayConstructor
  | Uint32ArrayConstructor;

export type TextureFormat =
  | 'r8'
  | 'rgba8'
  | 'r16f'
  | 'rgba16f'
  | 'r32f'
  | 'rg32f'
  | 'rgba32f'
  | 'depth';

export type TextureFormatInfo = {
  internalFormat: GL[
    | 'R8'
    | 'RGBA8'
    | 'R16F'
    | 'RGBA16F'
    | 'R32F'
    | 'RG32F'
    | 'RGBA32F'
    | 'DEPTH_COMPONENT24'];
  glformat: GL['RED' | 'RGBA' | 'RG' | 'DEPTH_COMPONENT'];
  type: GL['UNSIGNED_BYTE' | 'HALF_FLOAT' | 'FLOAT' | 'UNSIGNED_INT'];
  CpuArray: CpuArrayConstructor;
  chn: 1 | 2 | 4;
};

const Type2Setter = {} as Record<GL[S], string>;
const UniformType2TexTarget = {} as {
  [GL.SAMPLER_2D]: GL['TEXTURE_2D'];
  [GL.SAMPLER_2D_ARRAY]: GL['TEXTURE_2D_ARRAY'];
};
const TextureFormats = {} as Record<TextureFormat, TextureFormatInfo>;
{
  for (const t of ['FLOAT', 'INT', 'BOOL'] as const) {
    const suf = t == 'FLOAT' ? 'f' : 'i';
    Type2Setter[GL[t]] = 'uniform1' + suf;
    for (const i of [2, 3, 4] as const) {
      Type2Setter[GL[`${t}_VEC${i}`]] = `uniform${i}${suf}v`;
      if (suf == 'f') {
        Type2Setter[GL[`${t}_MAT${i}` as S]] = `uniformMatrix${i}fv`;
      }
    }
  }
  UniformType2TexTarget[GL.SAMPLER_2D] = GL.TEXTURE_2D;
  UniformType2TexTarget[GL.SAMPLER_2D_ARRAY] = GL.TEXTURE_2D_ARRAY;

  for (const [name, internalFormat, glformat, type, CpuArray, chn] of [
    ['r8', GL.R8, GL.RED, GL.UNSIGNED_BYTE, Uint8Array, 1],
    ['rgba8', GL.RGBA8, GL.RGBA, GL.UNSIGNED_BYTE, Uint8Array, 4],
    ['r16f', GL.R16F, GL.RED, GL.HALF_FLOAT, Uint16Array, 1],
    ['rgba16f', GL.RGBA16F, GL.RGBA, GL.HALF_FLOAT, Uint16Array, 4],
    ['r32f', GL.R32F, GL.RED, GL.FLOAT, Float32Array, 1],
    ['rg32f', GL.RG32F, GL.RG, GL.FLOAT, Float32Array, 2],
    ['rgba32f', GL.RGBA32F, GL.RGBA, GL.FLOAT, Float32Array, 4],
    ['depth', GL.DEPTH_COMPONENT24, GL.DEPTH_COMPONENT, GL.UNSIGNED_INT, Uint32Array, 1],
  ] as const)
    TextureFormats[name] = { internalFormat, glformat, type, CpuArray, chn };
}

function memoize<T>(f: (k: string) => T) {
  const cache: Record<string, T> = {};
  const wrap = (k: string) => (k in cache ? cache[k] : (cache[k] = f(k)));
  wrap.cache = cache;
  return wrap;
}

export function updateObject<T extends {}, U>(o: T, updates: U): T & U {
  for (const s in updates) {
    // @ts-expect-error TODO: fix this
    o[s] = updates[s];
  }
  return o as T & U;
}

export type Blend = { s: number; d: number; f: number };

// Parse strings like 'min(s,d)', 'max(s,d)', 's*d', 's+d*(1-sa)',
// 's*d', 'd*(1-sa) + s*sa', s-d', 'd-s' and so on into
// gl.blendFunc/gl.blendEquation arguments.
function parseBlendImpl(s0?: string): Blend | null | undefined {
  if (!s0) return;
  let s = s0.replace(/\s+/g, '');
  if (!s) return null;
  const func2gl = {
    min: GL.MIN,
    max: GL.MAX,
    '+': GL.FUNC_ADD,
    's-d': GL.FUNC_SUBTRACT,
    'd-s': GL.FUNC_REVERSE_SUBTRACT,
  };
  const factor2gl = {
    0: GL.ZERO,
    1: GL.ONE,
    s: GL.SRC_COLOR,
    '(1-s)': GL.ONE_MINUS_SRC_COLOR,
    d: GL.DST_COLOR,
    '(1-d)': GL.ONE_MINUS_DST_COLOR,
    sa: GL.SRC_ALPHA,
    '(1-sa)': GL.ONE_MINUS_SRC_ALPHA,
    da: GL.DST_ALPHA,
    '(1-da)': GL.ONE_MINUS_DST_ALPHA,
    c: GL.CONSTANT_COLOR,
    '(1-c)': GL.ONE_MINUS_CONSTANT_COLOR,
    ca: GL.CONSTANT_ALPHA,
    '(1-ca)': GL.ONE_MINUS_CONSTANT_ALPHA,
  };
  const res = { s: GL.ZERO, d: GL.ZERO } as Blend;
  s = s.replace(/(s|d)(?:\*(\w+|\(1-\w+\)))?/g, (_, term, factor) => {
    factor = factor || '1';
    if (!(factor in factor2gl)) {
      throw `Unknown blend factor: "${factor}"`;
    }
    res[term as keyof Blend] = factor2gl[factor as keyof typeof factor2gl];
    return term;
  });
  let m;
  if ((m = s.match(/^(min|max)\((s,d|d,s)\)$/))) {
    res.f = func2gl[m[1] as keyof typeof func2gl];
  } else if (s.match(/^(s|d|s\+d|d\+s)$/)) {
    res.f = func2gl['+'];
  } else if (s in func2gl) {
    res.f = func2gl[s as keyof typeof func2gl];
  } else {
    throw `Unable to parse blend spec: "${s0}"`;
  }
  return res;
}
const parseBlend = memoize(parseBlendImpl);

function compileShader(gl: GL, code: string, type: number, program: WebGLProgram) {
  code =
    `#version 300 es
precision highp float;
precision highp int;
precision lowp sampler2DArray;` + code;
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, code);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const withLines = code
      .split('\n')
      .map((s, i) => `${(i + 1 + '').padStart(4)}: ${s}`)
      .join('\n');
    throw withLines + '\n' + '--- GLSL COMPILE ERROR ---\n' + gl.getShaderInfoLog(shader);
  }
  gl.attachShader(program, shader);
  gl.deleteShader(shader);
}

export type Program = WebGLProgram & { setters: Record<string, (arg: any) => void> };

function compileProgram(gl: GL, vs: string, fs: string): Program {
  const program = gl.createProgram() as Program;
  compileShader(gl, vs, gl.VERTEX_SHADER, program);
  compileShader(gl, fs, gl.FRAGMENT_SHADER, program);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('shader link error:' + gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);
  program.setters = {};
  let unitCount = 0;
  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < numUniforms; ++i) {
    const info = gl.getActiveUniform(program, i)!;
    const loc = gl.getUniformLocation(program, info.name);
    const name = info.name.match(/^\w+/)![0];
    if (info.type in UniformType2TexTarget) {
      const unit = unitCount++;
      const target = UniformType2TexTarget[info.type as keyof typeof UniformType2TexTarget];
      gl.uniform1i(loc, unit);
      program.setters[name] = tex => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        tex ? tex.bindSampler(unit) : gl.bindTexture(target, null);
      };
    } else {
      const fname = Type2Setter[info.type as keyof typeof Type2Setter];
      const setter = fname.startsWith('uniformMatrix')
        ? (v: Iterable<number>) =>
            gl[fname as 'uniformMatrix2fv' | 'uniformMatrix3fv' | 'uniformMatrix4fv'](loc, false, v)
        : (v: number & Iterable<number>) => gl[fname as 'uniform1f' | 'uniform1i'](loc, v);
      program.setters[name] = v => (v != undefined ? setter(v) : null);
    }
  }
  gl.useProgram(null);
  console.log('created', program);
  return program;
}

function guessUniforms(params: Record<string, any>): string {
  const uni = [];
  const len2type = { 1: 'float', 2: 'vec2', 3: 'vec3', 4: 'vec4', 9: 'mat3', 16: 'mat4' };
  for (const name in params) {
    const v = params[name];
    let s = null;
    if (v instanceof TextureSampler) {
      const [type, D] = v.layern ? ['sampler2DArray', '3'] : ['sampler2D', '2'];
      const lookupMacro = v.layern
        ? `#define ${name}(p,l) (_sample(${name}, (p), (l)))`
        : `#define ${name}(p) (_sample(${name}, (p)))`;
      s = `uniform ${type} ${name};
            ${lookupMacro}
            ivec${D} ${name}_size() {return textureSize(${name}, 0);}
            vec${D}  ${name}_step() {return 1.0/vec${D}(${name}_size());}`;
    } else if (typeof v === 'number') {
      s = `uniform float ${name};`;
    } else if (typeof v === 'boolean') {
      s = `uniform bool ${name};`;
    } else if (v.length in len2type) {
      s = `uniform ${len2type[v.length as keyof typeof len2type]} ${name};`;
    }
    if (s) uni.push(s);
  }
  return uni.join('\n') + '\n';
}

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

// TODO better parser (use '\b')
function definedUniforms(code: string): Set<string> {
  code = stripComments(code);
  const lines = Array.from(code.matchAll(/uniform\s+\w+\s+([^;]+)\s*;/g));
  return new Set(lines.map(m => m[1].split(/[^\w]+/)).flat());
}

function expandCode(code: string, mainFunc: string, outVar: string): string {
  const stripped = stripComments(code).trim();
  if (stripped != '' && stripped.indexOf(';') == -1) {
    code = `${outVar} = vec4(${stripped});`;
  }
  if (!stripped.match(new RegExp(`\\b${mainFunc}\s*\\(`))) {
    code = `void ${mainFunc}() {
          ${code};
        }`;
  }
  return code;
}
const expandVP = memoize(code => expandCode(code, 'vertex', 'VPos'));
const expandFP = memoize(code => expandCode(code, 'fragment', 'FOut'));

function extractVaryings(VP: string): string {
  return Array.from(stripComments(VP).matchAll(/\bvarying\s+[^;]+;/g))
    .map(m => m[0])
    .map(s => {
      while (s != (s = s.replace(/\([^()]*\)/g, ''))); // remove nested ()
      return s.replace(/=[^,;]*/g, ''); // remove assigned values
    })
    .join('\n');
}

function stripVaryings(VP: string): string {
  return VP.replace(/\bvarying\s+\w+/g, '');
}

function linkShader(
  gl: GL,
  uniforms: Record<string, any>,
  Inc: string[],
  VP: string,
  FP: string,
): Program {
  // @ts-expect-error TODO: fix this
  Inc = Inc.join('\n');
  const defined = definedUniforms([glsl_template, Inc, VP, FP].join('\n'));
  const undefined = Object.entries(uniforms)
    .filter(kv => kv[0].match(/^\w+$/))
    .filter(kv => !defined.has(kv[0]));
  const guessed = guessUniforms(Object.fromEntries(undefined));
  const varyings = extractVaryings(VP);
  VP = expandVP(stripVaryings(VP));
  const prefix = `${glsl_template}\n${guessed}\n${varyings}\n${Inc}\n`;
  return compileProgram(
    gl,
    `
#define VERT
#define varying out
#define VPos gl_Position
layout(location = 0) in int VertexID;
layout(location = 1) in int InstanceID;
ivec2 VID;
ivec3 ID;
${prefix}
${VP}
${glsl_main_vert}`,
    `
#define FRAG
#define varying in
layout(location = 0) out vec4 FOut;
layout(location = 1) out vec4 FOut1;
layout(location = 2) out vec4 FOut2;
layout(location = 3) out vec4 FOut3;
layout(location = 4) out vec4 FOut4;
layout(location = 5) out vec4 FOut5;
layout(location = 6) out vec4 FOut6;
layout(location = 7) out vec4 FOut7;
ivec2 I;
${prefix}
${expandFP(FP)}
${glsl_main_frag}`,
  );
}

export type Filter = 'linear' | 'nearest' | 'miplinear';
export type Wrap = 'edge' | 'repeat' | 'mirror';

type TextureSamplerState = {
  handle?: WebGLTexture & { hasMipmap?: boolean };
  gltarget?: number;
  layern?: number | null;
  filter?: Filter;
  wrap?: Wrap;
};

export class TextureSampler implements TextureSamplerState {
  gl!: GL;
  handle!: WebGLTexture & { hasMipmap?: boolean };
  gltarget!: number;
  layern!: number | null;
  filter!: Filter;
  wrap!: Wrap;

  fork(updates: Partial<TextureSamplerState>) {
    const { gl, handle, gltarget, layern, filter, wrap } = { ...this, ...updates };
    return updateObject(new TextureSampler(), { gl, handle, gltarget, layern, filter, wrap });
  }
  get linear() {
    return this.fork({ filter: 'linear' });
  }
  get nearest() {
    return this.fork({ filter: 'nearest' });
  }
  get miplinear() {
    return this.fork({ filter: 'miplinear' });
  }
  get edge() {
    return this.fork({ wrap: 'edge' });
  }
  get repeat() {
    return this.fork({ wrap: 'repeat' });
  }
  get mirror() {
    return this.fork({ wrap: 'mirror' });
  }

  get _sampler() {
    const { gl, filter, wrap } = this;
    if (!gl._samplers) {
      gl._samplers = {};
    }
    const id = `${filter}:${wrap}`;
    if (!(id in gl._samplers)) {
      const glfilter = {
        nearest: gl.NEAREST,
        linear: gl.LINEAR,
        miplinear: gl.LINEAR_MIPMAP_LINEAR,
      }[filter];
      const glwrap = { repeat: gl.REPEAT, edge: gl.CLAMP_TO_EDGE, mirror: gl.MIRRORED_REPEAT }[
        wrap
      ];
      const sampler = gl.createSampler()!;
      type PName =
        | 'COMPARE_FUNC'
        | 'COMPARE_MODE'
        | 'MAG_FILTER'
        | 'MAX_LOD'
        | 'MIN_FILTER'
        | 'MIN_LOD'
        | 'WRAP_R'
        | 'WRAP_S'
        | 'WRAP_T';
      const setf = (k: PName, v: number) => gl.samplerParameteri(sampler, gl[`TEXTURE_${k}`], v);
      setf('MIN_FILTER', glfilter);
      setf('MAG_FILTER', filter == 'miplinear' ? gl.LINEAR : glfilter);
      setf('WRAP_S', glwrap);
      setf('WRAP_T', glwrap);
      gl._samplers[id] = sampler;
    }
    return gl._samplers[id];
  }
  bindSampler(unit: number) {
    // assume unit is already active
    const { gl, gltarget, handle } = this;
    gl.bindTexture(gltarget, handle);
    if (this.filter == 'miplinear' && !handle.hasMipmap) {
      gl.generateMipmap(gltarget);
      handle.hasMipmap = true;
    }
    gl.bindSampler(unit, this._sampler);
  }
}

export type GpuBuf = WebGLBuffer & { length?: number };

export type TargetParams = {
  size: [number, number];
  tag: string;
  format?: TextureFormat;
  filter?: Filter;
  wrap?: Wrap;
  layern?: number | null;
  data?: ArrayBufferView | null;
  depth?: TextureTarget | null;
};

export class TextureTarget extends TextureSampler {
  size!: [number, number];
  _tag!: string;
  format!: string;
  formatInfo: TextureFormatInfo;
  depth!: TextureTarget | null;
  fbo?: WebGLFramebuffer;
  cpu?: CpuArray;
  async?: { all: Set<GpuBuf>; queue: GpuBuf[] };

  constructor(gl: GL, params: TargetParams) {
    super();
    let {
      size,
      tag,
      format = 'rgba8',
      filter = 'nearest',
      wrap = 'repeat',
      layern = null,
      data = null,
      depth = null,
    } = params;
    if (!depth && format.includes('+')) {
      const [mainFormat, depthFormat] = format.split('+');
      format = mainFormat as TextureFormat;
      depth = new TextureTarget(gl, {
        ...params,
        tag: tag + '_depth',
        format: depthFormat as TextureFormat,
        layern: null,
        depth: null,
      });
    }
    this.handle = gl.createTexture()!;
    this.filter = format == 'depth' ? 'nearest' : filter;
    this.gltarget = layern ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
    this.formatInfo = TextureFormats[format];
    updateObject(this, { gl, _tag: tag, format, layern, wrap, depth });
    this.update(size, data);
  }
  update(size: [number, number], data: ArrayBufferView | null) {
    const { gl, handle, gltarget, layern } = this;
    const { internalFormat, glformat, type } = this.formatInfo;
    const [w, h] = size;
    gl.bindTexture(gltarget, handle);
    if (!layern) {
      gl.texImage2D(
        gltarget,
        0 /*mip level*/,
        internalFormat,
        w,
        h,
        0 /*border*/,
        glformat,
        type,
        data /*data*/,
      );
    } else {
      gl.texImage3D(
        gltarget,
        0 /*mip level*/,
        internalFormat,
        w,
        h,
        layern,
        0 /*border*/,
        glformat,
        type,
        data /*data*/,
      );
    }
    gl.bindTexture(gltarget, null);
    this.size = size;
    if (this.depth) {
      this.depth.update(size, data);
    }
  }
  attach(gl: GL) {
    if (!this.layern) {
      const attachment = this.format == 'depth' ? gl.DEPTH_ATTACHMENT : gl.COLOR_ATTACHMENT0;
      gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, this.handle, 0 /*level*/);
    } else {
      const drawBuffers = [];
      for (let i = 0; i < this.layern; ++i) {
        const attachment = gl.COLOR_ATTACHMENT0 + i;
        drawBuffers.push(attachment);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, attachment, this.handle, 0 /*level*/, i);
      }
      gl.drawBuffers(drawBuffers);
    }
  }
  bindTarget(gl: GL, readonly = false) {
    if (this.fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    } else {
      this.fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      this.attach(gl);
      if (this.depth) this.depth.attach(gl);
    }
    if (!readonly) {
      this.handle.hasMipmap = false;
    }
    return this.size;
  }
  _getBox(box?: [number, number, number, number] | []): {
    box: [number, number, number, number];
    n: number;
  } {
    box = box && box.length ? box : [0, 0, ...this.size];
    const [_x, _y, w, h] = box,
      n = w * h * this.formatInfo.chn;
    return { box, n };
  }
  _getCPUBuf(n: number): CpuArray {
    if (!this.cpu || this.cpu.length < n) {
      this.cpu = new this.formatInfo.CpuArray(n);
    }
    return this.cpu.length == n ? this.cpu : this.cpu.subarray(0, n);
  }
  _readPixels(box: [number, number, number, number], targetBuf: CpuArray | GLuint) {
    const { glformat, type } = this.formatInfo;
    this.bindTarget(this.gl, /*readonly*/ true);
    this.gl.readPixels(...box, glformat, type, targetBuf as GLuint);
  }
  readSync(...optBox: [number, number, number, number] | []): CpuArray {
    const { box, n } = this._getBox(optBox);
    const buf = this._getCPUBuf(n);
    this._readPixels(box, buf);
    return buf;
  }
  _bindAsyncBuffer(n: number): GpuBuf {
    const { gl } = this;
    // const { CpuArray } = this.formatInfo;
    if (!this.async) {
      this.async = { all: new Set(), queue: [] };
    }
    if (this.async.queue.length == 0) {
      const gpuBuf = gl.createBuffer()!;
      this.async.queue.push(gpuBuf);
      this.async.all.add(gpuBuf);
    }
    const gpuBuf = this.async.queue.shift()!;
    if (this.async.queue.length > 6) {
      this._deleteAsyncBuf(this.async.queue.pop()!);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, gpuBuf);
    if (!gpuBuf.length || gpuBuf.length < n) {
      const byteN = n * this.formatInfo.CpuArray.BYTES_PER_ELEMENT;
      gl.bufferData(gl.PIXEL_PACK_BUFFER, byteN, gl.STREAM_READ);
      gpuBuf.length = n;
      console.log(`created/resized async gpu buffer "${this._tag}":`, gpuBuf);
    }
    return gpuBuf;
  }
  _deleteAsyncBuf(gpuBuf: GpuBuf) {
    delete gpuBuf.length;
    this.gl.deleteBuffer(gpuBuf);
    this.async!.all.delete(gpuBuf);
  }
  // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_non-blocking_async_data_readback
  read(
    callback: (target: CpuArray) => void,
    optBox?: [number, number, number, number] | [],
    optTarget?: CpuArray,
  ) {
    const { gl } = this;
    const { box, n } = this._getBox(optBox);
    const gpuBuf = this._bindAsyncBuffer(n);
    this._readPixels(box, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    this._asyncFetch(gpuBuf, sync, callback, optTarget);
  }
  _asyncFetch(
    gpuBuf: GpuBuf,
    sync: WebGLSync,
    callback: (target: CpuArray) => void,
    optTarget?: CpuArray,
  ) {
    const { gl } = this;
    if (!gpuBuf.length) {
      // check that gpu buffer is not deleted
      gl.deleteSync(sync);
      return;
    }
    const res = gl.clientWaitSync(sync, 0, 0);
    if (res === gl.TIMEOUT_EXPIRED) {
      setTimeout(() => this._asyncFetch(gpuBuf, sync, callback, optTarget), 1 /*ms*/);
      return;
    }
    if (res === gl.WAIT_FAILED) {
      console.log(`async read of ${this._tag} failed`);
    } else {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, gpuBuf);
      const target = optTarget || this._getCPUBuf(gpuBuf.length);
      gl.getBufferSubData(
        gl.PIXEL_PACK_BUFFER,
        0 /*srcOffset*/,
        target,
        0 /*dstOffset*/,
        gpuBuf.length /*length*/,
      );
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      callback(target);
    }
    gl.deleteSync(sync);
    this.async!.queue.push(gpuBuf);
  }
  free() {
    const gl = this.gl;
    if (this.depth) this.depth.free();
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.async) this.async.all.forEach(buf => this._deleteAsyncBuf(buf));
    gl.deleteTexture(this.handle);
  }
}

export type Aspect = 'fit' | 'cover' | 'mean' | 'x' | 'y';

function calcAspect(aspect: Aspect | null | undefined, w: number, h: number): [number, number] {
  if (!aspect) return [1, 1];
  let c;
  switch (aspect) {
    case 'fit':
      c = Math.min(w, h);
      break;
    case 'cover':
      c = Math.max(w, h);
      break;
    case 'x':
      c = w;
      break;
    case 'y':
      c = h;
      break;
    case 'mean':
      c = (w + h) / 2;
      break;
    default:
      throw `Unknown aspect mode "${aspect}"`;
  }
  return [c / w, c / h];
}

export type VA = WebGLVertexArrayObject & { size: number; buf?: WebGLBuffer };

function ensureVertexArray(gl: GL, neededSize: number) {
  // gl_VertexID / gl_InstanceID seem to be broken in some configurations
  // (e.g. https://crbug.com/1315104), so I had to fallback to using arrays
  if (gl._indexVA && neededSize <= gl._indexVA.size) return;
  const size = neededSize * 2;

  const va = gl._indexVA || (gl.createVertexArray() as VA);
  va.size = size;
  gl._indexVA = va;
  gl.bindVertexArray(va);

  const arr = new Int32Array(size);
  arr.forEach((_v, i) => {
    arr[i] = i;
  });

  const buf = va.buf || gl.createBuffer()!;
  va.buf = buf;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);

  for (let loc = 0; loc < 2; ++loc) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribIPointer(
      loc,
      1 /*size*/,
      gl.INT,
      // false /*normalize*/,
      0 /*stride*/,
      0 /*offset*/,
    );
  }
  gl.vertexAttribDivisor(1, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindVertexArray(null);

  console.log('created:', va);
}

function getTargetSize(
  gl: GL,
  {
    size,
    scale = 1,
    data,
  }: {
    size?: [number, number];
    scale?: number;
    data?: Target | null;
  },
): [number, number] {
  // if (!size && data && 'videoWidth' in data && 'videoHeight' in data) {
  if (!size && data instanceof HTMLVideoElement) {
    size = [data.videoWidth, data.videoHeight];
  }
  size = size || [gl.canvas.width, gl.canvas.height];
  return [Math.ceil(size[0] * scale), Math.ceil(size[1] * scale)];
}

export type TargetResult = TextureTarget | TextureTarget[];

function createTarget(gl: GL, params: TargetParams & { story?: number }): TargetResult {
  if (!params.story) return new TextureTarget(gl, params);
  return Array(params.story)
    .fill(0)
    .map(_ => new TextureTarget(gl, params));
}

export type Buffers = Record<string, TargetResult>;

export type Shaders = Record<string, Program>;

export type glsl = (params: Params, target?: Target | null) => TargetResult | undefined;

export type SwissGL = glsl & {
  gl: GL;
  buffers: Buffers;
  shaders: Shaders;
  reset(): void;
  adjustCanvas(dpr?: number): void;
  loop(callback: (arg: { glsl: SwissGL; time: number }) => any): void;
  stop(): void;
};

export type Spec = {
  size: [number, number];
  scale?: number;
  format?: TextureFormat;
  depth?: TextureTarget | null;
  layern?: number | null;
  data: ArrayBufferView | null;
  tag: string;
  story?: number;
  filter?: Filter;
  wrap?: Wrap;
};

function prepareOwnTarget(self: SwissGL, spec: Spec): TargetResult {
  const buffers = self.buffers;
  spec.size = getTargetSize(self.gl, spec);
  if (!buffers[spec.tag]) {
    const target = (buffers[spec.tag] = createTarget(self.gl, spec));
    console.log('created', target);
  }
  const target = buffers[spec.tag];
  const tex = Array.isArray(target) ? target[target.length - 1] : target;
  const needResize = tex.size[0] != spec.size[0] || tex.size[1] != spec.size[1];
  if (needResize || spec.data) {
    if (needResize) {
      console.log(`resizing "${spec.tag}" (${tex.size})->(${spec.size})`);
    }
    tex.update(spec.size, spec.data);
  }
  return buffers[spec.tag];
}

function bindTarget(gl: GL, target?: TargetResult | null): [number, number] {
  if (!target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return [gl.canvas.width, gl.canvas.height];
  }
  if (Array.isArray(target)) {
    target.unshift((target = target.pop()!));
  }
  return target.bindTarget(gl);
}

const OptNames = new Set([
  'Inc',
  'VP',
  'FP',
  'Clear',
  'Blend',
  'View',
  'Grid',
  'Mesh',
  'Aspect',
  'DepthTest',
  'AlphaCoverage',
  'Face',
]);

export type Options = {
  Inc: string | string[];
  VP: string;
  FP: string;
  Clear: number | [number, number, number, number];
  Blend: string;
  View: [number, number] | [number, number, number, number];
  Grid: [number] | [number, number] | [number, number, number];
  Mesh: [number, number];
  Aspect: Aspect;
  DepthTest: 0 | 1 | boolean | 'keep';
  AlphaCoverage: 0 | 1 | boolean;
  Face: 'front' | 'back';
};

// type Params = Partial<Options & Record<string, any>>;
export type Params = Partial<Options> & Record<string, any>;

export type Target = WebGLTexture | WebGLTexture[] | Spec | HTMLVideoElement;

export type Uniforms = {
  Src: WebGLTexture;
  View: [number, number, number, number];
  Aspect: [number, number];
  Grid: [number, number, number];
  Mesh: [number, number];
};

function drawQuads(
  self: SwissGL,
  params: Params,
  target?: Target | null,
): TargetResult | undefined {
  const options = {} as Options,
    uniforms = {} as Uniforms;
  for (const p in params) {
    // @ts-expect-error TODO: how to satisfy ts here?
    (OptNames.has(p) ? options : uniforms)[p] = params[p];
  }
  let Inc = options.Inc || [];
  if (!Array.isArray(Inc)) {
    Inc = [Inc];
  }
  const [VP, FP] = [options.VP || '', options.FP || ''];
  const noShader = !VP && !FP;
  const noDraw = options.Clear === undefined && noShader;

  // setup target
  let targetResult = target as unknown as TargetResult | undefined;
  if (target && 'tag' in target) {
    // target = prepareOwnTarget(self, target);
    // if (noDraw) return target;
    targetResult = prepareOwnTarget(self, target);
    if (noDraw) return targetResult;
  }
  if (Array.isArray(targetResult)) {
    uniforms.Src = uniforms.Src || targetResult[0];
  }

  // bind (and clear) target
  const gl = self.gl;
  // const targetSize = bindTarget(gl, target);
  const targetSize = bindTarget(gl, targetResult);
  let view = options.View || [0, 0, targetSize[0], targetSize[1]];
  if (view.length == 2) {
    view = [0, 0, view[0], view[1]];
  }
  gl.depthMask(!(options.DepthTest == 'keep'));
  if (typeof options.Clear === 'number' || Array.isArray(options.Clear)) {
    let clear = options.Clear;
    if (typeof clear === 'number') {
      clear = [clear, clear, clear, clear];
    }
    gl.clearColor(...clear);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(...view);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
  }

  // setup program
  if (noShader) {
    return targetResult;
  }
  let prog = self.shaders;
  for (const chunk of Inc) {
    // @ts-expect-error TODO: fix this
    prog = prog[chunk] || (prog[chunk] = {});
  }
  // @ts-expect-error TODO: fix this
  prog = prog[VP] || (prog[VP] = {});
  // @ts-expect-error TODO: fix this
  prog = prog[FP] || (prog[FP] = linkShader(gl, uniforms, Inc, VP, FP));
  gl.useProgram(prog);

  // process options
  if (options.Blend) {
    const blend = parseBlend(options.Blend)!;
    const { s, d, f } = blend;
    gl.enable(gl.BLEND);
    gl.blendFunc(s, d);
    gl.blendEquation(f);
  }
  if (options.DepthTest) {
    gl.enable(gl.DEPTH_TEST);
  }
  if (options.Face) {
    gl.enable(gl.CULL_FACE);
    const mode = { front: gl.BACK, back: gl.FRONT }[options.Face];
    gl.cullFace(mode);
  }
  if (options.AlphaCoverage) {
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }

  // View, Aspect
  gl.viewport(...view);
  const width = view[2],
    height = view[3];
  uniforms.View = view;
  uniforms.Aspect = calcAspect(options.Aspect, width, height);

  // Grid, Mesh
  const [gx = 1, gy = 1, gz = 1] = options.Grid || [];
  uniforms.Grid = [gx, gy, gz];
  uniforms.Mesh = options.Mesh || [1, 1]; // 3d for cube?
  const vertN = (uniforms.Mesh[0] * 2 + 3) * uniforms.Mesh[1] - 1;
  const instN = gx * gy * gz;
  ensureVertexArray(gl, Math.max(vertN, instN));
  gl.bindVertexArray(gl._indexVA!);

  // setup uniforms and textures
  Object.entries(prog.setters).forEach(([name, f]) => f(uniforms[name as keyof Uniforms]));
  // draw
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertN, instN);

  // revert gl state
  if (options.Blend) gl.disable(gl.BLEND);
  if (options.DepthTest) gl.disable(gl.DEPTH_TEST);
  if (options.Face) gl.disable(gl.CULL_FACE);
  if (options.AlphaCoverage) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  gl.bindVertexArray(null);
  return targetResult;
}

export default function SwissGL(canvas_gl: Canvas | GL): SwissGL {
  const gl =
    'getContext' in canvas_gl
      ? canvas_gl.getContext('webgl2', { alpha: false, antialias: true })!
      : canvas_gl;
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  ensureVertexArray(gl, 1024);
  const glsl = ((params: Params, target?: Target | null) =>
    drawQuads(glsl, params, target)) as SwissGL;

  glsl.gl = gl;
  glsl.shaders = {};
  glsl.buffers = {};
  glsl.reset = () => {
    const freeProg = (o: WebGLProgram | Record<string, WebGLProgram>) =>
      o instanceof WebGLProgram ? gl.deleteProgram(o) : Object.values(o).forEach(freeProg);
    freeProg(glsl.shaders);
    Object.values(glsl.buffers)
      .flat()
      .forEach(target => target.free());
    glsl.shaders = {};
    glsl.buffers = {};
  };
  glsl.adjustCanvas = (dpr?: number) => {
    dpr = dpr || self.devicePixelRatio;
    const canvas = gl.canvas as Canvas;
    const w = canvas.clientWidth * dpr,
      h = canvas.clientHeight * dpr;
    if (canvas.width != w || canvas.height != h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  glsl.loop = (callback: (arg: { glsl: SwissGL; time: number }) => any) => {
    const frameFunc = (time: number) => {
      const res = callback({ glsl, time: time / 1000.0 });
      if (res != 'stop') requestAnimationFrame(frameFunc);
    };
    requestAnimationFrame(frameFunc);
  };
  return glsl;
}
