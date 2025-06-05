// Copyright 2023 Google LLC

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

const Type2Setter = {};
const UniformType2TexTarget = {};
const TextureFormats = {};
{
    const GL = WebGL2RenderingContext;
    for (const t of ['FLOAT', 'INT', 'BOOL']) {
        const suf = t=='FLOAT' ? 'f':'i';
        Type2Setter[GL[t]] = 'uniform1'+suf;
        for (const i of [2, 3, 4]) {
            Type2Setter[GL[`${t}_VEC${i}`]] = `uniform${i}${suf}v`;
            if (suf=='f') {
                Type2Setter[GL[`${t}_MAT${i}`]] = `uniformMatrix${i}fv`;
            }
        }
    }
    UniformType2TexTarget[GL.SAMPLER_2D] = GL.TEXTURE_2D;
    UniformType2TexTarget[GL.SAMPLER_2D_ARRAY] = GL.TEXTURE_2D_ARRAY;
    UniformType2TexTarget[GL.INT_SAMPLER_2D] = GL.TEXTURE_2D;
    UniformType2TexTarget[GL.UNSIGNED_INT_SAMPLER_2D] = GL.TEXTURE_2D;

    const regfmt = (name, internalFormat, glformat, type, CpuArray, chn)=>{
        TextureFormats[name] = {internalFormat, glformat, type, CpuArray, chn};
    }
    regfmt('depth', GL.DEPTH_COMPONENT24, GL.DEPTH_COMPONENT, GL.UNSIGNED_INT, Uint32Array, 1);
    for (const c of ['r', 'rg', 'rgba'])
    {
        const C = c.toUpperCase(), chn=C.length;
        const fmt = (C=='R' ? 'RED' : C);
        const fmtI = fmt + '_INTEGER';
        regfmt(c+'8', GL[C+'8'], GL[fmt], GL.UNSIGNED_BYTE, Uint8Array, chn);
        regfmt(c+'16f', GL[C+'16F'], GL[fmt], GL.HALF_FLOAT, Uint16Array, chn);
        regfmt(c+'32f', GL[C+'32F'], GL[fmt], GL.FLOAT, Float32Array, chn);
        for (const [bits, type] of [[8, 'BYTE'], [16, 'SHORT'], [32, 'INT']]) {
            regfmt(`${c}${bits}i`, GL[`${C}${bits}I`],  GL[fmtI], GL[type], self[`Int${bits}Array`], chn);
            regfmt(`${c}${bits}u`, GL[`${C}${bits}UI`], GL[fmtI], GL['UNSIGNED_'+type], self[`Uint${bits}Array`], chn);
        }
    }  
}

function memoize(f) {
    const cache = {};
    const wrap = k => k in cache ? cache[k] : cache[k]=f(k);
    wrap.cache = cache;
    return wrap;
}

function updateObject(o, updates) {
    for (const s in updates) { o[s] = updates[s];}
    return o;
}

// Parse strings like 'min(s,d)', 'max(s,d)', 's*d', 's+d*(1-sa)',
// 's*d', 'd*(1-sa) + s*sa', s-d', 'd-s' and so on into
// gl.blendFunc/gl.blendEquation arguments.
function parseBlend(s0) {
    if (!s0) return;
    let s = s0.replace(/\s+/g, '');
    if (!s) return null;
    const GL = WebGL2RenderingContext;
    const func2gl = {
        'min': GL.MIN, 'max': GL.MAX, '+':GL.FUNC_ADD,
        's-d': GL.FUNC_SUBTRACT, 'd-s': GL.FUNC_REVERSE_SUBTRACT
    };
    const factor2gl = {
        '0': GL.ZERO, '1': GL.ONE,
        's': GL.SRC_COLOR, '(1-s)': GL.ONE_MINUS_SRC_COLOR,
        'd': GL.DST_COLOR, '(1-d)': GL.ONE_MINUS_DST_COLOR,
        'sa': GL.SRC_ALPHA, '(1-sa)': GL.ONE_MINUS_SRC_ALPHA,
        'da': GL.DST_ALPHA, '(1-da)': GL.ONE_MINUS_DST_ALPHA,
        'c': GL.CONSTANT_COLOR, '(1-c)': GL.ONE_MINUS_CONSTANT_COLOR,
        'ca': GL.CONSTANT_ALPHA, '(1-ca)': GL.ONE_MINUS_CONSTANT_ALPHA,
    };
    const res = {s:GL.ZERO, d:GL.ZERO, f:null};
    s = s.replace(/(s|d)(?:\*(\w+|\(1-\w+\)))?/g, (_,term,factor)=>{
        factor = factor||'1';
        if (!(factor in factor2gl)) {
            throw `Unknown blend factor: "${factor}"`;
        }
        res[term] = factor2gl[factor];
        return term;
    });
    let m;
    if (m=s.match(/^(min|max)\((s,d|d,s)\)$/)) {
        res.f = func2gl[m[1]];
    } else if (s.match(/^(s|d|s\+d|d\+s)$/)) {
        res.f = func2gl['+'];
    } else if (s in func2gl) {
        res.f = func2gl[s];
    } else {
        throw `Unable to parse blend spec: "${s0}"`;
    }
    return res;
}
parseBlend = memoize(parseBlend);

