import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";
import { extend, type ThreeElement } from "@react-three/fiber";

/**
 * Material "nebulosa": fbm de simplex noise desplaza los vértices y colorea
 * por bandas de la paleta del proyecto, con rim fresnel para el glow (bloom).
 */
export const NebulaMaterial = shaderMaterial(
  {
    uTime: 0,
    uSeed: 0,
    uSpeed: 0.3,
    uNoiseScale: 2.0,
    uDistortion: 0.25,
    uGlow: 0.5,
    uColorCount: 4,
    uColorA: new THREE.Color("#3178c6"),
    uColorB: new THREE.Color("#f1e05a"),
    uColorC: new THREE.Color("#663399"),
    uColorD: new THREE.Color("#e34c26"),
    uFlat: 0, // 1 = low-poly facetado (crystal)
  },
  /* glsl vertex */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uSpeed;
  uniform float uNoiseScale;
  uniform float uDistortion;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vNoise;

  // Simplex noise 3D (Ashima / Stefan Gustavson, dominio público)
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float f = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 4; i++) {
      f += amp * snoise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return f;
  }

  void main() {
    float t = uTime * uSpeed;
    vec3 p = position * uNoiseScale + vec3(uSeed);
    float n = fbm(p + vec3(t * 0.6, t * 0.4, t * 0.3));
    vNoise = n;
    vec3 displaced = position + normal * n * uDistortion;
    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
  `,
  /* glsl fragment */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uSpeed;
  uniform int uColorCount;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  uniform float uFlat;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vNoise;

  vec3 paletteMix(float x) {
    x = clamp(x, 0.0, 1.0);
    if (uColorCount <= 1) return uColorA;
    float span = float(uColorCount - 1);
    float seg = x * span;
    int idx = int(floor(seg));
    float f = fract(seg);
    vec3 c0 = idx == 0 ? uColorA : idx == 1 ? uColorB : idx == 2 ? uColorC : uColorD;
    vec3 c1 = idx == 0 ? uColorB : idx == 1 ? uColorC : uColorD;
    return mix(c0, c1, smoothstep(0.0, 1.0, f));
  }

  void main() {
    vec3 normal = vNormal;
    if (uFlat > 0.5) {
      normal = normalize(cross(dFdx(vViewDir), dFdy(vViewDir)));
    }
    float band = vNoise * 0.5 + 0.5;
    // deriva lenta del color para que el orbe "viva"
    band = fract(band + uTime * uSpeed * 0.02);
    vec3 base = paletteMix(band);

    float diffuse = 0.55 + 0.45 * max(dot(normal, normalize(vec3(0.6, 0.8, 0.4))), 0.0);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.2);

    vec3 color = base * diffuse + base * fresnel * (1.2 + uGlow * 2.2);
    // núcleo levemente emisivo para alimentar el bloom
    color += base * uGlow * 0.25;
    gl_FragColor = vec4(color, 1.0);
  }
  `,
);

extend({ NebulaMaterial });

type NebulaMaterialImpl = InstanceType<typeof NebulaMaterial> & {
  uTime: number;
  uSeed: number;
  uSpeed: number;
  uNoiseScale: number;
  uDistortion: number;
  uGlow: number;
  uColorCount: number;
  uColorA: THREE.Color;
  uColorB: THREE.Color;
  uColorC: THREE.Color;
  uColorD: THREE.Color;
  uFlat: number;
};

declare module "@react-three/fiber" {
  interface ThreeElements {
    nebulaMaterial: ThreeElement<typeof NebulaMaterial>;
  }
}

export type { NebulaMaterialImpl };
