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
// samplers/filter?
// data texture subimage?
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

const Type2Setter = {};
for (const t of ['FLOAT', 'INT', 'BOOL']) {
    const suf = t=='FLOAT' ? 'f':'i';
    const GL = WebGL2RenderingContext;
    Type2Setter[GL[t]] = 'uniform1'+suf;
    for (const i of [2, 3, 4]) {
        Type2Setter[GL[`${t}_VEC${i}`]] = `uniform${i}${suf}v`;
        if (suf=='f') {
            Type2Setter[GL[`${t}_MAT${i}`]] = `uniformMatrix${i}fv`;
        }
    }
}

function memoize(f) {
    const cache = {};
    const wrap = k => k in cache ? cache[k] : cache[k]=f(k);
    wrap.cache = cache;
    return wrap;
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
    program.samplers = [];
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; ++i) {
        const info = gl.getActiveUniform(program, i);
        const loc = gl.getUniformLocation(program, info.name);
        if (info.type==gl.SAMPLER_2D || info.type==gl.SAMPLER_2D_ARRAY) {
            gl.uniform1i(loc, program.samplers.length);
            program.samplers.push(info);
        } else {
            const fname = Type2Setter[info.type];
            const setter = fname.startsWith('uniformMatrix') ?
                v=>gl[fname](loc, false, v) : v=>gl[fname](loc, v);
            program.setters[info.name.match(/^\w+/)[0]] = setter;

        }
    }
    gl.useProgram(null);
    console.log('created', program);
    return program;
}

const glsl_template = `
precision highp float;
precision highp int;
precision lowp sampler2DArray;
#ifdef VERT
    #define varying out
    #define VPos gl_Position
    layout(location = 0) in int VertexID;
    layout(location = 1) in int InstanceID;
    ivec2 VID;
    ivec3 ID;
#else
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
#endif

uniform ivec3 Grid;
uniform ivec2 Mesh;
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

vec4 _sample(sampler2D tex, vec2 uv) {return texture(tex, uv);}
vec4 _sample(sampler2D tex, ivec2 xy) {return texelFetch(tex, xy, 0);}
vec4 _sample(sampler2DArray tex, vec2 uv, int layer) {return texture(tex, vec3(uv, layer));}
vec4 _sample(sampler2DArray tex, ivec2 xy, int layer) {return texelFetch(tex, ivec3(xy, layer), 0);}

#ifdef FRAG
    float isoline(float v) {
        float distToInt = abs(v-round(v));
        return smoothstep(max(fwidth(v), 0.0001), 0.0, distToInt);
    }
    float wireframe() {
        vec2 m = UV*vec2(Mesh);
        float d1 = isoline(m.x-m.y), d2 = isoline(m.x+m.y);
        float d = mix(d1, d2, float(int(m.y)%2));
        return isoline(m.x)+isoline(m.y)+d;
    }
#endif
`;