function compileShader(gl, code, type, program) {
    code = '#version 300 es\n'+code;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const withLines = code.split('\n').map(
            (s, i)=>`${(i+1+'').padStart(4)}: ${s}`).join('\n')
        throw (withLines+'\n'+'--- GLSL COMPILE ERROR ---\n'+ gl.getShaderInfoLog(shader));
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
}

function compileProgram(gl, vs, fs) {
    const program = gl.createProgram();
    compileShader(gl, vs, gl.VERTEX_SHADER, program);
    compileShader(gl, fs, gl.FRAGMENT_SHADER, program);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("shader link error:" + gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);
    program.setters = {};
    let unitCount = 0;
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; ++i) {
        const info = gl.getActiveUniform(program, i);
        const loc = gl.getUniformLocation(program, info.name);
        const name = info.name.match(/^\w+/)[0];
        if (info.type in UniformType2TexTarget) {
            const unit = unitCount++;
            const target = UniformType2TexTarget[info.type];
            gl.uniform1i(loc, unit);
            program.setters[name] = tex=>{
                gl.activeTexture(gl.TEXTURE0+unit);
                tex ? tex.bindSampler(unit) : gl.bindTexture(target, null);
            }
        } else {
            const fname = Type2Setter[info.type];
            const setter = fname.startsWith('uniformMatrix') ?
                v=>gl[fname](loc, false, v) : v=>gl[fname](loc, v);
            program.setters[name] = v=>v!=undefined?setter(v):null;
        }
    }
    gl.useProgram(null);
    console.log('created', program);
    return program;
}

