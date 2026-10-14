/**
 * 全息面板的 GLSL。
 *
 * 一块贴图 × 一个片元着色器，做完全部"复古科幻"的味道，不加任何几何体：
 *  · 色差（chromatic aberration）：红蓝通道横向错开，错位量**随离中心的半径增长** ——
 *    中心还算清楚、越到边缘越散，这正是全息投影该有的样子
 *  · 进场虚化（uBlur）：淡入期间横向拉开采样距离，画面从一团晃动的光晕收拢成实体；
 *    稳态 uBlur = 0，三次采样几乎重合，等于零开销
 *  · 能量闪烁：低频呼吸 × 高频抖动，再乘一条偶发的"掉帧暗带"（用 step 造），
 *    比单一 flicker 更像一团不稳定的能量
 *  · 保留原来的：横向扫描线、向上扫的亮带、按 alpha 梯度做的边缘描边
 *
 * ⚠️ 三次采样是**共用**的：色差和虚化都只是改采样点的间距，所以加虚化没有额外贴图读取。
 */

export const HOLO_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const HOLO_FRAG = `
uniform sampler2D uMap;
uniform float uTime;
uniform float uFade;
uniform float uBlur;
uniform float uAberration;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  // —— 能量状态：低频呼吸 + 高频抖动 + 偶发掉帧 ——
  float breathe = 0.5 + 0.5 * sin(uTime * 1.7);
  float jitter  = 0.5 + 0.5 * sin(uTime * 37.0) * sin(uTime * 11.0);
  float drop    = smoothstep(0.972, 1.0, sin(uTime * 1.7) * sin(uTime * 0.31));

  // 离中心的距离：色差与虚化都随半径放大（边缘散、中心清）
  float r = length(vUv - 0.5) * 1.42;
  float ab = (uAberration + 0.0018 * breathe) * (0.25 + r);
  float blur = uBlur * (0.30 + r);

  // 三次横向采样：中间当主体，左右各当红/蓝通道的错位层
  vec2 offset = vec2(ab + blur, 0.0);
  vec4 mid   = texture2D(uMap, vUv);
  vec4 left  = texture2D(uMap, vUv - offset);
  vec4 right = texture2D(uMap, vUv + offset);

  vec3 tex = vec3(left.r, mid.g, right.b);
  float alpha = (left.a + mid.a + right.a) / 3.0;
  if (alpha < 0.02) discard;

  float scan = 0.78 + 0.22 * sin(vUv.y * 340.0 - uTime * 7.0);   // 横向扫描线
  float band = smoothstep(0.10, 0.0, abs(fract(vUv.y * 0.5 - uTime * 0.13) - 0.5)); // 向上扫的亮带
  float edge = smoothstep(0.5, 0.0, abs(mid.a - 0.45));           // 半透明处 = 边缘 → 描边发光
  float flicker = (0.90 + 0.10 * jitter) * (1.0 - 0.6 * drop);

  vec3 col = uColor * (0.78 + 0.50 * tex.g)
           + vec3(0.45, 0.85, 1.0) * band * 0.75
           + uColor * edge * 0.95;

  float a = uFade * flicker * alpha * (0.55 + 0.45 * scan) * (0.75 + 0.35 * band);
  gl_FragColor = vec4(col, a);
}
`