function guessUniforms(params) {
    const uni = [];
    const len2type = {1:'float', 2:'vec2', 3:'vec3', 4:'vec4', 9:'mat3', 16:'mat4'};
    for (const name in params) {
        const v = params[name];
        let s = null;
        if (v instanceof WebGLTexture) {
            const [type, D] = v.layern?['sampler2DArray', '3']:['sampler2D', '2'];
            const lookupMacro = v.layern?
                `#define ${name}(p,l) (_sample(${name}, (p), (l)))` : 
                `#define ${name}(p) (_sample(${name}, (p)))`;
            s = `uniform ${type} ${name};
            ${lookupMacro}
            ivec${D} ${name}_size() {return textureSize(${name}, 0);}
            vec${D}  ${name}_step() {return 1.0/vec${D}(${name}_size());}`;
        } else if (typeof v === 'number') {
            s=`uniform float ${name};`
        } else  if (v.length in len2type) {
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

function linkShader(gl, uniforms, Inc, VP, FP) {
    const defined = definedUniforms([glsl_template, Inc, VP, FP].join('\n'));
    const undefined = Object.entries(uniforms)
        .filter(kv=>kv[0].match(/^\w+$/))
        .filter(kv=>!(defined.has(kv[0])));
    const guessed = guessUniforms(Object.fromEntries(undefined));
    const prefix = `${glsl_template}\n${Inc}\n${guessed}`;
    return compileProgram(gl, `
    #define VERT
    ${prefix}\n${expandVP(VP)}
    void main() {
      int rowVertN = Mesh.x*2+3;
      int rowI = VertexID/rowVertN;
      int rowVertI = min(VertexID%rowVertN, rowVertN-2);
      int odd = rowI%2;
      if (odd==0) rowVertI = rowVertN-rowVertI-2;
      VID = ivec2(rowVertI>>1, rowI + (rowVertI+odd+1)%2);
      int ii = InstanceID;
      ID.x = ii % Grid.x; ii/=Grid.x;
      ID.y = ii % Grid.y; ii/=Grid.y;
      ID.z = ii;
      UV = vec2(VID) / vec2(Mesh);
      VPos = vec4(XY,0,1);
      vertex();
      VPos.xy *= Aspect;
    }`, `
    #define FRAG
    ${prefix}\n${expandFP(FP)}
    void main() {
      I = ivec2(gl_FragCoord.xy);
      fragment();
    }`);
}

function createTex2D(gl, params) {
    let {size, format='rgba8', filter='nearest', wrap='repeat', layern=null, data=null, depth=null} = params;
    if (format.includes('+')) {
        const [mainFormat, depthFormat] = format.split('+');
        const tex = createTex2D(gl, {...params, format:mainFormat});
        tex.depth = createTex2D(gl, {...params, format:depthFormat, layern:null, depth:null});
        return tex;
    }
    const gltarget = layern ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
    const [internalFormat, glformat, type, CpuArray] = {
        'r8': [gl.R8, gl.RED, gl.UNSIGNED_BYTE, Uint8Array],
        'rgba8': [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, Uint8Array],
        'r16f': [gl.R16F, gl.RED, gl.HALF_FLOAT, Uint16Array],
        'rgba16f': [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, Uint16Array],
        'r32f': [gl.R32F, gl.RED, gl.FLOAT, Float32Array],
        'rgba32f': [gl.RGBA32F, gl.RGBA, gl.FLOAT, Float32Array],
        'depth': [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, Uint32Array],
    }[format];
    // TODO: mipmap
    if (format == 'depth') {
        filter = 'nearest';
    }
    const glfilter = { 'nearest': gl.NEAREST, 'linear': gl.LINEAR}[filter];
    const glwrap = {'repeat': gl.REPEAT, 'edge': gl.CLAMP_TO_EDGE,
                    'mirror': gl.MIRRORED_REPEAT}[wrap];
    const tex = gl.createTexture();
    tex.tag = params.tag;
    tex.format = format;
    tex.layern = layern;
    tex.gltarget = gltarget;
    if (depth) {tex.depth = depth;}
    tex.update = (size, data)=> {
        const [w, h] = size;
        gl.bindTexture(gltarget, tex);
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
        tex.size = size;
        if (tex.depth) {tex.depth.update(size, data);}
    }
    tex.update(size, data);
    tex.readSync = (...arg)=>{
        const [x, y, w, h] = arg.length ? arg : [0, 0, ...tex.size];
        const ch = (glformat == gl.RGBA) ? 4 : 1;
        const n = w*h*ch;
        if (!tex.cpu || tex.cpu.length < n) {
            tex.cpu = new CpuArray(n);
        }
        bindTarget(gl, tex);
        gl.readPixels(x, y, w, h, glformat, type, tex.cpu);
        return (tex.cpu.length == n) ? tex.cpu : tex.cpu.subarray(0, n);
    }

    gl.bindTexture(gltarget, tex);
    // TODO: gl.generateMipmap(gltarget); ?
    gl.texParameteri(gltarget, gl.TEXTURE_MIN_FILTER, glfilter);
    gl.texParameteri(gltarget, gl.TEXTURE_MAG_FILTER, glfilter);
    gl.texParameteri(gltarget, gl.TEXTURE_WRAP_S, glwrap);
    gl.texParameteri(gltarget, gl.TEXTURE_WRAP_T, glwrap);
    gl.bindTexture(gltarget, null);
    return tex;
}

function createTex(gl, params) {
    const story = params.story || 1;
    const textures = [];
    for (let i=0; i<story; ++i){
        textures.push(createTex2D(gl, params));
    }
    const res = story > 1 ? textures : textures[0];
    console.log('created', res);
    return res;
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

function isTargetSpec(target) {
    return !(!target ||  // canvas
        (target instanceof WebGLTexture) || Array.isArray(target) || (target.fbo !== undefined));
}

function getTargetSize(gl, {size, scale=1}) {
    size = size || [gl.canvas.width, gl.canvas.height];
    return [Math.ceil(size[0]*scale), Math.ceil(size[1]*scale)];
}

function prepareOwnTarget(self, spec) {
    if (!spec.tag) {
        throw 'target must have a tag';
    }
    const buffers = self.buffers;
    spec.size = getTargetSize(self.gl, spec);
    if (!buffers[spec.tag]) {
        buffers[spec.tag] = createTex(self.gl, spec);
    } else {
        const target = buffers[spec.tag];
        const tex = Array.isArray(target) ? target[target.length-1] : target;
        const needResize = tex.size[0] != spec.size[0] || tex.size[1] != spec.size[1];
        if (needResize || spec.data) {
            if (needResize) {
                console.log(`resized tex (${tex.size})->(${spec.size})`);
            }
            tex.update(spec.size, spec.data);
        }
    }
    return buffers[spec.tag];
}

function attachTex(gl, tex) {
    if (!tex.layern) {
        const attachment = tex.format == 'depth' ? gl.DEPTH_ATTACHMENT : gl.COLOR_ATTACHMENT0;
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, tex, 0/*level*/);
    } else {
        const drawBuffers = [];
        for (let i=0; i<tex.layern; ++i) {
            const attachment = gl.COLOR_ATTACHMENT0+i;
            drawBuffers.push(attachment);
            gl.framebufferTextureLayer(
                gl.FRAMEBUFFER, attachment, tex, 0/*level*/, i);
        }
        gl.drawBuffers(drawBuffers);
    }
}

function bindTarget(gl, tex) {
    if (tex && (tex.fbo===undefined)) {
        tex.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, tex.fbo);
        attachTex(gl, tex);
        if (tex.depth) attachTex(gl, tex.depth);
    } else {
        const fbo = tex ? tex.fbo : null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    }
    return tex ? tex.size : [gl.canvas.width, gl.canvas.height];
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
    const [Inc, VP, FP] = [options.Inc||'', options.VP||'', options.FP||''];
    const emptyShader = !VP && !FP;
    const shaderID = Inc+VP+FP;

    // setup target
    if (isTargetSpec(target)) {
        target = prepareOwnTarget(self, target);
    }
    let targetTexture = target;
    if (Array.isArray(target)) {
        uniforms.Src = uniforms.Src || target[0];
        target.unshift(target.pop());
        targetTexture = target[0];
    }

    // bind (and clear) target
    if (options.Clear === undefined && emptyShader) {
        return target;
    }
    const gl = self.gl;
    const targetSize = bindTarget(gl, targetTexture);
    let view = options.View || [0, 0, targetSize[0], targetSize[1]];
    if (view.length == 2) {
        view = [0, 0, view[0], view[1]]
    }
    gl.depthMask(!(options.DepthTest == 'keep'));
    if (options.Clear !== undefined) {  // can be 0.0
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
    if (emptyShader) {
        return target;
    }
    if (!(shaderID in self.shaders)) {
        self.shaders[shaderID] = linkShader(gl, uniforms, Inc, VP, FP);
    }
    const prog = self.shaders[shaderID];
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
    uniforms.Grid = [gx, gy, gz];
    uniforms.Mesh = options.Mesh || [1, 1]; // 3d for cube?
    const vertN = (uniforms.Mesh[0]*2+3)*uniforms.Mesh[1]-1;
    const instN = gx*gy*gz;
    ensureVertexArray(gl, Math.max(vertN, instN));
    gl.bindVertexArray(gl._indexVA);

    // setup uniforms and textures
    for (const name in uniforms) {
        const val = uniforms[name];
        if (name in prog.setters) {
            prog.setters[name](val);
        }
    }
    for (let i=0; i<prog.samplers.length; ++i) {
        const tex = uniforms[prog.samplers[i].name];
        gl.activeTexture(gl.TEXTURE0+i);
        gl.bindTexture(tex?tex.gltarget:gl.TEXTURE_2D, tex);
        //gl.bindSampler(i, null); //TODO: sampler
    }
    
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

function wrapSwissGL(hook) {
    const glsl = this;
    const f = (params, target)=>hook(glsl, params, target);
    f.hook = wrapSwissGL;
    f.gl = glsl.gl;
    return f;
}

function SwissGL(canvas_gl) {
    const gl = canvas_gl.getContext ?
        canvas_gl.getContext('webgl2', {alpha:false, antialias:true}) : canvas_gl;
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    ensureVertexArray(gl, 1024);
    const glsl = (params, target)=>drawQuads(glsl, params, target);
    glsl.hook = wrapSwissGL;
    
    glsl.gl = gl;
    glsl.shaders = {};
    glsl.buffers = {};

    const releaseTarget = target=>{
        if (target.fbo) gl.deleteFramebuffer(target.fbo);
        gl.deleteTexture(target);
    }
    glsl.reset = ()=>{
        Object.values(glsl.shaders).forEach(
            prog=>gl.deleteProgram(prog));
        Object.values(glsl.buffers).forEach(target=>{
            if (Array.isArray(target)) {
                target.forEach(releaseTarget);
            } else {
                releaseTarget(target);
            }
        });
        glsl.shaders = {};
        glsl.buffers = {};
    };
    return glsl;
}

self._SwissGL = SwissGL;