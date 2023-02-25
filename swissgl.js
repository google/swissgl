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
// 1d/3d grid
// fbo:
// - multiple render targets (arrays)
// - depth/stencil
// - mipmaps?
// samplers/filter?
// data texture subimage?
// glsl lib
// - hash (overloads)
// - 3d prim/helpers
// - universal geom (mesh)
// - normals
// devicePixelRatio
// cullface
// depth test modes
// proper perspective

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

// Parse strings like 'min(s,d)', 'max(s,d)', 's*d', 's+d*(1-sa)',
// 'd*(1-sa) + s*sa', 's*d', 'd*(1-sa) + s*sa', s-d', 'd-s' and
// so on into gl.blendFunc/gl.blendEquation arguments.
function parseBlend(s0) {
    if (!s0) return;
    if (s0 in parseBlend.cache) {
        return parseBlend.cache[s0];
    }
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
    parseBlend.cache[s0] = res;
    return res;
}
parseBlend.cache = {}

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
            program.setters[info.name] = v=>gl[Type2Setter[info.type]](loc, v);
        }
    }
    gl.useProgram(null);
    console.log('created', program);
    return program;
}

const stripComments = code=>code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g,'');

// TODO better parser (use '\b')
function definedUniforms(code) {
    code = stripComments(code);
    const lines = Array.from(code.matchAll(/uniform\s+\w+\s+([^;]+)\s*;/g));
    return new Set(lines.map(m=>m[1].split(/[^\w]+/)).flat());
}


const glsl_utils = `
const float PI  = radians(180.0);
const float TAU = radians(360.0);

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

vec3 uv2sphere(vec2 uv) {
  uv *= vec2(TAU, PI);
  return vec3(vec2(cos(uv.x), sin(uv.x))*sin(uv.y), cos(uv.y));
}

vec4 _sample(sampler2D tex, vec2 uv) {return texture(tex, uv);}
vec4 _sample(sampler2D tex, ivec2 xy) {return texelFetch(tex, xy, 0);}
`;

const frag_utils = `
float isoline(float v) {
    float distToInt = abs(v-round(v));
    return smoothstep(max(fwidth(v), 0.0001), 0.0, distToInt);
}`;

function guessUniforms(params) {
    const uni = [];
    const len2type = {1:'float', 2:'vec2', 3:'vec3', 4:'vec4', 9:'mat3', 16:'mat4'};
    for (const name in params) {
        const v = params[name];
        let s = null;
        if (v instanceof WebGLTexture) {
            s = `uniform sampler2D ${name};
            #define ${name}(p) (_sample(${name}, (p)))
            ivec2 ${name}_size() {return textureSize(${name}, 0);}
            vec2  ${name}_step() {return 1.0/vec2(${name}_size());}`;
        } else if (typeof v === 'number') {
            s=`uniform float ${name};`
        } else  if (v.length in len2type) {
            s=`uniform ${len2type[v.length]} ${name};`
        }
        if (s) uni.push(s);
    }
    return uni.join('\n');
}

function expandCode(code) {
    // TODO more defaults?
    const stripped = stripComments(code).trim();
    if (stripped == '') return null;
    if (stripped.indexOf(';') == -1) {
        code = `out0 = vec4(${stripped});`
    }
    if (!stripped.match(/\bfragment\s*\(/)) {
        code = `void fragment() {
          ${code};
        }`
    }
    if (code.indexOf('//FRAG') == -1) {
        code = `
        //VERT
        vec4 vertex() {
          return vec4(UV*2.0-1.0, 0.0, 1.0);
        }
        //FRAG
        ${code}`;
    }
    if (code.indexOf('//VERT') == -1) {
     code = '//VERT\n'+code;   
    }
    return code;
}

function linkShader(gl, params, code, include) {
    code = `uniform ivec2 Grid;
    uniform ivec2 Mesh;
    uniform ivec4 View;
    #define ViewSize (View.zw)
    uniform vec2 Aspect;
    uniform float Perspective;
    varying vec2 UV;
    #define XY (2.0*UV-1.0)
    // #define VertexID gl_VertexID
    // #define InstanceID gl_InstanceID
    
    ${include}
    \n`+expandCode(code);
    const defined = definedUniforms(code);
    const undefined = Object.entries(params).filter(kv=>!(defined.has(kv[0])));
    const guessed = guessUniforms(Object.fromEntries(undefined));
    const [_, common, vert, frag] = code.match(/([\s\S]*)\/\/VERT[^\n]*([\s\S]*)\/\/FRAG[^\n]*([\s\S]*)/);
    const prefix = `${glsl_utils}\n${guessed}\n${common}\n`;
    return compileProgram(gl, `
    precision highp int;
    layout(location = 0) in int VertexID;
    layout(location = 1) in int InstanceID;
    ivec2 VID, ID;
    #define varying out
    ${prefix} ${vert}
    void main() {
      int rowVertN = Mesh.x*2+4;
      int rowVertI = clamp((VertexID%rowVertN)-1, 0, rowVertN-3);
      VID = ivec2(rowVertI>>1, VertexID/rowVertN + (rowVertI&1));
      ID = ivec2(InstanceID%Grid.x, InstanceID/Grid.x);
      UV = vec2(VID) / vec2(Mesh);
      vec4 v = vertex();
      v.xy *= Aspect;
      v.w -= v.z*Perspective;
      v.z *= -0.1; // TODO
      gl_Position = v;
    }`, `
    precision highp float;
    precision highp int;
    #define varying in
    layout(location = 0) out vec4 out0;
    ivec2 I;
    ${prefix} ${frag_utils} ${frag}
    void main() {
      I = ivec2(gl_FragCoord.xy);
      fragment();
    }`);
}

function createTex2D(gl, {size, format='rgba8', filter='linear', wrap='repeat', data=null}) {
    const [internalFormat, glformat, type] = {
        'r8': [gl.R8, gl.RED, gl.UNSIGNED_BYTE],
        'rgba8': [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
        'r16f': [gl.R16F, gl.RED, gl.FLOAT],
        'rgba16f': [gl.RGBA16F, gl.RGBA, gl.FLOAT],
        'r32f': [gl.R32F, gl.RED, gl.FLOAT],
        'rgba32f': [gl.RGBA32F, gl.RGBA, gl.FLOAT],
    }[format];
    // TODO: mipmap
    const glfilter = { 'nearest': gl.NEAREST, 'linear': gl.LINEAR}[filter];
    const glwrap = {'repeat': gl.REPEAT, 'edge': gl.CLAMP_TO_EDGE,
                    'mirror': gl.MIRRORED_REPEAT}[wrap];
    const tex = gl.createTexture();
    tex.update = (size, data)=> {
        const [w, h] = size;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0/*mip level*/,
            internalFormat, w, h, 0/*border*/,
            glformat, type, data/*data*/);
        gl.bindTexture(gl.TEXTURE_2D, null);
        tex.size = size;
    }
    tex.update(size, data);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    // TODO: gl.generateMipmap(gl.TEXTURE_2D); ?
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glfilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glfilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glwrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glwrap);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
}

