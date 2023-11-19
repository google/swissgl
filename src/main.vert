void main() {
  int rowVertN = Mesh.x * 2 + 3;
  int rowI = VertexID / rowVertN;
  int rowVertI = min(VertexID % rowVertN, rowVertN - 2);
  int odd = rowI % 2;
  if (odd == 0) rowVertI = rowVertN - rowVertI - 2;
  VID = ivec2(rowVertI >> 1, rowI + (rowVertI + odd + 1) % 2);
  int ii = InstanceID;
  ID.x = ii % Grid.x;
  ii /= Grid.x;
  ID.y = ii % Grid.y;
  ii /= Grid.y;
  ID.z = ii;
  UV = vec2(VID) / vec2(Mesh);
  VPos = vec4(XY, 0, 1);
  vertex();
  VPos.xy *= Aspect;
}
