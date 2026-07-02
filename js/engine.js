// ============ VEILBREAK ENGINE — renderer, pixel pass, sky ============
import * as THREE from 'three';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Fullscreen blit shader: nearest-upscale + soft color quantization + vignette
// + the "code leak" scanline tint that intensifies as veil sight grows.
const BLIT_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BLIT_FRAG = `
uniform sampler2D tScene;
uniform float uTime;
uniform float uVeil;      // 0..1 how much the matrix bleeds through
uniform float uGlitch;    // transient glitch burst 0..1
uniform float uQuant;     // palette quantization strength
uniform vec2 uTexel;      // 1 / render-target size
uniform vec3 uTint;       // per-zone color grade tint
uniform float uSat;       // saturation
uniform float uBloom;     // glow strength
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

// 4x4 bayer matrix for retro ordered dithering
float bayer(vec2 p){
  vec2 q = floor(mod(p, 4.0));
  float b = mod(q.x + q.y * 4.0 * fract(q.x * 0.5 + 0.25) + q.y * 2.0, 16.0);
  return (b / 16.0) - 0.5;
}

vec3 tap(vec2 uv){ return pow(max(texture2D(tScene, uv).rgb, vec3(0.0)), vec3(0.4545)); }

void main(){
  vec2 uv = vUv;
  // glitch: horizontal slice displacement
  if(uGlitch > 0.001){
    float band = floor(uv.y * 24.0);
    float r = hash(vec2(band, floor(uTime*18.0)));
    if(r > 1.0 - uGlitch*0.6) uv.x = fract(uv.x + (r - 0.5) * 0.12);
  }
  // linear -> sRGB happens inside tap()
  vec3 col = tap(uv);

  // bloom-lite: pull glow from bright neighbors (5 taps, big offsets = soft halo)
  vec3 nb = tap(uv + vec2( uTexel.x*2.0, 0.0)) + tap(uv - vec2(uTexel.x*2.0, 0.0))
          + tap(uv + vec2(0.0,  uTexel.y*2.0)) + tap(uv - vec2(0.0, uTexel.y*2.0));
  nb *= 0.25;
  float nbLum = dot(nb, vec3(0.299,0.587,0.114));
  col += nb * smoothstep(0.62, 1.0, nbLum) * uBloom;

  // color grade: saturation + tint
  float lum0 = dot(col, vec3(0.299,0.587,0.114));
  col = mix(vec3(lum0), col, uSat) * uTint;

  // ordered dithering hides banding at low palette depth
  float q = mix(48.0, 20.0, uQuant);
  col += bayer(uv / uTexel) / q * 0.9;
  col = floor(col * q + 0.5) / q;

  // subtle green code shimmer in dark areas, scales with veil sight
  float lum = dot(col, vec3(0.299,0.587,0.114));
  float sl = step(0.5, fract(uv.y * 160.0 + uTime * 6.0));
  float leak = uVeil * (1.0 - smoothstep(0.0, 0.45, lum)) * 0.16 * sl;
  col += vec3(0.05, 0.9, 0.35) * leak;

  if(uGlitch > 0.001){
    col.g += uGlitch * 0.25 * hash(uv * 700.0 + uTime);
  }

  // vignette
  float d = distance(uv, vec2(0.5));
  col *= 1.0 - smoothstep(0.55, 0.95, d) * 0.45;

  gl_FragColor = vec4(col, 1.0);
}`;