const glsl_template = `
precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp isampler2D;
precision highp usampler2D;
precision highp isampler2DArray;
precision highp usampler2DArray;
#ifdef VERT
    #define varying out
    #define VPos gl_Position
    layout(location = 0) in int VertexID;
    layout(location = 1) in int InstanceID;
    int MeshRow;
    ivec2 VID;
#else
    #define varying in
    ivec2 I;
#endif
flat varying ivec3 ID;

uniform ivec3 Grid;
uniform ivec2 Mesh;
uniform int MeshMode;
uniform ivec4 View;
#define ViewSize (View.zw)
uniform vec2 Aspect;
varying vec2 UV;
#define XY (2.0*UV-1.0)
// #define VertexID gl_VertexID
// #define InstanceID gl_InstanceID


//////// GLSL Utils ////////

const float PI  = radians(180.0);
const float TAU = radians(360.0);

#define ASPECT_F(name, expr) vec2 name() {vec2 s = vec2(ViewSize); return vec2(expr);}
ASPECT_F(viewFit,   min(s.x,s.y)/s)
ASPECT_F(viewCover, max(s.x,s.y)/s)
ASPECT_F(viewFitX,  (1.0, s.x/s.y))
ASPECT_F(viewFitY,  (s.y/s.x, 1.0))
ASPECT_F(viewMean,  0.5*(s.x+s.y)/s)
#undef ASPECT_F

// source: https://www.shadertoy.com/view/XlXcW4
// TODO more complete hash library
vec3 hash( ivec3 ix ) {
    uvec3 x = uvec3(ix);
    const uint k = 1103515245U;
    x = ((x>>8U)^x.yzx)*k;
    x = ((x>>8U)^x.yzx)*k;
    x = ((x>>8U)^x.yzx)*k;
    return vec3(x)*(1.0/float(0xffffffffU));
}

mat2 rot2(float a) {
  float s=sin(a), c=cos(a);
  return mat2(c, s, -s, c);
}

// https://suricrasia.online/demoscene/functions/
vec3 erot(vec3 p, vec3 ax, float ro) {
    return mix(dot(ax, p)*ax, p, cos(ro)) + cross(ax,p)*sin(ro);
}

vec3 uv2sphere(vec2 uv) {
  uv *= vec2(-TAU,PI);
  return vec3(vec2(cos(uv.x), sin(uv.x))*sin(uv.y), cos(uv.y));
}

vec3 torus(vec2 uv, float r1, float r2) {
    uv *= TAU;
    vec3 p = vec3(r1+cos(uv.x)*r2, 0, sin(uv.x)*r2);
    return vec3(p.xy * rot2(uv.y), p.z);
}

vec3 cubeVert(vec2 xy, int side) {
    float x=xy.x, y=xy.y;
    switch (side) {
        case 0: return vec3(x,y,1); case 1: return vec3(y,x,-1);
        case 2: return vec3(y,1,x); case 3: return vec3(x,-1,y);
        case 4: return vec3(1,x,y); case 5: return vec3(-1,y,x);
    };
    return vec3(0.0);
}

vec3 _surf_f(vec3 p, vec3 a, vec3 b, out vec3 normal) {
    normal = normalize(cross(a-p, b-p));
    return p;
}
#define SURF(f, uv, out_normal, eps) _surf_f(f(uv), f(uv+vec2(eps,0)), f(uv+vec2(0,eps)), out_normal)
${
['', 'u', 'i'].map(t=>`
${t}vec4 _sample(${t}sampler2D tex, vec2 uv) {return texture(tex, uv);}
${t}vec4 _sample(${t}sampler2D tex, ivec2 xy) {return texelFetch(tex, xy, 0);}
${t}vec4 _sample(${t}sampler2DArray tex, vec2 uv, int layer) {return texture(tex, vec3(uv, layer));}
${t}vec4 _sample(${t}sampler2DArray tex, ivec2 xy, int layer) {return texelFetch(tex, ivec3(xy, layer), 0);}
`).join("")}
#ifdef VERT
    void _setupMesh() {
        int odd = MeshMode == 1 ? MeshRow%2 : 0;
        int i = clamp(VertexID-odd, 0, Mesh.x*2+1);
        VID = ivec2(i>>1, MeshRow+(i+odd+1)%2);
        UV = vec2(VID) / vec2(Mesh);
        VPos = vec4(XY,0,1);
    }
#else
    float isoline(float v) {
        float distToInt = abs(v-round(v));
        return smoothstep(max(fwidth(v), 0.0001), 0.0, distToInt);
    }
    float wireframe() {
        vec2 m = UV*vec2(Mesh);
        float diag = isoline(m.x-m.y);
        if (MeshMode==1 && (int(m.y)%2==1)) {
            diag = isoline(m.x+m.y);
        }
        return isoline(m.x)+isoline(m.y)+diag;
    }
#endif
`;

function guessUniforms(params) {
    const uni = [];
    const len2type = {1:'float', 2:'vec2', 3:'vec3', 4:'vec4', 9:'mat3', 16:'mat4'};
    for (const name in params) {
        const v = params[name];
        let s = null;
        if (v instanceof TextureSampler) {
            s = v.getUniformCode(name);
        } else if (typeof v === 'number') {
            s=`uniform float ${name};`
        } else if (typeof v === 'boolean') {
            s=`uniform bool ${name};`
        } else if (v.length in len2type) {
            s=`uniform ${len2type[v.length]} ${name};`
        }
        if (s) uni.push(s);
    }
    return uni.join('\n')+'\n';
}

