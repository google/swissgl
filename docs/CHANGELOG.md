# Changelog

### 2023-03-08
* `Grid` can be 3D ([ColorCube](https://google.github.io/swissgl/#ColorCube) example)

### 2023-03-02
* `depth` texture format
* removed `Perspective` option

### 2023-03-01
* Mesh rows alternate diagonal direction (see [MeshGrid](https://google.github.io/swissgl/#MeshGrid) example)
* [wireframe()](https://github.com/google/swissgl/blob/8cf8cac20c4ec3352fec639c8d22dc5814d5e674/swissgl.js#L201) helper

### 2023-02-27
* [CubeDeform](../demo/CubeDeform.js) example
* `SURF(f)` macro to estimate surface normal
* `cubeVert` function to simplify cube creation

### 2023-02-25
* (breaking) removed `uv` argument from `vertex()`
* (breaking) **removed** `P`, added `UV` and `XY` special variables
* (breaking) `float isoline(float v)` function (available in fragment shaders)
* [MeshGrid](../demo/MeshGrid.js) example

### 2023-02-22
* `'mirror'` (`gl.MIRRORED_REPEAT`) texture wrapping mode ([commit](https://github.com/google/swissgl/commit/d690e94fff35766b5a6358d96a4b7d6c59cff166))