function createTex(gl, params) {
    const story = params.story || 1;
    // TODO array
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
    return !((!target) ||  // canvas
        (target instanceof WebGLTexture) || Array.isArray(target));
}

function getTargetSize(gl, {size, scale=1}) {
    size = size || [gl.canvas.width, gl.canvas.height];
    return [Math.round(size[0]*scale), Math.round(size[1]*scale)];
}

function prepareOwnTarget(self, spec) {
    spec = {...spec};
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

function bindTarget(gl, tex) {
    if (tex && !tex.fbo) {
        tex.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, tex.fbo);
        // TODO: array, depth
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0/*level*/);
    } else {
        const fbo = tex ? tex.fbo : null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    }
    return tex ? tex.size : [gl.canvas.width, gl.canvas.height];
}

const OptNames = new Set([
    'Clear', 'Blend', 'View', 'Grid', 'Mesh', 'Aspect', 'Perspective', 'DepthTest', 'AlphaCoverage'
]);

function drawQuads(self, params, code, target) {
    // process arguments
    if (typeof params === 'string') {
        [params, code, target] = [{}, params, code];
    } else if (code === undefined) {
        [params, code, target] = [{}, '', params];
    }
    const options={}, uniforms={}
    for (const p in params) {
        (OptNames.has(p)?options:uniforms)[p] = params[p];
    }
    const emptyShader = !code;

    // setup target
    const useOwnTarget = isTargetSpec(target);
    if (useOwnTarget) {
        target.tag = target.tag || code;
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
    if (options.Clear !== undefined) {  // can be 0.0
        let clear = options.Clear;
        if (typeof clear === 'number') {
            clear = [clear, clear, clear, clear];
        }
        gl.clearColor(...clear);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    // setup program
    if (emptyShader) {
        return target;
    }
    if (!(code in self.shaders)) {
        self.shaders[code] = linkShader(gl, uniforms, code, self.include);
    }
    const prog = self.shaders[code];
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
    if (options.AlphaCoverage) {
        gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }

    // View, Aspect, Perspective
    let view = options.View || [0, 0, targetSize[0], targetSize[1]];
    if (view.length == 2) {
        view = [0, 0, view[0], view[1]]
    }
    gl.viewport(...view)
    const width=view[2], height=view[3];
    uniforms.View = view;
    uniforms.Aspect = calcAspect(options.Aspect, width, height);
    uniforms.Perspective = options.Perspective || 0.0;

    // Grid, Mesh
    uniforms.Grid = options.Grid || [1, 1]; // 1d, 3d
    uniforms.Mesh = options.Mesh || [1, 1]; // 3d for cube?
    const vertN = (uniforms.Mesh[0]*2+4)*uniforms.Mesh[1]-1;
    const instN = uniforms.Grid[0]*uniforms.Grid[1];
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
        gl.bindTexture(gl.TEXTURE_2D, tex);  //TODO: array
        //gl.bindSampler(i, null); //TODO: sampler
    }
    
    // draw
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertN, instN);
    
    // revert gl state
    if (options.Blend) gl.disable(gl.BLEND);
    if (options.DepthTest) gl.disable(gl.DEPTH_TEST);
    if (options.AlphaCoverage) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    gl.bindVertexArray(null);
    return target;
}

function SwissGL(canvas_gl, {include=''}={}) {
    const gl = canvas_gl.getContext ?
        canvas_gl.getContext('webgl2') : canvas_gl;
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    ensureVertexArray(gl, 1024);
    function glsl(params, code, target) {
        return drawQuads(glsl, params, code, target)
    };
    glsl.gl = gl;
    glsl.shaders = {};
    glsl.buffers = {};
    glsl.include = include;

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
        glsl.include = '';
        glsl.shaders = {};
        glsl.buffers = {};
    };
    return glsl;
}