const stripComments = code=>code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g,'');

// TODO better parser (use '\b')
function definedUniforms(code) {
    code = stripComments(code);
    const lines = Array.from(code.matchAll(/uniform\s+\w+\s+([^;]+)\s*;/g));
    return new Set(lines.map(m=>m[1].split(/[^\w]+/)).flat());
}

function expandCode(code, mainFunc, outVar) {
    const stripped = stripComments(code).trim();
    if (stripped != '' && stripped.indexOf(';') == -1) {
        code = `${outVar} = vec4(${stripped});`
    }
    if (!stripped.match(new RegExp(`\\b${mainFunc}\s*\\(`))) {
        code = `void ${mainFunc}() {
          ${code};
        }`
    }
    return code;
}
const expandVP = memoize(code=>expandCode(code, 'vertex', 'VPos'));
const expandFP = memoize(code=>expandCode(code, 'fragment', 'FOut'));

function extractVaryings(VP) {
    return Array.from(stripComments(VP).matchAll(/\b(flat\s+)?varying\s+[^;]+;/g))
    .map(m=>m[0]).map(s=>{
        while (s != (s=s.replace(/\([^()]*\)/g, ''))); // remove nested ()
        return s.replace(/=[^,;]*/g,'')  // remove assigned values 
    }).join('\n');
}

function stripVaryings(VP) {
    return VP.replace(/\b(flat\s+)?varying\s+\w+/g,'');
}

function linkShader(gl, uniforms, Inc, VP, FP, layern) {
    Inc = Inc.join('\n');
    const defined = definedUniforms([glsl_template, Inc, VP, FP].join('\n'));
    const undefined = Object.entries(uniforms)
        .filter(kv=>kv[0].match(/^\w+$/))
        .filter(kv=>!(defined.has(kv[0])));
    const autoUniforms = guessUniforms(Object.fromEntries(undefined));
    const varyings = extractVaryings(VP);
    const prefix = `${glsl_template}\n${autoUniforms}\n${varyings}\n`;
    let fragOutputs = ['layout(location = 0) out vec4 FOut;'];
    for (let i=1; i < layern; ++i) {
        fragOutputs.push(`layout(location = ${i}) out vec4 FOut${i};`);
    }
    return compileProgram(gl, `
    #define VERT
    ${prefix}
    ${Inc}
    ${expandVP(stripVaryings(VP))}
    void main() {
      int ii = InstanceID;
      MeshRow = ii % Mesh.y; ii/=Mesh.y;
      ID.x = ii % Grid.x; ii/=Grid.x;
      ID.y = ii % Grid.y; ii/=Grid.y;
      ID.z = ii;
      _setupMesh();
      vertex();
      VPos.xy *= Aspect;
    }`, `
    #define FRAG
    ${prefix}
    ${fragOutputs.join('\n')}
    ${Inc}
    ${expandFP(FP)}
    void main() {
      I = ivec2(gl_FragCoord.xy);
      fragment();
    }`);
}

class TextureSampler {
    fork(updates) {
        const {filter, wrap, _texture} = {...this, ...updates};
        return updateObject(new TextureSampler(), {filter, wrap, _texture});
    }
    get linear()  {return this.fork({filter:'linear'})}
    get nearest() {return this.fork({filter:'nearest'})}
    get miplinear() {return this.fork({filter:'miplinear'})}
    get edge()    {return this.fork({wrap:'edge'})}
    get repeat()  {return this.fork({wrap:'repeat'})}
    get mirror()  {return this.fork({wrap:'mirror'})}

    getUniformCode(name) {
        return this._texture._getUniformCode(name);
    }

