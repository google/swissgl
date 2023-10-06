# Changelog

### 2023-09-12

- Async texture fetch support (see (FancyLenia)[https://google.github.io/swissgl/#FancyLenia] demo)

### 2023-09-07

- Samplers support (see [TextureSamplers](https://google.github.io/swissgl/#TextureSamplers) demo)

### 2023-08-25

- `varying`'s can be declared in-place in `VP` arguments
- `glsl.adjustCanvas()` should be explicitly called in `glsl.loop()` callback

### 2023-08-11

- `glsl.adjustCanvas()` helper
- `glsl.loop()` helper
- [`tiny.html`](https://google.github.io/swissgl/tiny.html) minimalistic example

### 2023-08-05

- [Physarum3d](https://google.github.io/swissgl/#Physarum3d) demo

### 2023-07-11

- **(breaking)** Default texture filtering is now `nearest`. This is a workaround for iOS devices, where `texelFetch` stopped working for float32 textures when filtering is `linear`.

### 2023-06-19

- **(breaking)** `VOut` -> `VPos`

### 2023-06-15

- `readSync` method for fetching textures to CPU

### 2023-06-09

- `[DotCamera](https://google.github.io/swissgl/#DotCamera) example

### 2023-05-15

- `[ReactionDiffusion](https://google.github.io/swissgl/#ReactionDiffusion) example

### 2023-05-12

- `[Springs](https://google.github.io/swissgl/#Springs) example

### 2023-04-30

- Array uniforms support (https://github.com/google/swissgl/issues/4), see [NeuralCA.js](https://github.com/google/swissgl/blob/main/demo/NeuralCA.js) for the usage example

### 2023-04-28

- Depth attachments (`depth` texture format and target parameter)
- Texture arrays (`layern` target parameter)
- [DeferredShading](https://google.github.io/swissgl/#DeferredShading) example

### 2023-03-19

- **(breaking)** removed `code` argument. Shader is passed through `VP`, `FP` and `Inc` parameters. Shortcut syntax can be used in `VP` and `FP` independently.
- **(breaking)** `vertex()` function now returns `void`, output should be written into `vec4 VPos` variable. `fragment()` output now should be stored in `vec4 FOut`.
- **(breaking)** `tag` attribute it now obligatory for newly created render targets.

### 2023-03-16

- WebXR support in the demo

### 2023-03-13

- [ParticleLife3d](https://google.github.io/swissgl/#ParticleLife3d) example
- replaced `includes` mechanism with hooks

### 2023-03-10

- `VERT`/`FRAG` defines
- `torus()` glsl function
- `Face` option to control face culling
- [Shadowmap](https://google.github.io/swissgl/#Shadowmap) example

### 2023-03-08

- `Grid` can be 3D ([ColorCube](https://google.github.io/swissgl/#ColorCube) example)

### 2023-03-02

- `depth` texture format
- removed `Perspective` option

### 2023-03-01

- Mesh rows alternate diagonal direction (see [MeshGrid](https://google.github.io/swissgl/#MeshGrid) example)
- [wireframe()](https://github.com/google/swissgl/blob/8cf8cac20c4ec3352fec639c8d22dc5814d5e674/swissgl.js#L201) helper

### 2023-02-27

- [CubeDeform](../demo/CubeDeform.js) example
- `SURF(f)` macro to estimate surface normal
- `cubeVert` function to simplify cube creation

### 2023-02-25

- (breaking) removed `uv` argument from `vertex()`
- (breaking) **removed** `P`, added `UV` and `XY` special variables
- (breaking) `float isoline(float v)` function (available in fragment shaders)
- [MeshGrid](../demo/MeshGrid.js) example

### 2023-02-22

- `'mirror'` (`gl.MIRRORED_REPEAT`) texture wrapping mode ([commit](https://github.com/google/swissgl/commit/d690e94fff35766b5a6358d96a4b7d6c59cff166))
