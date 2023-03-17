# SwissGL API

`glsl` function has at most three arguments, some of which can be omitted:
```js
glsl(params, code, target);
```

* `params` is a dictionary that is mainly used to pass uniforms to the GLSL program. It may also contain a few *special arguments* (see below) that control the WebGL state, like blending or clearing the buffer before the draw call. SwissGL tries to automatically infer uniform types and introduce them to the shader code (it's also possible to override the types by declaring uniforms manually).

* `code` is a string that contains GLSL code. Whenever a non-empty string is passed, SwissGL will try to expand it into a pair of vertex and fragment shaders, compile and link them and cache the resulting shader program for future use. Cached shaders are stored in the `glsl.shaders` dictionary. Then the library will execute a WebGL draw call using this program. The type and the number of drawn primitives is controlled by the `Mesh` and `Grid` special arguments in `params` (see below).

* `target` determines the buffer where the rendering results are written. These are the following possibilities:
    * `null` or `undefined` - render to canvas directly.
    * `WebGLTexture` object - render to the texture.
    * Array of `WebGLTexture`'s - render to the last texture in the array and cyclically shift the array in-place so that it becomes element `0`. This is useful for ping-pong buffers where element `0` corresponds to the state of the system at the current time step, element `1` to the previous step and so on. The original `0`-th texture is provided to the shader for reading as `Src` uniform for convenience.
    * *Texture specification* dictionary. That's how we can use SwissGL to create new textures or even arrays of textures. Like shaders, textures are cached in the `glsl.buffers` dictionary. `tag` attribute of the specification is used as a key. Shader `code` is used when `tag` is not provided.

`glsl` function returns a reference to the `target`. If the texture specification was given, the actual created texture(s) is returned.

## Special arguments
In addition to uniforms, SwissGL accepts a number of options in the `params` argument. These options control the WebGL state and the number of rendered primitives:

* `Clear`: scalar or `[r,g,b,a]` array. Clears the target buffer with a given color before rendering. Also clears the depth buffer if it's present. (TODO: option to keep depth)

* `Blend`: string. Expression that controls WebGL blending mode (set with `gl.blendFunc` and `gl.blendEquation`). Inputs are: `s` - source color emitted by fragment shader; `d` - destination color already present in the target buffer; `sa` - source alpha; `da` - destination alpha. Examples: `s+d`, `d-s`, `d*(1-sa)+s*sa` (standard transparency), `d*(1-sa)+s` (premultiplied alpha), `max(s,d)`, `min(s,d)`, `d*s`. (TODO formal language definition)

* `View`: array `[w, h]` or `[x, y, w, h]`. Controls WebGL viewport. By default, the viewport is set to cover the whole target. Value is available in shader as `uniform ivec4 View`. `ViewSize` macro also provides `ivec2` view size.

* `Aspect`: string (`fit`, `cover`, `mean`, `x`, `y`). Adjust `xy` coordinates emitted by vertex the program to preserve the scale of viewport axes.

* `Grid`: `[w]`, `[w, h]` or `[w, h, d]`, default `[1,1,1]`. [instantiate](https://webglfundamentals.org/webgl/lessons/webgl-instanced-drawing.html) the rendered primitive `w*h*d` times. Instance ID is available in the vertex shader as `ivec3 ID`. Grid size is available in shader as `uniform ivec3 Grid`.

* `Mesh`: `[w, h]`, default `[1,1]`. Tessellate the rendered 2d plane primitive. `vec2 UV` and `XY` globals available in both vertex and fragment shaders provide `[0,1]`-range and `[-1,1]`-range vertex coordinates correspondingly. Integer vertex index is also provided as `ivec2 VID` global (VS only). Mesh size is available in the shader as `uniform ivec2 Mesh`.

* `DepthTest`: `false`, `true` or `"keep"`, default is `false`. Enables depth testing. Passing `"keep"` sets read-only depth testing mode, when test is being performed, but the depth buffer is not updated with new depth values.

* `Face`: `'front'` or `'back'`. When provided, sets face culling to render corresponding faces only.

* `AlphaCoverage`: enable `gl.SAMPLE_ALPHA_TO_COVERAGE` if `true`. See [this article](https://bgolus.medium.com/anti-aliased-alpha-test-the-esoteric-alpha-to-coverage-8b177335ae4f) for the usage example.

## Code formats

SwissGL accepts a `code` string that contains a pair of vertex and fragment shaders together, which we call *full* format. In addition to that, there is a number of shortcuts that are mainly used for full-screen/buffer quad rendering:

* *expression*: a string that becomes the correct expression if it's substituted into the `vec4(${code})` template.

* *multiline*: a function body that can be substituted into
`void fragment() { ${code}; }` template. The output must be written into the `out0` variable of type `vec4`.

* *fragment*: a piece of GLSL code that contains a `void fragment() {...}` function. This format allows defining additional functions or custom uniforms.

* *full*: a concatenated pair of vertex and fragment programs in a special form. *Full* `code` format, combined with `Mesh` and `Grid` arguments, enables rendering much more sophisticated objects than simple full-screen quads. [MeshGrid](https://google.github.io/swissgl/#MeshGrid) demo provides a simple example:

```glsl
    glsl({t, Grid:[5,5], Mesh:[4,4], Aspect:'fit'}, `
    varying vec3 color;
    //VERT
    vec4 vertex() {
        color = hash(ID);
        vec2 pos = (vec2(ID)+0.5+XY*(0.5-0.5/vec2(Mesh+1)));
        pos += sin(UV*TAU+t).yx*0.1;
        return vec4(2.0*pos/vec2(Grid)-1.0, 0.0, 1.0);
    }
    //FRAG
    void fragment() {
        vec2 m = UV*vec2(Mesh);
        float iso = isoline(m.x)+isoline(m.y);
        out0 = vec4(mix(color, vec3(1.0), iso), 1.0);
    }`);
```

## Target specification

The following options control the creation of new textures:

* `size`: `[w,h]` size of the created texture. Also affected by `scale` option. Set to the canvas size by default. Can be modified after the target creation.

* `scale`: scalar. Coefficient applied to `size` before creating the texture. For example the following specification `{scale:1/4}` will create a target that is four times smaller than the canvas frame buffer in each dimension, and is automatically resized on canvas size changes.

* `format`: string, `rgba8`, `r8`, `rgba16f`, `r16f`, `rgba32f`, `r32f` and `depth` are currently supported.

* `data`: `TypedArray` of size and type matching the texture specification. Allows to set the texture content from JS and update it after the texture creation to stream the new data to GPU. See [Spectrogram demo](../demo/Spectrogram.js) for the example.

* `tag`: string that is used to cache the created texture in `glsl.buffers`. Shader `code` is used if not provided.

* `story`: integer. Create an array of textures of the same format instead of a single one. Rendering to such a target rotates the array in place so that the texture last rendered into becomes the element `0`.

* `filter`: `'nearest'` or `'linear'`

* `wrap`: `'repeat'`, `'edge'` or `'mirror'`