    get _sampler() {
        const gl = this._texture.gl;
        const {filter, wrap} = this;
        if (!gl._samplers) {gl._samplers = {};}
        const id = `${filter}:${wrap}`;
        if (!(id in gl._samplers)) {
            const glfilter = { 'nearest': gl.NEAREST, 'linear': gl.LINEAR,
                'miplinear':gl.LINEAR_MIPMAP_LINEAR}[filter];
            const glwrap = {'repeat': gl.REPEAT, 'edge': gl.CLAMP_TO_EDGE,
                            'mirror': gl.MIRRORED_REPEAT}[wrap];
            const sampler = gl.createSampler();
            const setf = (k, v)=>gl.samplerParameteri(sampler, gl['TEXTURE_'+k], v);
            setf('MIN_FILTER', glfilter);
            setf('MAG_FILTER', filter=='miplinear' ? gl.LINEAR : glfilter);
            setf('WRAP_S', glwrap);
            setf('WRAP_T', glwrap);
            if (filter == 'miplinear' && gl.TEXTURE_MAX_ANISOTROPY_EXT) {
                setf('MAX_ANISOTROPY_EXT', 4.0);
            }
            gl._samplers[id] = sampler;
        }
        return gl._samplers[id];
    }
    bindSampler(unit) {
        // assume unit is already active
        const {gl, gltarget, handle} = this._texture;
        gl.bindTexture(gltarget, handle);
        if (this.filter == 'miplinear' && !handle.hasMipmap) {
            gl.generateMipmap(gltarget)
            handle.hasMipmap = true;
        }
        gl.bindSampler(unit, this._sampler);
    }
}

