// Numerical camera operations; no animation clock or input ownership.
export function perspective(fov, aspect, near, far, out = new Float32Array(16)) {
  out.fill(0);
  const f = 1 / Math.tan(fov * Math.PI / 360);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) / (near - far);
  out[11] = -1; out[14] = 2 * far * near / (near - far);
  return out;
}
export function lookAtOrigin(x, y, z, out = new Float32Array(16)) {
  const length = Math.hypot(x, y, z);
  if (!length) throw new Error('Field camera cannot occupy its target');
  const zx = x / length, zy = y / length, zz = z / length;
  let xx = zz, xz = -zx, xl = Math.hypot(xx, xz);
  if (!xl) { xx = 1; xz = 0; xl = 1; }
  xx /= xl; xz /= xl;
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
  out.set([xx, yx, zx, 0, 0, yy, zy, 0, xz, yz, zz, 0,
    -(xx*x+xz*z), -(yx*x+yy*y+yz*z), -(zx*x+zy*y+zz*z), 1]);
  return out;
}
export function srgbToLinear(value) {
  return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
}
export function sampleField(model, index, blend, out) {
  const presets = model.field.presets;
  const i = Math.max(0, Math.min(presets.length - 1, Math.floor(index)));
  const a = presets[i], b = presets[Math.min(i + 1, presets.length - 1)];
  const t = Math.max(0, Math.min(1, blend));
  for (const key of model.field.keys) out[key] = a[key] + (b[key] - a[key]) * t;
  for (const key of ['deep', 'mid', 'hot']) for (let c = 0; c < 3; c++) out[key][c] = a[key][c] + (b[key][c] - a[key][c]) * t;
  return out;
}
export function mipSizes(width, height, levels) {
  const result = [];
  for (let i = 0; i < levels; i++) {
    width = Math.max(1, Math.round(width / 2)); height = Math.max(1, Math.round(height / 2));
    result.push([width, height]);
  }
  return result;
}
