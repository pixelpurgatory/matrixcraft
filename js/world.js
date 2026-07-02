// ============ WORLD BUILDER — terrain, roads, villages, castles, landmarks ============
import { THREE, mat, basicMat, rng } from './engine.js';
import { ZONES } from './data_world.js';

// ---------- noise ----------
function makeNoise(seed) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
      THREE.MathUtils.lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v);
  }
  return (x, y, oct = 4) => {
    let v = 0, amp = 1, f = 1, max = 0;
    for (let i = 0; i < oct; i++) { v += noise2(x * f, y * f) * amp; max += amp; amp *= 0.5; f *= 2; }
    return v / max;
  };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.landmarks = {};
    this.colliders = [];   // {x,z,r} cylinders to block movement
    this.interactables = []; // {pos, kind, data, radius}
    this.animated = [];    // objects with .tick(dt,t)
    this.zoneId = null;
    this.noise = null;
    this.size = 420;
  }

  groundH(x, z) {
    if (!this.noise) return 0;
    if (this.flat) return 0;
    const s = this.size;
    // gentle falloff to edges (bowl rim = mountains)
    const nx = x / s, nz = z / s;
    let h = this.noise(nx * 6 + 10, nz * 6 + 10, 4) * 9;
    const edge = Math.max(Math.abs(nx), Math.abs(nz)) * 2; // 0 center .. 1 edge
    h += Math.pow(Math.max(0, edge - 0.72) / 0.28, 2) * 55; // rim mountains
    // flatten roads/POIs
    for (const f of this.flattens || []) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r) {
        const t = 1 - THREE.MathUtils.smoothstep(d / f.r, 0.55, 1);
        h = THREE.MathUtils.lerp(h, f.h, t);
      }
    }
    return h;
  }

  clear() {
    this.root.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose?.(); });
    this.root.clear();
    this.colliders = []; this.interactables = []; this.animated = []; this.landmarks = {};
    this.flat = false;
  }

  // =====================================================
  build(zoneId) {
    this.clear();
    this.zoneId = zoneId;
    const Z = ZONES[zoneId];
    this.noise = makeNoise(Z.seed);
    this.size = Z.size;
    const R = rng(Z.seed * 7 + 1);

    // ---------- landmark layout (hand-designed rings) ----------
    const L = this.landmarks;
    if (zoneId === 'eldergreen') {
      L.spawn = { x: 0, z: 40 };
      L.village = { x: 0, z: 0 };
      L.village_gate = { x: 0, z: 22 };
      L.well = { x: 8, z: -6 };
      L.windmill = { x: -38, z: -20 };
      L.crossroads = { x: 50, z: 60 };
      L.castle = { x: -10, z: -150 };
      L.dg_hollowroot = { x: 120, z: -70 };
      L.dg_drownedcrypt = { x: -95, z: 65 };
      L.dg_aldermoor = { x: -10, z: -132 };
      L.pond = { x: -70, z: 40 };
    } else if (zoneId === 'ashmoor') {
      L.spawn = { x: 0, z: 150 };
      L.village = { x: 0, z: 60 };       // city plaza
      L.plaza = { x: 0, z: 60 };
      L.graveyard = { x: 80, z: 20 };
      L.alley = { x: -28, z: 40 };
      L.cathedral_gate = { x: 0, z: -40 };
      L.castle = { x: 0, z: -120 };      // the rookery tower backdrop
      L.dg_plaguewarrens = { x: 110, z: 90 };
      L.dg_gallows = { x: 0, z: -58 };
      L.dg_rookery = { x: 0, z: -135 };
    } else {
      L.spawn = { x: 0, z: 160 };
      L.camp = { x: 0, z: 110 };
      L.village = { x: 0, z: 110 };
      L.castle = { x: 0, z: -140 };      // the spire
      L.dg_frosthold = { x: -100, z: -20 };
      L.dg_undercode = { x: 95, z: -45 };
      L.dg_spire = { x: 0, z: -122 };
    }

    // flatten around landmarks
    this.flattens = [];
    for (const k of Object.keys(L)) {
      const base = (k === 'castle') ? 14 : 0.5;
      this.flattens.push({ x: L[k].x, z: L[k].z, r: k === 'village' ? 42 : 24, h: base });
    }

    // ---------- terrain ----------
    const segs = 110;
    const geo = new THREE.PlaneGeometry(this.size, this.size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cBase = new THREE.Color(Z.ground.base), cHi = new THREE.Color(Z.ground.hi),
          cLow = new THREE.Color(Z.ground.low), cPath = new THREE.Color(Z.ground.path);
    // main road: from spawn through village toward castle + branches to dungeons
    const roadPts = this._roadPoints(L);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.groundH(x, z);
      pos.setY(i, h);
      const n = this.noise(x * 0.05 + 99, z * 0.05 + 99, 3);
      tmp.copy(cBase).lerp(h > 20 ? new THREE.Color(0xffffff) : cHi, THREE.MathUtils.clamp((h - 2) / 22, 0, 1));
      if (n < -0.15) tmp.lerp(cLow, 0.6);
      // road tint
      let dRoad = Infinity;
      for (const rp of roadPts) { const d = Math.hypot(x - rp.x, z - rp.z); if (d < dRoad) dRoad = d; }
      if (dRoad < 4.5) tmp.lerp(cPath, 0.85 - dRoad / 6);
      // per-vertex dither for painted look
      const dith = (this.noise(x * 0.6, z * 0.6, 2)) * 0.07;
      tmp.r += dith; tmp.g += dith; tmp.b += dith;
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.root.add(ground);

    // ---------- water ----------
    if (L.pond) {
      const water = new THREE.Mesh(new THREE.CircleGeometry(26, 20),
        new THREE.MeshLambertMaterial({ color: 0x3a6a8a, transparent: true, opacity: 0.8 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(L.pond.x, 0.25, L.pond.z);
      this.root.add(water);
      this.animated.push({ tick: (dt, t) => { water.position.y = 0.25 + Math.sin(t * 0.8) * 0.05; } });
    }

    // ---------- vegetation (instanced) ----------
    this._vegetation(Z, R, L);

    // ---------- structures per zone ----------
    if (zoneId === 'eldergreen') this._buildEldergreen(L, R);
    if (zoneId === 'ashmoor') this._buildAshmoor(L, R);
    if (zoneId === 'veilspire') this._buildVeilspire(L, R);

    // ---------- dungeon entrance portals ----------
    for (const key of Object.keys(L)) {
      if (!key.startsWith('dg_')) continue;
      this._portal(L[key], key.slice(3), Z);
    }

    // ---------- ambient particles ----------
    this._particles(zoneId);
    return this;
  }

  _roadPoints(L) {
    const pts = [];
    const addPath = (a, b) => {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const wob = Math.sin(t * 7 + a.x) * 4;
        pts.push({ x: THREE.MathUtils.lerp(a.x, b.x, t) + wob, z: THREE.MathUtils.lerp(a.z, b.z, t) });
      }
    };
    if (L.spawn && L.village) addPath(L.spawn, L.village);
    if (L.village && L.castle) addPath(L.village, L.castle);
    for (const k of Object.keys(L)) if (k.startsWith('dg_')) addPath(L.village, L[k]);
    if (L.crossroads) addPath(L.village, L.crossroads);
    return pts;
  }

  _vegetation(Z, R, L) {
    const count = 700;
    const biome = Z.biome;
    // tree archetype geometry per biome
    let trunkGeo, crownGeo, crownMat, trunkMat, crownMat2;
    trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 5);
    trunkMat = mat(biome === 'gothic' ? 0x3a332e : 0x4a3524);
    if (biome === 'fairytale') { crownGeo = new THREE.IcosahedronGeometry(2.2, 0); crownMat = mat(0x3f7a2f); crownMat2 = mat(0x578f3a); }
    else if (biome === 'gothic') { crownGeo = new THREE.IcosahedronGeometry(1.6, 0); crownMat = mat(0x4a4238); crownMat2 = mat(0x5d4a3a); }
    else { crownGeo = new THREE.ConeGeometry(1.8, 4.5, 6); crownMat = mat(0x2e4a3e); crownMat2 = mat(0x3a5a4a); }

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
    const crowns2 = new THREE.InstancedMesh(crownGeo, crownMat2, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    let n1 = 0, n2 = 0, nt = 0;
    const safe = Object.values(L);
    for (let i = 0; i < count * 3 && nt < count; i++) {
      const x = (R() - 0.5) * this.size * 0.92, z = (R() - 0.5) * this.size * 0.92;
      if (safe.some(s => Math.hypot(x - s.x, z - s.z) < 26)) continue;
      const h = this.groundH(x, z);
      if (h > 26) continue;
      const density = this.noise(x * 0.02, z * 0.02, 2);
      if (density < (biome === 'gothic' ? 0.1 : -0.05)) continue;
      const s = 0.8 + R() * 0.9;
      q.setFromEuler(new THREE.Euler(0, R() * 6.28, (R() - 0.5) * 0.08));
      pv.set(x, h + 1.4 * s, z); sc.set(s, s, s);
      m4.compose(pv, q, sc); trunks.setMatrixAt(nt, m4);
      pv.y = h + (biome === 'storm' ? 4.2 : 3.6) * s;
      m4.compose(pv, q, sc);
      if (R() > 0.5) crowns.setMatrixAt(n1++, m4); else crowns2.setMatrixAt(n2++, m4);
      nt++;
      if (s > 0.9) this.colliders.push({ x, z, r: 0.7 * s });
    }
    trunks.count = nt; crowns.count = n1; crowns2.count = n2;
    this.root.add(trunks, crowns, crowns2);

    // rocks
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, mat(Z.biome === 'storm' ? 0x6a7484 : 0x7a7468), 120);
    let nr = 0;
    for (let i = 0; i < 300 && nr < 120; i++) {
      const x = (R() - 0.5) * this.size * 0.9, z = (R() - 0.5) * this.size * 0.9;
      if (safe.some(s => Math.hypot(x - s.x, z - s.z) < 20)) continue;
      const h = this.groundH(x, z);
      const s = 0.4 + R() * 1.4;
      q.setFromEuler(new THREE.Euler(R(), R() * 6, R()));
      pv.set(x, h + s * 0.3, z); sc.set(s, s * 0.7, s);
      m4.compose(pv, q, sc); rocks.setMatrixAt(nr++, m4);
      if (s > 1.1) this.colliders.push({ x, z, r: s * 0.8 });
    }
    rocks.count = nr;
    this.root.add(rocks);

    // grass tufts / snow sparkles as points
    if (biome !== 'gothic') {
      const g = new THREE.BufferGeometry();
      const N = 900, arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const x = (R() - 0.5) * this.size * 0.9, z = (R() - 0.5) * this.size * 0.9;
        arr[i * 3] = x; arr[i * 3 + 1] = this.groundH(x, z) + 0.25; arr[i * 3 + 2] = z;
      }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({
        color: biome === 'storm' ? 0xdde8f5 : 0x86c655, size: 0.35, sizeAttenuation: true }));
      this.root.add(pts);
    }
  }

  // ---------- building blocks ----------
  _box(w, h, d, color, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z); m.rotation.y = ry;
    this.root.add(m);
    return m;
  }

  _house(x, z, R, opts = {}) {
    const gh = this.groundH(x, z);
    const w = 5 + R() * 3, d = 5 + R() * 2, h = 3 + R() * 1;
    const wall = opts.wall ?? 0xc9b892, roof = opts.roof ?? 0x8a4a2a;
    const ry = R() * Math.PI * 2;
    const g = new THREE.Group(); g.position.set(x, gh, z); g.rotation.y = ry;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wall)); base.position.y = h / 2; g.add(base);
    // timber frame
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1), mat(0x5a4028)); beam.position.y = h; g.add(beam);
    const roofM = new THREE.Mesh(new THREE.CylinderGeometry(0.01, d * 0.75, h * 0.9, 4, 1), mat(roof));
    roofM.rotation.y = Math.PI / 4; roofM.scale.x = w / d;
    roofM.position.y = h + h * 0.45; g.add(roofM);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.15), mat(0x4a3018)); door.position.set(0, 0.9, d / 2 + 0.05); g.add(door);
    // warm window light
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), basicMat(0xffd88a)); win.position.set(w / 4, h * 0.6, d / 2 + 0.05); g.add(win);
    this.root.add(g);
    this.colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
    return g;
  }

  _tower(x, z, h, r, color, roofColor) {
    const gh = this.groundH(x, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 8), mat(color));
    t.position.set(x, gh + h / 2, z); this.root.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, h * 0.4, 8), mat(roofColor));
    roof.position.set(x, gh + h + h * 0.2, z); this.root.add(roof);
    // lit windows
    for (let i = 0; i < 3; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.1), basicMat(0xffe9a8));
      const a = i * 2.1;
      win.position.set(x + Math.cos(a) * r, gh + h * (0.4 + i * 0.2), z + Math.sin(a) * r);
      win.lookAt(x + Math.cos(a) * (r + 1), win.position.y, z + Math.sin(a) * (r + 1));
      this.root.add(win);
    }
    this.colliders.push({ x, z, r: r * 1.2 });
    return t;
  }

  _castle(cx, cz, opts = {}) {
    const scale = opts.scale ?? 1;
    const stone = opts.stone ?? 0x5a5f78, roof = opts.roof ?? 0x35395a;
    const gh = this.groundH(cx, cz);
    // curtain walls (4 segments) + corner towers + huge keep
    const wallLen = 46 * scale, wallH = 10 * scale;
    for (const [dx, dz, ry] of [[0, wallLen / 2, 0], [0, -wallLen / 2, 0], [wallLen / 2, 0, Math.PI / 2], [-wallLen / 2, 0, Math.PI / 2]]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(wallLen, wallH, 3), mat(stone));
      w.position.set(cx + dx, gh + wallH / 2, cz + dz); w.rotation.y = ry; this.root.add(w);
      // crenellations
      const cren = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 1.4, 3.6), mat(stone));
      cren.position.set(cx + dx, gh + wallH + 0.7, cz + dz); cren.rotation.y = ry; this.root.add(cren);
    }
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      this._tower(cx + dx * wallLen / 2, cz + dz * wallLen / 2, 16 * scale, 3.4 * scale, stone, roof);
    // keep: layered blocks + spires (silhouette from the screenshot)
    const keep = new THREE.Mesh(new THREE.BoxGeometry(20 * scale, 22 * scale, 16 * scale), mat(stone));
    keep.position.set(cx, gh + 11 * scale, cz); this.root.add(keep);
    const keep2 = new THREE.Mesh(new THREE.BoxGeometry(12 * scale, 32 * scale, 10 * scale), mat(stone));
    keep2.position.set(cx, gh + 16 * scale, cz - 2); this.root.add(keep2);
    this._towerAt(cx - 8 * scale, cz + 4, gh, 34 * scale, 2.6 * scale, stone, roof);
    this._towerAt(cx + 8 * scale, cz + 4, gh, 30 * scale, 2.4 * scale, stone, roof);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.4 * scale, 16 * scale, 8), mat(roof));
    spire.position.set(cx, gh + 32 * scale + 8 * scale, cz - 2); this.root.add(spire);
    // glowing keep windows
    for (let i = 0; i < 6; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.1), basicMat(0xfff2b0));
      win.position.set(cx - 4 + (i % 3) * 4, gh + 14 * scale + Math.floor(i / 3) * 6, cz + 8 * scale + 0.1);
      this.root.add(win);
    }
    this.colliders.push({ x: cx, z: cz, r: 14 * scale });
  }

  _towerAt(x, z, gh, h, r, color, roofColor) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 8), mat(color));
    t.position.set(x, gh + h / 2, z); this.root.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.4, h * 0.3, 8), mat(roofColor));
    roof.position.set(x, gh + h + h * 0.15, z); this.root.add(roof);
  }

  _windmill(x, z) {
    const gh = this.groundH(x, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 9, 8), mat(0xd8cba8));
    body.position.set(x, gh + 4.5, z); this.root.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.4, 8), mat(0x7a4a2a));
    roof.position.set(x, gh + 10.2, z); this.root.add(roof);
    const hub = new THREE.Group(); hub.position.set(x, gh + 8.4, z + 2.6); this.root.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.12), mat(0xe8e0c8));
      blade.position.y = 3.5;
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(blade); hub.add(arm);
    }
    this.animated.push({ tick: (dt) => hub.rotation.z += dt * 0.5 });
    this.colliders.push({ x, z, r: 3.6 });
  }

  _gravestones(cx, cz, R, n = 26) {
    const geo = new THREE.BoxGeometry(0.7, 1.1, 0.18);
    const im = new THREE.InstancedMesh(geo, mat(0x767c72), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = 4 + R() * 18;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3));
      p.set(x, this.groundH(x, z) + 0.5, z);
      m4.compose(p, q, s); im.setMatrixAt(i, m4);
    }
    this.root.add(im);
  }

  _campfire(x, z) {
    const gh = this.groundH(x, z);
    const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.3, 7), mat(0x4a3018));
    logs.position.set(x, gh + 0.15, z); this.root.add(logs);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 6), basicMat(0xffa030, { transparent: true, opacity: 0.9 }));
    flame.position.set(x, gh + 0.9, z); this.root.add(flame);
    const light = new THREE.PointLight(0xff9040, 1.6, 16); light.position.set(x, gh + 1.6, z); this.root.add(light);
    this.animated.push({ tick: (dt, t) => {
      flame.scale.setScalar(0.85 + Math.sin(t * 11 + x) * 0.15);
      light.intensity = 1.4 + Math.sin(t * 9 + z) * 0.35;
    } });
  }

  _tent(x, z, R, color = 0x6a5a40) {
    const gh = this.groundH(x, z);
    const t = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 4), mat(color));
    t.position.set(x, gh + 1.3, z); t.rotation.y = R() * 3; this.root.add(t);
    this.colliders.push({ x, z, r: 1.8 });
  }

  _portal(spot, dgId, Z) {
    const gh = this.groundH(spot.x, spot.z);
    const g = new THREE.Group(); g.position.set(spot.x, gh, spot.z);
    // stone arch
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5, 0.9), mat(0x4a4a52)); l.position.set(-2, 2.5, 0); g.add(l);
    const r2 = l.clone(); r2.position.x = 2; g.add(r2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.9, 0.9), mat(0x4a4a52)); top.position.y = 5.2; g.add(top);
    // swirling veil
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.4),
      new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.34, side: THREE.DoubleSide }));
    veil.position.y = 2.4; g.add(veil);
    const glow = new THREE.PointLight(0x39ff88, 1.2, 14); glow.position.y = 3; g.add(glow);
    this.root.add(g);
    this.animated.push({ tick: (dt, t) => {
      veil.material.opacity = 0.26 + Math.sin(t * 2.2 + spot.x) * 0.1;
      veil.rotation.y = Math.sin(t * 0.4) * 0.2;
    } });
    this.interactables.push({ x: spot.x, z: spot.z, radius: 4.5, kind: 'dungeon', data: dgId });
  }

  _loreTerminal(x, z, fragId) {
    const gh = this.groundH(x, z);
    const g = new THREE.Group(); g.position.set(x, gh, z);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.5), mat(0x1a2620)); pillar.position.y = 0.8; g.add(pillar);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), basicMat(0x39ff88)); screen.position.set(0, 1.2, 0.26); g.add(screen);
    const glow = new THREE.PointLight(0x39ff88, 0.8, 6); glow.position.y = 1.4; g.add(glow);
    this.root.add(g);
    this.animated.push({ tick: (dt, t) => { screen.material.opacity = 1; glow.intensity = 0.6 + Math.sin(t * 6 + x) * 0.3; } });
    this.interactables.push({ x, z, radius: 3, kind: 'lore', data: fragId });
  }

  _well(x, z) {
    const gh = this.groundH(x, z);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1, 8), mat(0x8a8578));
    ring.position.set(x, gh + 0.5, z); this.root.add(ring);
    const roofL = this._box(0.16, 2.2, 0.16, 0x5a4028, x - 1, gh + 1.6, z);
    const roofR = this._box(0.16, 2.2, 0.16, 0x5a4028, x + 1, gh + 1.6, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1, 4), mat(0x7a4a2a));
    roof.position.set(x, gh + 3, z); roof.rotation.y = Math.PI / 4; this.root.add(roof);
    this.colliders.push({ x, z, r: 1.4 });
  }

  // ============ ZONE BUILDS ============
  _buildEldergreen(L, R) {
    // village: ring of cottages around a square
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      this._house(L.village.x + Math.cos(a) * 16, L.village.z + Math.sin(a) * 16, R);
    }
    this._well(L.well.x, L.well.z);
    this._windmill(L.windmill.x, L.windmill.z);
    this._campfire(L.village.x + 4, L.village.z + 6);
    // gate posts
    this._box(1, 4, 1, 0x5a4028, -3, this.groundH(-3, 24) + 2, 24);
    this._box(1, 4, 1, 0x5a4028, 3, this.groundH(3, 24) + 2, 24);
    // the castle on the hill (backdrop + raid entrance)
    this.flattens.push({ x: L.castle.x, z: L.castle.z, r: 60, h: 14 });
    this._castle(L.castle.x, L.castle.z, { stone: 0x646a8c, roof: 0x3c4066, scale: 1.3 });
    // scattered farms
    this._house(40, 20, R); this._house(56, 44, R); this._house(-52, -48, R, { wall: 0xd0c0a0 });
    // lore terminals (subtle, tucked away)
    this._loreTerminal(66, 74, 'lf1');
    this._loreTerminal(-88, 58, 'lf2');
    this._loreTerminal(118, -62, 'lf3');
  }

  _buildAshmoor(L, R) {
    // ruined city grid around plaza
    for (let gx = -2; gx <= 2; gx++) for (let gz = -1; gz <= 2; gz++) {
      if (Math.abs(gx) < 1 && gz >= 0 && gz <= 1) continue; // plaza clearing
      if (R() < 0.25) continue;
      this._house(L.plaza.x + gx * 18 + (R() - 0.5) * 5, L.plaza.z + gz * 18 - 18 + (R() - 0.5) * 5, R,
        { wall: 0x6e6a5e, roof: 0x3a3f45 });
    }
    // broken walls
    for (let i = 0; i < 10; i++) {
      const a = R() * Math.PI * 2, d = 30 + R() * 50;
      const x = L.plaza.x + Math.cos(a) * d, z = L.plaza.z + Math.sin(a) * d;
      this._box(4 + R() * 5, 2 + R() * 3, 1, 0x5d6058, x, this.groundH(x, z) + 1.4, z, R() * 3);
    }
    this._gravestones(L.graveyard.x, L.graveyard.z, R, 34);
    this._campfire(L.plaza.x - 5, L.plaza.z + 4);
    // cathedral (gallows dungeon facade)
    const cg = L.cathedral_gate;
    const gh = this.groundH(cg.x, cg.z - 10);
    const nave = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 26), mat(0x565c66));
    nave.position.set(cg.x, gh + 7, cg.z - 16); this.root.add(nave);
    const naveRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 11, 6, 4), mat(0x2e333d));
    naveRoof.rotation.y = Math.PI / 4; naveRoof.scale.z = 26 / 22; naveRoof.position.set(cg.x, gh + 17, cg.z - 16); this.root.add(naveRoof);
    this._towerAt(cg.x - 7, cg.z - 4, gh, 24, 2.2, 0x565c66, 0x2e333d);
    this._towerAt(cg.x + 7, cg.z - 4, gh, 24, 2.2, 0x565c66, 0x2e333d);
    // rose window glow
    const rose = new THREE.Mesh(new THREE.CircleGeometry(2.2, 12), basicMat(0x6fd0ff, { transparent: true, opacity: 0.7 }));
    rose.position.set(cg.x, gh + 10, cg.z - 2.9); this.root.add(rose);
    this.colliders.push({ x: cg.x, z: cg.z - 16, r: 12 });
    // rookery tower backdrop (raid)
    this.flattens.push({ x: L.castle.x, z: L.castle.z, r: 50, h: 10 });
    this._towerAt(L.castle.x, L.castle.z, this.groundH(L.castle.x, L.castle.z), 60, 6, 0x3d3f4d, 0x22232e);
    this._towerAt(L.castle.x - 12, L.castle.z + 6, this.groundH(L.castle.x - 12, L.castle.z + 6), 34, 3.4, 0x3d3f4d, 0x22232e);
    // dead trees already gothic. lore terminals:
    this._loreTerminal(78, 14, 'lf4');
    this._loreTerminal(-64, -30, 'lf5');
    this._loreTerminal(104, 86, 'lf6');
  }

  _buildVeilspire(L, R) {
    // loopbreaker camp: tents + fires + banners
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this._tent(L.camp.x + Math.cos(a) * 12, L.camp.z + Math.sin(a) * 12, R, i % 2 ? 0x4a5a40 : 0x5a4a3a);
    }
    this._campfire(L.camp.x, L.camp.z);
    this._campfire(L.camp.x + 14, L.camp.z + 10);
    // banners
    for (const [bx, bz] of [[-6, 16], [6, 16]]) {
      const x = L.camp.x + bx, z = L.camp.z + bz, gh = this.groundH(x, z);
      this._box(0.15, 5, 0.15, 0x3a3026, x, gh + 2.5, z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), mat(0x1f7a46, { side: THREE.DoubleSide }));
      flag.position.set(x + 0.85, gh + 4.4, z); this.root.add(flag);
      this.animated.push({ tick: (dt, t) => { flag.rotation.y = Math.sin(t * 2 + x) * 0.4; } });
    }
    // THE SPIRE — black needle with green seams
    const S = L.castle; const gh = this.groundH(S.x, S.z);
    this.flattens.push({ x: S.x, z: S.z, r: 55, h: 16 });
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(2, 9, 90, 6), mat(0x14161f));
    spire.position.set(S.x, gh + 45, S.z); this.root.add(spire);
    for (let i = 0; i < 5; i++) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 60 - i * 8, 0.3), basicMat(0x39ff88, { transparent: true, opacity: 0.8 }));
      const a = i * 1.26;
      seam.position.set(S.x + Math.cos(a) * (5 - i * 0.5), gh + 34, S.z + Math.sin(a) * (5 - i * 0.5));
      this.root.add(seam);
      this.animated.push({ tick: (dt, t) => { seam.material.opacity = 0.5 + Math.sin(t * 3 + i * 2) * 0.35; } });
    }
    const beacon = new THREE.PointLight(0x39ff88, 2, 60); beacon.position.set(S.x, gh + 88, S.z); this.root.add(beacon);
    this.colliders.push({ x: S.x, z: S.z, r: 10 });
    // frost keep backdrop at frosthold portal
    const F = L.dg_frosthold;
    this._castle(F.x - 18, F.z - 14, { stone: 0x7d8798, roof: 0x4d5568, scale: 0.8 });
    // ice shards
    for (let i = 0; i < 24; i++) {
      const a = R() * 6.28, d = 20 + R() * 150;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 20;
      const h = this.groundH(x, z); if (h > 30) continue;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.7 + R(), 3 + R() * 5, 5), mat(0xaed4e8, { transparent: true, opacity: 0.85 }));
      shard.position.set(x, h + 1.5, z); shard.rotation.z = (R() - 0.5) * 0.4;
      this.root.add(shard);
    }
    this._loreTerminal(-84, -6, 'lf7');
    this._loreTerminal(80, -30, 'lf8');
    this._loreTerminal(12, -100, 'lf9');
  }

  // ---------- ambient particle systems ----------
  _particles(zoneId) {
    const N = 260;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 200;
      arr[i * 3 + 1] = 2 + Math.random() * 30;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const conf = {
      eldergreen: { color: 0xfff0a0, size: 0.22, fall: -0.2, drift: 0.5 },   // pollen/fireflies
      ashmoor: { color: 0x9aa8a8, size: 0.3, fall: 0.6, drift: 1.2 },        // ash
      veilspire: { color: 0xffffff, size: 0.28, fall: 2.2, drift: 1.8 },     // snow
    }[zoneId];
    const m = new THREE.PointsMaterial({ color: conf.color, size: conf.size, transparent: true, opacity: 0.8, sizeAttenuation: true });
    const pts = new THREE.Points(g, m);
    this.root.add(pts);
    this.particleAnchor = pts;
    this.animated.push({ tick: (dt, t, cam) => {
      const a = g.attributes.position.array;
      for (let i = 0; i < N; i++) {
        a[i * 3 + 1] -= conf.fall * dt;
        a[i * 3] += Math.sin(t + i) * conf.drift * dt;
        if (a[i * 3 + 1] < 0) a[i * 3 + 1] = 26;
      }
      g.attributes.position.needsUpdate = true;
      if (cam) { pts.position.x = cam.x; pts.position.z = cam.z; }
    } });
  }

  // collision resolve: push a point out of colliders; returns corrected x,z
  collide(x, z, r = 0.5) {
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 0.001) { x = c.x + dx / d * min; z = c.z + dz / d * min; }
    }
    const lim = this.size / 2 - 6;
    x = THREE.MathUtils.clamp(x, -lim, lim);
    z = THREE.MathUtils.clamp(z, -lim, lim);
    return [x, z];
  }

  tick(dt, t, camPos) { for (const a of this.animated) a.tick(dt, t, camPos); }
}