class TextureTarget extends TextureSampler {
    constructor(gl, params) {
        super();
        this._texture = this;
        let {size, tag, format='rgba8', filter='nearest', wrap='repeat',
            layern=null, data=null, depth=null} = params;
        if (!depth && format.includes('+')) {
            const [mainFormat, depthFormat] = format.split('+');
            format = mainFormat;
            depth = new TextureTarget(gl, {...params,
                tag:tag+'_depth',format:depthFormat, layern:null, depth:null});
        }
        this.handle = gl.createTexture(),
        this.filter = format=='depth' ? 'nearest' : filter;
        this.gltarget = layern ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
        this.formatInfo = TextureFormats[format];
        updateObject(this, {gl, _tag:tag, format, layern, wrap, depth});
        this.update(size, data);

        const typePrefix = format.endsWith('u') ? 'u' : 
            (format.endsWith('i') ? 'i':'');
        this._uniformTemplate = layern ? `
            uniform ${typePrefix}sampler2DArray $name;
            #define $name(p,l) (_sample($name, (p), (l)))
            ivec3 $name_size() {return textureSize($name, 0);}
            vec3  $name_step() {return 1.0/vec3($name_size());}
            `:`
            uniform ${typePrefix}sampler2D $name;
            #define $name(p) (_sample($name, (p)))
            ivec2 $name_size() {return textureSize($name, 0);}
            vec2  $name_step() {return 1.0/vec2($name_size());}\n`;
    }
    _getUniformCode(name) {
        return this._uniformTemplate.replaceAll('$name', name)
    }
    update(size, data) {
        const {gl, handle, gltarget, layern} = this;
        const {internalFormat, glformat, type} = this.formatInfo;
        const [w, h] = size;
        gl.bindTexture(gltarget, handle);
        if (!layern) {
            gl.texImage2D(gltarget, 0/*mip level*/,
                internalFormat, w, h, 0/*border*/,
                glformat, type, data/*data*/);
        } else {
            gl.texImage3D(gltarget, 0/*mip level*/,
                internalFormat, w, h, layern, 0/*border*/,
                glformat, type, data/*data*/);
        }
        gl.bindTexture(gltarget, null);
        this.size = size;
        if (this.depth) {this.depth.update(size, data);}
    }
    attach(gl) {
        if (!this.layern) {
            const attachment = this.format == 'depth' ? gl.DEPTH_ATTACHMENT : gl.COLOR_ATTACHMENT0;
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, this.handle, 0/*level*/);
        } else {
            const drawBuffers = [];
            for (let i=0; i<this.layern; ++i) {
                const attachment = gl.COLOR_ATTACHMENT0+i;
                drawBuffers.push(attachment);
                gl.framebufferTextureLayer(
                    gl.FRAMEBUFFER, attachment, this.handle, 0/*level*/, i);
            }
            gl.drawBuffers(drawBuffers);
        }
    }
    bindTarget(gl, readonly=false) {
        if (this.fbo) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        } else {
            this.fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            this.attach(gl)
            if (this.depth) this.depth.attach(gl);
        }
        if (!readonly) {this.handle.hasMipmap = false;}
        return this.size;
    }
    _getBox(box) {
        box = (box && box.length) ? box : [0, 0, ...this.size];
        const [x, y, w, h] = box, n = w*h*this.formatInfo.chn;
        return {box, n}
    }
    _getCPUBuf(n) {
        if (!this.cpu || this.cpu.length < n) {
            this.cpu = new this.formatInfo.CpuArray(n);
        }
        return this.cpu.length == n ? this.cpu : this.cpu.subarray(0, n);
    }
    _readPixels(box, targetBuf) {
        const {glformat, type} = this.formatInfo;
        this.bindTarget(this.gl, /*readonly*/true);
        this.gl.readPixels(...box, glformat, type, targetBuf);
    }
    readSync(...optBox) {
        const {box, n} = this._getBox(optBox);
        const buf = this._getCPUBuf(n);
        this._readPixels(box, buf);
        return buf
    }
    _bindAsyncBuffer(n) {
        const {gl} = this;
        const {CpuArray} = this.formatInfo;
        if (!this.async) {this.async = {all:new Set(), queue:[]};}
        if (this.async.queue.length == 0) {
            const gpuBuf = gl.createBuffer();
            this.async.queue.push(gpuBuf);
            this.async.all.add(gpuBuf);
        }
        const gpuBuf = this.async.queue.shift();
        if (this.async.queue.length > 6) {
            this._deleteAsyncBuf(this.async.queue.pop());
        }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, gpuBuf);
        if (!gpuBuf.length || gpuBuf.length < n) {
            const byteN = n * this.formatInfo.CpuArray.BYTES_PER_ELEMENT
            gl.bufferData(gl.PIXEL_PACK_BUFFER, byteN, gl.STREAM_READ);
            gpuBuf.length = n;
            console.log(`created/resized async gpu buffer "${this._tag}":`, gpuBuf);
        }
        return gpuBuf;
    }
    _deleteAsyncBuf(gpuBuf) {
        delete gpuBuf.length;
        this.gl.deleteBuffer(gpuBuf);
        this.async.all.delete(gpuBuf);
    }
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_non-blocking_async_data_readback
    read(callback, optBox, optTarget) {
        const {gl} = this;
        const {box, n} = this._getBox(optBox);
        const gpuBuf = this._bindAsyncBuffer(n);
        this._readPixels(box, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        this._asyncFetch(gpuBuf, sync, callback, optTarget);
    }
    _asyncFetch(gpuBuf, sync, callback, optTarget) {
        const {gl} = this;
        if (!gpuBuf.length) {  // check that gpu buffer is not deleted
            gl.deleteSync(sync); return;
        }
        const res = gl.clientWaitSync(sync, 0, 0);
        if (res === gl.TIMEOUT_EXPIRED) { 
            setTimeout(()=>this._asyncFetch(gpuBuf, sync, callback, optTarget), 1 /*ms*/); return; }            
        if (res === gl.WAIT_FAILED) {
            console.log(`async read of ${this._tag} failed`);
        } else {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, gpuBuf);
            const target = optTarget || this._getCPUBuf(gpuBuf.length);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,  0 /*srcOffset*/,
                target, 0 /*dstOffset*/, gpuBuf.length /*length*/);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
            callback(target);
        }
        gl.deleteSync(sync);
        this.async.queue.push(gpuBuf);
    }
    free() {
        const gl = this.gl;
        if (this.depth) this.depth.free();
        if (this.fbo) gl.deleteFramebuffer(this.fbo);
        if (this.async) this.async.all.forEach(buf=>this._deleteAsyncBuf(buf));
        gl.deleteTexture(this.handle);
    }
}

function calcAspect(aspect, w, h) {
    if (!aspect) return [1,1];
    let c;
    switch (aspect) {
        case 'fit':   c = Math.min(w, h); break;
        case 'cover': c = Math.max(w, h); break;
        case 'x':     c = w; break;
        case 'y':     c = h; break;
        case 'mean':  c = (w+h)/2; break;
        default: throw `Unknown aspect mode "${aspect}"`;
    }
    return [c/w, c/h];
}

