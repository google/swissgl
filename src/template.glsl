uniform ivec3 Grid;
uniform ivec2 Mesh;
uniform ivec4 View;
#define ViewSize (View.zw)
uniform vec2 Aspect;
varying vec2 UV;
#define XY (2.0 * UV - 1.0)
// #define VertexID gl_VertexID
// #define InstanceID gl_InstanceID

//////// GLSL Utils ////////

const float PI = radians(180.0);
const float TAU = radians(360.0);

// source: https://www.shadertoy.com/view/XlXcW4
// TODO more complete hash library
vec3 hash(ivec3 ix) {
  uvec3 x = uvec3(ix);
  const uint k = 1103515245U;
  x = ((x >> 8U) ^ x.yzx) * k;
  x = ((x >> 8U) ^ x.yzx) * k;
  x = ((x >> 8U) ^ x.yzx) * k;
  return vec3(x) * (1.0 / float(0xffffffffU));
}

mat2 rot2(float a) {
  float s = sin(a),
    c = cos(a);
  return mat2(c, s, -s, c);
}

// https://suricrasia.online/demoscene/functions/
vec3 erot(vec3 p, vec3 ax, float ro) {
  return mix(dot(ax, p) * ax, p, cos(ro)) + cross(ax, p) * sin(ro);
}

vec3 uv2sphere(vec2 uv) {
  uv *= vec2(-TAU, PI);
  return vec3(vec2(cos(uv.x), sin(uv.x)) * sin(uv.y), cos(uv.y));
}

vec3 torus(vec2 uv, float r1, float r2) {
  uv *= TAU;
  vec3 p = vec3(r1 + cos(uv.x) * r2, 0, sin(uv.x) * r2);
  return vec3(p.xy * rot2(uv.y), p.z);
}

vec3 cubeVert(vec2 xy, int side) {
  float x = xy.x,
    y = xy.y;
  switch (side) {
    case 0:
      return vec3(x, y, 1);
    case 1:
      return vec3(y, x, -1);
    case 2:
      return vec3(y, 1, x);
    case 3:
      return vec3(x, -1, y);
    case 4:
      return vec3(1, x, y);
    case 5:
      return vec3(-1, y, x);
  }
  ;
  return vec3(0.0);
}

vec3 _surf_f(vec3 p, vec3 a, vec3 b, out vec3 normal) {
  normal = normalize(cross(a - p, b - p));
  return p;
}
#define SURF(f, uv, out_normal, eps)                                                               \
  (_surf_f(f(uv), f((uv) + vec2(eps, 0)), f((uv) + vec2(0, eps)), out_normal))

vec4 _sample(sampler2D tex, vec2 uv) {
  return texture(tex, uv);
}
vec4 _sample(sampler2D tex, ivec2 xy) {
  return texelFetch(tex, xy, 0);
}
vec4 _sample(sampler2DArray tex, vec2 uv, int layer) {
  return texture(tex, vec3(uv, layer));
}
vec4 _sample(sampler2DArray tex, ivec2 xy, int layer) {
  return texelFetch(tex, ivec3(xy, layer), 0);
}

#ifdef FRAG
float isoline(float v) {
  float distToInt = abs(v - round(v));
  return smoothstep(max(fwidth(v), 0.0001), 0.0, distToInt);
}
float wireframe() {
  vec2 m = UV * vec2(Mesh);
  float d1 = isoline(m.x - m.y),
    d2 = isoline(m.x + m.y);
  float d = mix(d1, d2, float(int(m.y) % 2));
  return isoline(m.x) + isoline(m.y) + d;
}
#endif