// Sky dome shader: painterly gradient + drifting clouds + sun glow + stars at night
const SKY_FRAG = `
uniform float uTime;
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uCloud;   // cloud coverage
uniform float uNight;   // 0 day .. 1 night
varying vec3 vDir;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5;} return v; }

void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.05, 1.0);
  vec3 col = mix(uBot, uMid, smoothstep(-0.05, 0.25, h));
  col = mix(col, uTop, smoothstep(0.2, 0.85, h));

  // sun with layered halo
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 220.0) * 1.2 + pow(s, 24.0) * 0.4 + pow(s, 6.0) * 0.18) * (1.0 - uNight);

  // moon rises opposite the sun at night
  float m = max(dot(d, -normalize(uSunDir)), 0.0);
  col += vec3(0.75, 0.82, 1.0) * (pow(m, 500.0) * 1.4 + pow(m, 60.0) * 0.25) * uNight;

  // clouds on a virtual plane
  if(d.y > 0.02){
    vec2 cuv = d.xz / (d.y + 0.15);
    float c = fbm(cuv * 1.6 + vec2(uTime*0.008, uTime*0.004));
    float cl = smoothstep(1.0-uCloud, 1.0-uCloud+0.35, c);
    vec3 cc = mix(vec3(0.98,0.97,0.95), uMid*1.15, 0.35);
    cc = mix(cc, vec3(0.09,0.10,0.16), uNight*0.9);
    col = mix(col, cc, cl * smoothstep(0.02,0.12,d.y) * 0.85);
  }

  // stars
  if(uNight > 0.05 && d.y > 0.0){
    vec2 sp = floor(d.xz/(d.y+0.3)*220.0);
    float st = step(0.997, hash(sp)) * uNight;
    col += vec3(0.8,0.9,1.0) * st * (0.5 + 0.5*sin(uTime*3.0 + hash(sp*1.7)*20.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VERT = `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = (projectionMatrix * mv).xyww; // depth = far
}`;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false; // pixel style fakes shadows with blob discs — huge perf win

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);

    // --- low-res render target for the pixel look ---
    this.pixelScale = 3.4; // world pixels per screen pixel (quality setting adjusts)
    this.rt = new THREE.WebGLRenderTarget(320, 180, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });

    this.blitScene = new THREE.Scene();
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blitMat = new THREE.ShaderMaterial({
      vertexShader: BLIT_VERT, fragmentShader: BLIT_FRAG,
      uniforms: {
        tScene: { value: this.rt.texture },
        uTime: { value: 0 }, uVeil: { value: 0 }, uGlitch: { value: 0 }, uQuant: { value: 0.6 },
        uTexel: { value: new THREE.Vector2(1 / 320, 1 / 180) },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uSat: { value: 1.05 }, uBloom: { value: 0.55 },
      },
    });
    this.blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat));

    // --- lights ---
    this.sun = new THREE.DirectionalLight(0xffeecc, 2.1);
    this.sun.position.set(60, 90, 30);
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbdd8ff, 0x3a4a30, 0.9);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x404050, 0.6);
    this.scene.add(this.amb);

    // --- sky dome ---
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(0x6e8fd0) },
        uMid: { value: new THREE.Color(0xc8d8ee) },
        uBot: { value: new THREE.Color(0xe8e2c8) },
        uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3) },
        uSunColor: { value: new THREE.Color(0xfff2cc) },
        uCloud: { value: 0.5 }, uNight: { value: 0 },
      },
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), this.skyMat);
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    this.scene.fog = new THREE.Fog(0xc8d8ee, 60, 380);

    setMaxAnisotropy(this.renderer);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setPixelScale(s) {
    this.pixelScale = s;
    // finer render = softer palette quantization so texture detail survives
    this.blitMat.uniforms.uQuant.value = s <= 2.2 ? 0.18 : s <= 3.6 ? 0.55 : 0.8;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const rw = Math.max(160, Math.round(w / this.pixelScale));
    const rh = Math.max(90, Math.round(h / this.pixelScale));
    this.rt.setSize(rw, rh);
    this.blitMat?.uniforms.uTexel.value.set(1 / rw, 1 / rh);
  }

  // per-zone color grade
  setGrade(tint, sat, bloom) {
    this.blitMat.uniforms.uTint.value.set(tint);
    this.blitMat.uniforms.uSat.value = sat;
    this.blitMat.uniforms.uBloom.value = bloom;
  }

  // env = { skyTop, skyMid, skyBot, sunColor, sunDir, cloud, night, fogColor, fogNear, fogFar, sunIntensity, hemiSky, hemiGround, hemiIntensity }
  applyEnvironment(env, t = 1) {
    const u = this.skyMat.uniforms;
    u.uTop.value.lerp(new THREE.Color(env.skyTop), t);
    u.uMid.value.lerp(new THREE.Color(env.skyMid), t);
    u.uBot.value.lerp(new THREE.Color(env.skyBot), t);
    u.uSunColor.value.lerp(new THREE.Color(env.sunColor), t);
    u.uSunDir.value.lerp(new THREE.Vector3(...env.sunDir).normalize(), t);
    u.uCloud.value += (env.cloud - u.uCloud.value) * t;
    u.uNight.value += (env.night - u.uNight.value) * t;
    this.sun.color.lerp(new THREE.Color(env.sunColor), t);
    this.sun.intensity += (env.sunIntensity - this.sun.intensity) * t;
    this.sun.position.lerp(new THREE.Vector3(...env.sunDir).normalize().multiplyScalar(120), t);
    this.hemi.color.lerp(new THREE.Color(env.hemiSky), t);
    this.hemi.groundColor.lerp(new THREE.Color(env.hemiGround), t);
    this.hemi.intensity += (env.hemiIntensity - this.hemi.intensity) * t;
    this.scene.fog.color.lerp(new THREE.Color(env.fogColor), t);
    this.scene.fog.near += (env.fogNear - this.scene.fog.near) * t;
    this.scene.fog.far += (env.fogFar - this.scene.fog.far) * t;
  }

  render(time, veil, glitch) {
    this.skyMat.uniforms.uTime.value = time;
    this.blitMat.uniforms.uTime.value = time;
    this.blitMat.uniforms.uVeil.value = veil;
    this.blitMat.uniforms.uGlitch.value = glitch;
    this.skyMesh.position.copy(this.camera.position);
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCam);
  }
}

// ---------- texture cache (CC0 maps from ambientCG, see assets/textures) ----------
const texCache = new Map();
let _maxAniso = 4;
export function setMaxAnisotropy(renderer) {
  _maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
}
export function tex(name, repeat = 1) {
  const key = name + ':' + repeat;
  if (!texCache.has(key)) {
    const t = new THREE.TextureLoader().load(`assets/textures/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = _maxAniso;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

// ---------- shared material cache (painted look; opts.tex adds a real texture map) ----------
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({
      color, flatShading: opts.smooth ? false : true,
      map: opts.tex ? tex(opts.tex, opts.rep ?? 1) : null,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    }));
  }
  return matCache.get(key);
}
// smooth-shaded variant for organic shapes (characters)
export function matS(color, opts = {}) { return mat(color, { ...opts, smooth: true }); }
export function basicMat(color, opts = {}) {
  const key = 'b' + color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshBasicMaterial({
      color, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide, depthWrite: opts.depthWrite ?? true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
  }
  return matCache.get(key);
}

// seeded RNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { THREE };