function ensureVertexArray(gl, neededSize) {
    // gl_VertexID / gl_InstanceID seem to be broken in some configurations
    // (e.g. https://crbug.com/1315104), so I had to fallback to using arrays
    if (gl._indexVA && neededSize <= gl._indexVA.size)
        return;
    const size = neededSize*2;
    
    const va = gl._indexVA || gl.createVertexArray();
    va.size = size;
    gl._indexVA = va;
    gl.bindVertexArray(va);
    
    const arr = new Int32Array(size);
    arr.forEach((v, i)=>{arr[i] = i});
    
    const buf = va.buf || gl.createBuffer();
    va.buf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    
    for (let loc=0; loc<2; ++loc) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribIPointer(loc, 1/*size*/, gl.INT,
            false/*normalize*/, 0/*stride*/, 0/*offset*/);
    }
    gl.vertexAttribDivisor(1, 1);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);

    console.log('created:', va);
}

function getTargetSize(gl, {size, scale=1, data}) {
    if (!size && data) {
        if (data.videoWidth && data.videoHeight) {
            size = [data.videoWidth, data.videoHeight];
        } else if (data.width && data.height) {
            size = [data.width, data.height];
        }
    }
    size = size || [gl.canvas.width, gl.canvas.height];
    return [Math.ceil(size[0]*scale), Math.ceil(size[1]*scale)];
}

function createTarget(gl, params) {
    if (!params.story) return new TextureTarget(gl, params);
    return Array(params.story).fill(0).map(_=>new TextureTarget(gl, params));
}
function prepareOwnTarget(self, spec) {
    const buffers = self.buffers;
    spec.size = getTargetSize(self.gl, spec);
    if (!buffers[spec.tag]) {
        const target = buffers[spec.tag] = createTarget(self.gl, spec);
        console.log('created', target);
    } 
    const target = buffers[spec.tag];
    const tex = Array.isArray(target) ? target[target.length-1] : target;
    const needResize = tex.size[0] != spec.size[0] || tex.size[1] != spec.size[1];
    if (needResize || spec.data) {
        if (needResize) {
            console.log(`resizing "${spec.tag}" (${tex.size})->(${spec.size})`);
        }
        tex.update(spec.size, spec.data);
    }
    if (Array.isArray(target)) {
        target.size = spec.size;
    }
    return buffers[spec.tag];
}

function bindTarget(gl, target) {
    if (!target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return [gl.canvas.width, gl.canvas.height];
    }
    if (Array.isArray(target)) {
        const next = target.pop();
        if (target.size[0] != next.size[0] || target.size[1] != next.size[1]) {
            next.update(target.size, null);
        }
        target.unshift(next);
        target = next;
    }
    return target.bindTarget(gl)
}

const OptNames = new Set([
    'Inc', 'VP', 'FP',
    'Clear', 'Blend', 'View', 'Grid', 'Mesh', 'Aspect', 'DepthTest', 'AlphaCoverage', 'Face'
]);

