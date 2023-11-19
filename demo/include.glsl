uniform bool xrMode;
uniform mat4 xrProjectionMatrix, xrViewMatrix;
uniform mat4 xrRay[2], xrRayInv[2];
uniform vec4 xrButton[2];
uniform vec3 xrPosition;
uniform vec3 cameraYPD;

vec3 cameraPos() {
  if (xrMode) return xrPosition;
  vec3 p = vec3(0, 0, cameraYPD.z);
  p.yz *= rot2(-cameraYPD.y);
  p.xy *= rot2(-cameraYPD.x);
  return p;
}

vec4 wld2view(vec4 p) {
  if (xrMode) return xrViewMatrix * p;
  p.xy *= rot2(cameraYPD.x);
  p.yz *= rot2(cameraYPD.y);
  p.z -= cameraYPD.z;
  return p;
}

vec4 view2proj(vec4 p) {
  if (xrMode) return xrProjectionMatrix * p;
  const float near = 0.1,
    far = 10.0,
    fov = 1.0;
  return vec4(p.xy / tan(fov / 2.0), (p.z * (near + far) + 2.0 * near * far) / (near - far), -p.z);
}

vec4 wld2proj(vec4 p) {
  return view2proj(wld2view(p));
}

vec4 wld2proj(vec3 p) {
  return wld2proj(vec4(p, 1.0));
}