function drawQuads(self, params, target) {
    const options={}, uniforms={}
    for (const p in params) {
        (OptNames.has(p)?options:uniforms)[p] = params[p];
    }
    let Inc = options.Inc || [];
    if (!Array.isArray(Inc)) { Inc = [Inc]; }
    const [VP, FP] = [options.VP||'', options.FP||''];
    const haveShader = VP || FP;
    const haveClear = options.Clear || options.Clear==0;

    // setup target
    if (target && target.tag) {
        target = prepareOwnTarget(self, target);
        if (!haveShader && !haveClear) {
            // rotate texture story
            if (Array.isArray(target)) {
                target.unshift(target.pop());
                target.size = target[0].size;
            }
            return target;
        }
    }
    if (Array.isArray(target)) {
        uniforms.Src = uniforms.Src || target[0];
    }

    // bind (and clear) target
    const gl = self.gl;
    const targetSize = bindTarget(gl, target);
    let view = options.View || [0, 0, targetSize[0], targetSize[1]];
    if (view.length == 2) {
        view = [0, 0, view[0], view[1]]
    }
    gl.depthMask(!(options.DepthTest == 'keep'));
    if (haveClear) {
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
    if (!haveShader) {
        return target;
    }
    let prog = self.shaders;
    for (const chunk of Inc) {
        prog = prog[chunk] || (prog[chunk] = {});    
    }
    prog = prog[VP] || (prog[VP] = {});
    const layern = (target && (Array.isArray(target) ? target[0] : target).layern) || 1;
    prog = prog[FP] || (prog[FP] = linkShader(gl, uniforms, Inc, VP, FP, layern));
    gl.useProgram(prog);
    
    // process options
    if (options.Blend) {
        const blend = parseBlend(options.Blend);
        const {s, d, f}=blend;
        gl.enable(gl.BLEND);
        gl.blendFunc(s, d);
        gl.blendEquation(f);
    }
    if (options.DepthTest) {
        gl.enable(gl.DEPTH_TEST);
    }
    if (options.Face) {
        gl.enable(gl.CULL_FACE);
        const mode = {'front':gl.BACK, 'back':gl.FRONT}[options.Face];
        gl.cullFace(mode);
    }
    if (options.AlphaCoverage) {
        gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }

    // View, Aspect
    gl.viewport(...view)
    const width=view[2], height=view[3];
    uniforms.View = view;
    uniforms.Aspect = calcAspect(options.Aspect, width, height);

    // Grid, Mesh
    const [gx=1, gy=1, gz=1] = options.Grid || [];
    const [mx=1, my=1] = options.Mesh || [];
    uniforms.Grid = [gx, gy, gz];
    uniforms.Mesh = [mx, my]; // 3d for cube?
    const vertN = (mx+1)*2 + (my>1); // extra vertex to fix row winding in MeshMode==1
    const instN = my * gx*gy*gz;
    ensureVertexArray(gl, Math.max(vertN, instN));
    gl.bindVertexArray(gl._indexVA);

    // setup uniforms and textures
    Object.entries(prog.setters).forEach(([name, f])=>f(uniforms[name]));
    // draw
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertN, instN);
    
    // revert gl state
    if (options.Blend) gl.disable(gl.BLEND);
    if (options.DepthTest) gl.disable(gl.DEPTH_TEST);
    if (options.Face) gl.disable(gl.CULL_FACE);
    if (options.AlphaCoverage) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.bindVertexArray(null);
    return target;
}

function SwissGL(canvas_gl) {
    const gl = canvas_gl.getContext ?
        canvas_gl.getContext('webgl2', {alpha:false, antialias:true}) : canvas_gl;
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    const ext = gl.getExtension("EXT_texture_filter_anisotropic")
    for (const k in ext) {
        gl[k] = ext[k];
    }
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    ensureVertexArray(gl, 1024);
    const glsl = (params, target)=>drawQuads(glsl, params, target);
    
    glsl.gl = gl;
    glsl.shaders = {};
    glsl.buffers = {};
    glsl.reset = ()=>{
        const freeProg = o=>(o instanceof WebGLProgram) ? gl.deleteProgram(o) : Object.values(o).forEach(freeProg);
        freeProg(glsl.shaders);
        Object.values(glsl.buffers).flat().forEach(target=>target.free());
        glsl.shaders = {};
        glsl.buffers = {};
    };
    glsl.adjustCanvas = dpr=>{
        dpr = dpr || self.devicePixelRatio;
        const canvas = gl.canvas;
        const w = Math.max(1, Math.floor(canvas.clientWidth*dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight*dpr));
        if (canvas.width != w || canvas.height != h) {
            canvas.width = w; canvas.height = h;
        }
    }
    glsl.loop = callback=>{
        const frameFunc = time=>{
            const res = callback({glsl, time:time/1000.0});
            if (res != 'stop') requestAnimationFrame(frameFunc);
        };
        requestAnimationFrame(frameFunc);
    };
    return glsl;
}

self._SwissGL = SwissGL;
