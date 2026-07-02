// ============ WORLD BUILDER — terrain, roads, villages, castles, landmarks ============
import { THREE, mat, basicMat, rng, tex } from './engine.js';
import { ZONES } from './data_world.js';
import { buildBeast } from './entities.js';

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

    // flatten around landmarks (must be complete BEFORE the terrain bakes heights)
    this.flattens = [];
    for (const k of Object.keys(L)) {
      const base = (k === 'castle') ? 14 : 0.5;
      this.flattens.push({ x: L[k].x, z: L[k].z, r: k === 'village' ? 42 : 24, h: base });
    }
    if (zoneId === 'eldergreen') this.flattens.push({ x: L.castle.x, z: L.castle.z, r: 60, h: 14 });
    if (zoneId === 'ashmoor') this.flattens.push({ x: L.castle.x, z: L.castle.z, r: 50, h: 10 });
    if (zoneId === 'veilspire') this.flattens.push({ x: L.castle.x, z: L.castle.z, r: 55, h: 16 });

    // ---------- terrain (real texture, vertex colors act as tints) ----------
    const segs = 150;
    const geo = new THREE.PlaneGeometry(this.size, this.size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    // main road: from spawn through village toward castle + branches to dungeons
    const roadPts = this._roadPoints(L);
    this.roadPts = roadPts;
    const groundTex = { fairytale: 'grass', gothic: 'dirt', storm: 'snow' }[Z.biome];
    const pathTint = { fairytale: [2.1, 1.62, 0.85], gothic: [1.45, 1.52, 1.55], storm: [0.6, 0.63, 0.74] }[Z.biome];
    const altTint = Z.biome === 'storm' ? [1.12, 1.14, 1.2] : [1.05, 1.05, 1.18];
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.groundH(x, z);
      pos.setY(i, h);
      const n = this.noise(x * 0.05 + 99, z * 0.05 + 99, 3);
      tmp.setRGB(1, 1, 1);
      if (n < -0.15) tmp.multiplyScalar(0.78);            // damp hollows
      else if (n > 0.28) tmp.multiplyScalar(1.1);         // sunlit patches
      const alt = THREE.MathUtils.clamp((h - 12) / 26, 0, 1);
      tmp.lerp(new THREE.Color(...altTint), alt);         // rocky/snowy heights
      let dRoad = Infinity;
      for (const rp of roadPts) { const d = Math.hypot(x - rp.x, z - rp.z); if (d < dRoad) dRoad = d; }
      if (dRoad < 4.5) tmp.lerp(new THREE.Color(...pathTint), 0.85 - dRoad / 6);
      const dith = (this.noise(x * 0.6, z * 0.6, 2)) * 0.05;
      tmp.r += dith; tmp.g += dith; tmp.b += dith;
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, map: tex(groundTex, Math.round(this.size / 9)) }));
    this.root.add(ground);

    // ---------- water: rippling surface + sun sparkles ----------
    if (L.pond) {
      const wgeo = new THREE.CircleGeometry(26, 22);
      const water = new THREE.Mesh(wgeo,
        new THREE.MeshLambertMaterial({ color: 0x3a6a8a, transparent: true, opacity: 0.8, flatShading: true }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(L.pond.x, 0.25, L.pond.z);
      this.root.add(water);
      const wpos = wgeo.attributes.position;
      // sparkle points twinkling on the surface
      const spN = 26, spArr = new Float32Array(spN * 3);
      for (let i = 0; i < spN; i++) {
        const a = Math.random() * 6.28, d = Math.random() * 22;
        spArr[i * 3] = L.pond.x + Math.cos(a) * d; spArr[i * 3 + 1] = 0.42; spArr[i * 3 + 2] = L.pond.z + Math.sin(a) * d;
      }
      const spGeo = new THREE.BufferGeometry();
      spGeo.setAttribute('position', new THREE.BufferAttribute(spArr, 3));
      const spMat = new THREE.PointsMaterial({ color: 0xfff8d8, size: 2.0, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false });
      this.root.add(new THREE.Points(spGeo, spMat));
      this.animated.push({ tick: (dt, t) => {
        for (let i = 0; i < wpos.count; i++) {
          const x = wpos.getX(i), y = wpos.getY(i);
          wpos.setZ(i, Math.sin(t * 1.6 + x * 0.35 + y * 0.5) * 0.14);
        }
        wpos.needsUpdate = true;
        spMat.opacity = 0.4 + Math.abs(Math.sin(t * 2.3)) * 0.5;
      } });
    }

    // ---------- vegetation (instanced) ----------
    this._vegetation(Z, R, L);

    // ---------- structures per zone ----------
    if (zoneId === 'eldergreen') this._buildEldergreen(L, R);
    if (zoneId === 'ashmoor') this._buildAshmoor(L, R);
    if (zoneId === 'veilspire') this._buildVeilspire(L, R);

    // ---------- detail layer: micro-props, critters, atmosphere ----------
    this._details(zoneId, R, L);

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
    trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 7);
    trunkMat = mat(biome === 'gothic' ? 0x8a7f74 : 0xb59f8a, { tex: 'bark' });
    if (biome === 'fairytale') { crownGeo = new THREE.IcosahedronGeometry(2.2, 1); crownMat = mat(0x3f7a2f); crownMat2 = mat(0x578f3a); }
    else if (biome === 'gothic') { crownGeo = new THREE.IcosahedronGeometry(1.6, 1); crownMat = mat(0x4a4238); crownMat2 = mat(0x5d4a3a); }
    else { crownGeo = new THREE.ConeGeometry(1.8, 4.5, 8); crownMat = mat(0x2e4a3e); crownMat2 = mat(0x3a5a4a); }

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
    const rocks = new THREE.InstancedMesh(rockGeo, mat(Z.biome === 'storm' ? 0xa8b2c2 : 0xc2b8a8, { tex: 'rock' }), 120);
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
    const wall = opts.wall ?? 0xc9b892;
    const roof = ((c) => new THREE.Color(c).multiplyScalar(2.1).getHex())(opts.roof ?? 0x8a4a2a);
    const ry = R() * Math.PI * 2;
    const g = new THREE.Group(); g.position.set(x, gh, z); g.rotation.y = ry;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wall, { tex: 'plaster', rep: 2 })); base.position.y = h / 2; g.add(base);
    // timber frame
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1), mat(0x8a6a48, { tex: 'planks' })); beam.position.y = h; g.add(beam);
    const roofM = new THREE.Mesh(new THREE.CylinderGeometry(0.01, d * 0.75, h * 0.9, 4, 1), mat(roof, { tex: 'roof', rep: 2 }));
    roofM.rotation.y = Math.PI / 4; roofM.scale.x = w / d;
    roofM.position.y = h + h * 0.45; g.add(roofM);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.15), mat(0x7a5a38, { tex: 'planks' })); door.position.set(0, 0.9, d / 2 + 0.05); g.add(door);
    // warm window light
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), basicMat(0xffd88a)); win.position.set(w / 4, h * 0.6, d / 2 + 0.05); g.add(win);
    this.root.add(g);
    this.colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
    return g;
  }

  _tower(x, z, h, r, color, roofColor) {
    roofColor = new THREE.Color(roofColor).multiplyScalar(2.1).getHex();
    const gh = this.groundH(x, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 10), mat(color, { tex: 'stonewall', rep: 3 }));
    t.position.set(x, gh + h / 2, z); this.root.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, h * 0.4, 10), mat(roofColor, { tex: 'roof', rep: 2 }));
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
      const w = new THREE.Mesh(new THREE.BoxGeometry(wallLen, wallH, 3), mat(stone, { tex: 'stonewall', rep: 4 }));
      w.position.set(cx + dx, gh + wallH / 2, cz + dz); w.rotation.y = ry; this.root.add(w);
      // crenellations
      const cren = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 1.4, 3.6), mat(stone, { tex: 'stonewall', rep: 4 }));
      cren.position.set(cx + dx, gh + wallH + 0.7, cz + dz); cren.rotation.y = ry; this.root.add(cren);
    }
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      this._tower(cx + dx * wallLen / 2, cz + dz * wallLen / 2, 16 * scale, 3.4 * scale, stone, roof);
    // keep: layered blocks + spires (silhouette from the screenshot)
    const keep = new THREE.Mesh(new THREE.BoxGeometry(20 * scale, 22 * scale, 16 * scale), mat(stone, { tex: 'stonewall', rep: 4 }));
    keep.position.set(cx, gh + 11 * scale, cz); this.root.add(keep);
    const keep2 = new THREE.Mesh(new THREE.BoxGeometry(12 * scale, 32 * scale, 10 * scale), mat(stone, { tex: 'stonewall', rep: 4 }));
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
    roofColor = new THREE.Color(roofColor).multiplyScalar(2.1).getHex();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 10), mat(color, { tex: 'stonewall', rep: 3 }));
    t.position.set(x, gh + h / 2, z); this.root.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.4, h * 0.3, 10), mat(roofColor, { tex: 'roof', rep: 2 }));
    roof.position.set(x, gh + h + h * 0.15, z); this.root.add(roof);
  }

  _windmill(x, z) {
    const gh = this.groundH(x, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 9, 10), mat(0xd8cba8, { tex: 'plaster', rep: 2 }));
    body.position.set(x, gh + 4.5, z); this.root.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.4, 10), mat(0xd8935a, { tex: 'roof', rep: 2 }));
    roof.position.set(x, gh + 10.2, z); this.root.add(roof);
    const hub = new THREE.Group(); hub.position.set(x, gh + 8.4, z + 2.6); this.root.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.12), mat(0xe8e0c8, { tex: 'planks' }));
      blade.position.y = 3.5;
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(blade); hub.add(arm);
    }
    this.animated.push({ tick: (dt) => hub.rotation.z += dt * 0.5 });
    this.colliders.push({ x, z, r: 3.6 });
  }

  _gravestones(cx, cz, R, n = 26) {
    const geo = new THREE.BoxGeometry(0.7, 1.1, 0.18);
    const im = new THREE.InstancedMesh(geo, mat(0xb2b8ae, { tex: 'rock' }), n);
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
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1, 10), mat(0xb8b2a2, { tex: 'stonewall' }));
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
      const bw = new THREE.Mesh(new THREE.BoxGeometry(4 + R() * 5, 2 + R() * 3, 1), mat(0x9aa098, { tex: 'stonewall', rep: 2 }));
      bw.position.set(x, this.groundH(x, z) + 1.4, z); bw.rotation.y = R() * 3; this.root.add(bw);
    }
    this._gravestones(L.graveyard.x, L.graveyard.z, R, 34);
    this._campfire(L.plaza.x - 5, L.plaza.z + 4);
    // cathedral (gallows dungeon facade)
    const cg = L.cathedral_gate;
    const gh = this.groundH(cg.x, cg.z - 10);
    const nave = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 26), mat(0x8a92a0, { tex: 'stonewall', rep: 4 }));
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
      eldergreen: { color: 0xfff0a0, size: 2.2, fall: -0.2, drift: 0.5 },   // pollen/fireflies
      ashmoor: { color: 0x9aa8a8, size: 2.4, fall: 0.6, drift: 1.2 },        // ash
      veilspire: { color: 0xffffff, size: 2.4, fall: 2.2, drift: 1.8 },     // snow
    }[zoneId];
    const m = new THREE.PointsMaterial({ color: conf.color, size: conf.size, transparent: true, opacity: 0.8, sizeAttenuation: false });
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

  // ============ DETAIL LAYER ============
  _details(zoneId, R, L) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    const safe = Object.values(L);

    // ---- swaying grass blades (wind in the vertex shader) ----
    if (zoneId !== 'ashmoor') {
      const gGeo = new THREE.PlaneGeometry(0.45, 0.9);
      gGeo.translate(0, 0.45, 0);
      const gMat = new THREE.MeshLambertMaterial({
        color: zoneId === 'veilspire' ? 0x9fb8c8 : 0x66a648, side: THREE.DoubleSide, flatShading: true });
      const windU = { value: 0 };
      gMat.onBeforeCompile = (sh) => {
        sh.uniforms.uWind = windU;
        sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
           float wnd = sin(uWind * 2.2 + instanceMatrix[3][0] * 0.8 + instanceMatrix[3][2] * 0.6);
           transformed.x += wnd * position.y * 0.28;`);
      };
      const grass = new THREE.InstancedMesh(gGeo, gMat, 380);
      let ng = 0;
      for (let i = 0; i < 900 && ng < 380; i++) {
        const x = (R() - 0.5) * this.size * 0.85, z = (R() - 0.5) * this.size * 0.85;
        const h = this.groundH(x, z);
        if (h > 22) continue;
        if (safe.some(s => Math.hypot(x - s.x, z - s.z) < 18)) continue;
        q.setFromEuler(new THREE.Euler(0, R() * 6.28, 0));
        const s = 0.7 + R() * 0.8;
        pv.set(x, h, z); sc.set(s, s, s);
        m4.compose(pv, q, sc); grass.setMatrixAt(ng++, m4);
      }
      grass.count = ng;
      this.root.add(grass);
      this.animated.push({ tick: (dt, t) => { windU.value = t; } });
    }

    // ---- cobblestones along the roads ----
    const cobGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.09, 6);
    const cob = new THREE.InstancedMesh(cobGeo, mat(zoneId === 'eldergreen' ? 0xd8c090 : 0xa8b2a8, { tex: 'paving' }), 240);
    let nc = 0;
    for (let i = 0; i < this.roadPts.length && nc < 240; i += 3) {
      const rp = this.roadPts[i];
      const x = rp.x + (R() - 0.5) * 2.6, z = rp.z + (R() - 0.5) * 2.6;
      q.setFromEuler(new THREE.Euler(0, R() * 6.28, 0));
      const s = 0.5 + R() * 0.8;
      pv.set(x, this.groundH(x, z) + 0.02, z); sc.set(s, 1, s);
      m4.compose(pv, q, sc); cob.setMatrixAt(nc++, m4);
    }
    cob.count = nc;
    this.root.add(cob);

    // ---- lantern posts along the main road (warm glow at night) ----
    const step = Math.floor(this.roadPts.length / 12);
    for (let i = step; i < this.roadPts.length; i += step) {
      const rp = this.roadPts[i];
      const x = rp.x + 2.4, z = rp.z + 2.4;
      const h = this.groundH(x, z);
      if (h > 20) continue;
      if (safe.some(s => Math.hypot(x - s.x, z - s.z) < 8)) continue;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), mat(0x3a3026));
      post.position.set(x, h + 1.3, z); this.root.add(post);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34), basicMat(zoneId === 'veilspire' ? 0x8fffc0 : 0xffd88a));
      lamp.position.set(x, h + 2.5, z); this.root.add(lamp);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: World._glowTex(), color: zoneId === 'veilspire' ? 0x66ffaa : 0xffcc77,
        transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(2.2);
      halo.position.set(x, h + 2.5, z); this.root.add(halo);
      this.animated.push({ tick: (dt, t) => { halo.material.opacity = 0.4 + Math.sin(t * 4 + x) * 0.12; } });
    }

    // ---- per-zone dressing ----
    if (zoneId === 'eldergreen') this._detailEldergreen(R, L, { m4, q, sc, pv });
    if (zoneId === 'ashmoor') this._detailAshmoor(R, L);
    if (zoneId === 'veilspire') this._detailVeilspire(R, L);

    // ---- critters ----
    this._critters(zoneId, R, L);
  }

  static _glowTex() {
    if (World.__glow) return World.__glow;
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
    World.__glow = new THREE.CanvasTexture(cv);
    return World.__glow;
  }

  _detailEldergreen(R, L, T) {
    const { m4, q, sc, pv } = T;
    // flowers: three color drifts across the meadows
    for (const [color, seedOff] of [[0xe86a9a, 1], [0xf0d24a, 2], [0xf2f0e4, 3]]) {
      const bloom = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), mat(color), 60);
      let n = 0;
      const RR = rng(1337 * seedOff);
      for (let i = 0; i < 200 && n < 60; i++) {
        const x = (RR() - 0.5) * this.size * 0.8, z = (RR() - 0.5) * this.size * 0.8;
        const h = this.groundH(x, z);
        if (h > 18) continue;
        const density = this.noise(x * 0.03 + seedOff * 7, z * 0.03, 2);
        if (density < 0.12) continue;
        q.setFromEuler(new THREE.Euler(0, RR() * 6, 0));
        pv.set(x, h + 0.22, z); sc.setScalar(0.8 + RR() * 0.6);
        m4.compose(pv, q, sc); bloom.setMatrixAt(n++, m4);
      }
      bloom.count = n;
      this.root.add(bloom);
    }
    // bushes
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0x467a34), 60);
    let nb = 0;
    for (let i = 0; i < 180 && nb < 60; i++) {
      const x = (R() - 0.5) * this.size * 0.85, z = (R() - 0.5) * this.size * 0.85;
      const h = this.groundH(x, z);
      if (h > 20) continue;
      q.setFromEuler(new THREE.Euler(0, R() * 6, 0));
      pv.set(x, h + 0.3, z); sc.set(0.7 + R(), 0.5 + R() * 0.5, 0.7 + R());
      m4.compose(pv, q, sc); bush.setMatrixAt(nb++, m4);
    }
    bush.count = nb;
    this.root.add(bush);

    // village fence ring with a gate gap
    const V = L.village;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.35) continue; // gate toward spawn (+z)
      const x = V.x + Math.cos(a) * 25, z = V.z + Math.sin(a) * 25;
      const h = this.groundH(x, z);
      this._box(0.14, 1.1, 0.14, 0x6a5238, x, h + 0.55, z);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 5.4), mat(0xa08a64, { tex: 'planks' }));
      rail.position.set(V.x + Math.cos(a + 0.12) * 25, h + 0.8, V.z + Math.sin(a + 0.12) * 25);
      rail.rotation.y = -a - 0.12 + Math.PI / 2 + 0.25;
      this.root.add(rail);
    }
    // market stall by the well
    const W = L.well;
    const sx = W.x + 4, sz = W.z + 3, sh = this.groundH(sx, sz);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.1), mat(0xa8845a, { tex: 'planks' }));
    counter.position.set(sx, sh + 0.45, sz); this.root.add(counter);
    for (const [dx, dz] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]])
      this._box(0.1, 2.2, 0.1, 0x5a4028, sx + dx, sh + 1.1, sz + dz);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.6), mat(0xb04a3a));
    awning.position.set(sx, sh + 2.25, sz); awning.rotation.x = 0.18; this.root.add(awning);
    // goods on the counter
    for (let i = 0; i < 4; i++) this._box(0.24, 0.24, 0.24, [0xd8b04a, 0xa04a3a, 0x4a7a3a, 0xd8d0c0][i], sx - 0.8 + i * 0.5, sh + 1.02, sz);
    this.colliders.push({ x: sx, z: sz, r: 1.6 });

    // crates & barrels near cottages
    const crate = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat(0xb08a5a, { tex: 'planks' }), 14);
    const barrel = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.8, 9), mat(0x8a6240, { tex: 'planks' }), 10);
    let ncr = 0, nba = 0;
    for (let i = 0; i < 30 && (ncr < 14 || nba < 10); i++) {
      const a = R() * 6.28, d = 11 + R() * 8;
      const x = V.x + Math.cos(a) * d, z = V.z + Math.sin(a) * d;
      const h = this.groundH(x, z);
      q.setFromEuler(new THREE.Euler(0, R() * 6, 0)); sc.setScalar(0.8 + R() * 0.4);
      if (R() < 0.6 && ncr < 14) { pv.set(x, h + 0.32, z); m4.compose(pv, q, sc); crate.setMatrixAt(ncr++, m4); }
      else if (nba < 10) { pv.set(x, h + 0.4, z); m4.compose(pv, q, sc); barrel.setMatrixAt(nba++, m4); }
    }
    crate.count = ncr; barrel.count = nba;
    this.root.add(crate, barrel);

    // chimney smoke over three cottages
    for (const i of [1, 4, 6]) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      this._smoke(V.x + Math.cos(a) * 16, this.groundH(V.x + Math.cos(a) * 16, V.z + Math.sin(a) * 16) + 5.6, V.z + Math.sin(a) * 16);
    }

    // butterflies over the meadow
    this._butterflies(V.x, V.z, 0xffe9f2);
  }

  _smoke(x, y, z) {
    const N = 9;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const phase = [];
    for (let i = 0; i < N; i++) { arr[i * 3] = x; arr[i * 3 + 1] = y + i * 0.55; arr[i * 3 + 2] = z; phase.push(Math.random() * 6.28); }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const smoke = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xd8d4cc, size: 3.2, transparent: true, opacity: 0.4, depthWrite: false, sizeAttenuation: false }));
    this.root.add(smoke);
    this.animated.push({ tick: (dt, t) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        a[i * 3 + 1] += dt * 0.8;
        a[i * 3] = x + Math.sin(t * 0.8 + phase[i]) * (0.2 + (a[i * 3 + 1] - y) * 0.18);
        if (a[i * 3 + 1] > y + 5) a[i * 3 + 1] = y;
      }
      geo.attributes.position.needsUpdate = true;
    } });
  }

  _butterflies(cx, cz, color) {
    const N = 14;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const base = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.28, d = 6 + Math.random() * 30;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      base.push({ x, z, ph: Math.random() * 6.28 });
      arr[i * 3] = x; arr[i * 3 + 1] = this.groundH(x, z) + 1; arr[i * 3 + 2] = z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 2.2, transparent: true, opacity: 0.95, sizeAttenuation: false }));
    this.root.add(pts);
    this.animated.push({ tick: (dt, t) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const b = base[i];
        a[i * 3] = b.x + Math.sin(t * 0.9 + b.ph) * 2.4;
        a[i * 3 + 2] = b.z + Math.cos(t * 0.7 + b.ph * 2) * 2.4;
        a[i * 3 + 1] = this.groundH(a[i * 3], a[i * 3 + 2]) + 1 + Math.abs(Math.sin(t * 3 + b.ph)) * 0.8;
      }
      geo.attributes.position.needsUpdate = true;
    } });
  }

  _detailAshmoor(R, L) {
    // drifting ground mist
    for (let i = 0; i < 6; i++) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(46, 46),
        new THREE.MeshBasicMaterial({ color: 0x9fb8b5, transparent: true, opacity: 0.09, depthWrite: false }));
      plane.rotation.x = -Math.PI / 2;
      const x0 = (R() - 0.5) * 220, z0 = (R() - 0.5) * 220;
      plane.position.set(x0, this.groundH(x0, z0) + 1.4, z0);
      this.root.add(plane);
      const sp = 0.5 + R();
      this.animated.push({ tick: (dt, t) => {
        plane.position.x = x0 + Math.sin(t * 0.07 * sp) * 14;
        plane.material.opacity = 0.06 + Math.abs(Math.sin(t * 0.11 * sp + i)) * 0.06;
      } });
    }
    // circling raven flock around the Rookery
    const S = L.castle;
    const flock = [];
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.TetrahedronGeometry(0.28), mat(0x16161e));
      this.root.add(b);
      flock.push({ b, r: 10 + R() * 16, h: 30 + R() * 26, ph: R() * 6.28, sp: 0.3 + R() * 0.4 });
    }
    this.animated.push({ tick: (dt, t) => {
      for (const f of flock) {
        const a = t * f.sp + f.ph;
        f.b.position.set(S.x + Math.cos(a) * f.r, this.groundH(S.x, S.z) + f.h + Math.sin(t + f.ph) * 2, S.z + Math.sin(a) * f.r);
        f.b.rotation.set(a, a * 1.4, Math.sin(t * 6 + f.ph) * 0.4);
      }
    } });
    // grave candles
    const G = L.graveyard;
    for (let i = 0; i < 8; i++) {
      const a = R() * 6.28, d = 4 + R() * 15;
      const x = G.x + Math.cos(a) * d, z = G.z + Math.sin(a) * d;
      const h = this.groundH(x, z);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.12), basicMat(0xffe0a0));
      c.position.set(x, h + 0.15, z); this.root.add(c);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: World._glowTex(), color: 0xffb060,
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(1.1); halo.position.set(x, h + 0.35, z); this.root.add(halo);
      this.animated.push({ tick: (dt, t) => { halo.material.opacity = 0.32 + Math.sin(t * 7 + x * 3) * 0.16; } });
    }
    // hanged cages on posts near the cathedral road
    for (const [dx, dz] of [[-10, 20], [12, 34]]) {
      const x = dx, z = dz, h = this.groundH(x, z);
      this._box(0.2, 5, 0.2, 0x2a2a30, x, h + 2.5, z);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.16), mat(0x2a2a30));
      arm.position.set(x + 0.7, h + 4.8, z); this.root.add(arm);
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.32, 1.1, 6, 1, true), mat(0x3a3a44, { side: THREE.DoubleSide }));
      cage.position.set(x + 1.3, h + 3.9, z); this.root.add(cage);
      this.animated.push({ tick: (dt, t) => { cage.rotation.z = Math.sin(t * 0.9 + x) * 0.08; cage.position.x = x + 1.3 + Math.sin(t * 0.9 + x) * 0.1; } });
    }
  }

  _detailVeilspire(R, L) {
    // aurora ribbons — the sky forgetting to pretend
    for (const [color, y0, ph] of [[0x39ff88, 88, 0], [0x2fd0c0, 102, 2.2]]) {
      const geo = new THREE.PlaneGeometry(360, 22, 48, 1);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(0, y0, -70);
      m.rotation.x = 0.75;
      this.root.add(m);
      const pos = geo.attributes.position;
      this.animated.push({ tick: (dt, t) => {
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          pos.setZ(i, Math.sin(t * 0.35 + x * 0.045 + ph) * 9 + Math.sin(t * 0.13 + x * 0.02) * 5);
        }
        pos.needsUpdate = true;
        m.material.opacity = 0.2 + Math.abs(Math.sin(t * 0.21 + ph)) * 0.18;
      } });
    }
    // floating glitch-rocks with green crystals
    for (let i = 0; i < 6; i++) {
      const a = R() * 6.28, d = 60 + R() * 110;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 30;
      const gh = this.groundH(x, z);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + R() * 2, 0), mat(0x4a5261));
      const y0 = gh + 10 + R() * 12;
      rock.position.set(x, y0, z);
      rock.rotation.set(R() * 3, R() * 3, R() * 3);
      this.root.add(rock);
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 5), basicMat(0x39ff88, { transparent: true, opacity: 0.85 }));
      crystal.position.y = 2.4; rock.add(crystal);
      const drip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 5, 0.14), basicMat(0x39ff88, { transparent: true, opacity: 0.3 }));
      drip.position.y = -4; rock.add(drip);
      this.animated.push({ tick: (dt, t) => {
        rock.position.y = y0 + Math.sin(t * 0.5 + i * 1.3) * 1.4;
        rock.rotation.y += dt * 0.12;
        drip.material.opacity = 0.15 + Math.abs(Math.sin(t * 1.7 + i)) * 0.25;
      } });
    }
    // wind-torn snow streaks near the ground
    const N = 40;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      arr[i * 3] = (R() - 0.5) * 200; arr[i * 3 + 1] = 1 + R() * 4; arr[i * 3 + 2] = (R() - 0.5) * 200;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const streaks = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8f0ff, size: 2.0, transparent: true, opacity: 0.5, sizeAttenuation: false }));
    this.root.add(streaks);
    this.animated.push({ tick: (dt, t, cam) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        a[i * 3] += dt * 22;
        if (cam && a[i * 3] > cam.x + 100) a[i * 3] = cam.x - 100;
      }
      geo.attributes.position.needsUpdate = true;
      if (cam) { streaks.position.z = 0; }
    } });
  }

  // ---- critters: harmless life ----
  _critters(zoneId, R, L) {
    this.critters = [];
    const addCritter = (model, x, z, opts = {}) => {
      model.position.set(x, this.groundH(x, z), z);
      this.root.add(model);
      const c = { g: model, home: { x, z }, to: null, pause: R() * 3, speed: opts.speed || 1.6,
        radius: opts.radius || 6, path: opts.path || null, pathIdx: 0, rig: model.userData.rig, t: R() * 10 };
      this.critters.push(c);
      return c;
    };
    if (zoneId === 'eldergreen') {
      const V = L.village;
      // chickens
      for (let i = 0; i < 3; i++) {
        const ch = buildBeast(0xf0ead8, 0.32);
        addCritter(ch, V.x + (R() - 0.5) * 14, V.z + (R() - 0.5) * 14, { speed: 2.2, radius: 5 });
      }
      // THE black cat — walks its scripted line past the well, as Wren says
      const cat = buildBeast(0x141418, 0.42);
      const W = L.well;
      addCritter(cat, W.x - 8, W.z, { speed: 2.8, path: [{ x: W.x - 9, z: W.z + 2 }, { x: W.x + 9, z: W.z - 2 }] });
      // a deer at the treeline
      const deer = buildBeast(0xa87a4a, 0.9);
      addCritter(deer, V.x + 55, V.z + 40, { speed: 3, radius: 14 });
    }
    if (zoneId === 'ashmoor') {
      // stray plague-thin dog
      const dog = buildBeast(0x4a4640, 0.6);
      addCritter(dog, L.plaza.x + 10, L.plaza.z + 8, { speed: 2.4, radius: 10 });
    }
    if (zoneId === 'veilspire') {
      // a mountain goat near the camp
      const goat = buildBeast(0xd8d4c8, 0.7);
      addCritter(goat, L.camp.x - 18, L.camp.z + 6, { speed: 2.2, radius: 12 });
    }
    this.animated.push({ tick: (dt, t) => {
      for (const c of this.critters) {
        c.t += dt;
        let moving = false;
        if (c.pause > 0) { c.pause -= dt; }
        else {
          if (!c.to) {
            if (c.path) { c.to = c.path[c.pathIdx]; c.pathIdx = (c.pathIdx + 1) % c.path.length; }
            else {
              const a = Math.random() * 6.28, d = Math.random() * c.radius;
              c.to = { x: c.home.x + Math.cos(a) * d, z: c.home.z + Math.sin(a) * d };
            }
          }
          const dx = c.to.x - c.g.position.x, dz = c.to.z - c.g.position.z;
          const dd = Math.hypot(dx, dz);
          if (dd < 0.3) { c.to = null; c.pause = 1.5 + Math.random() * 4; }
          else {
            c.g.position.x += dx / dd * c.speed * dt;
            c.g.position.z += dz / dd * c.speed * dt;
            c.g.rotation.y = Math.atan2(dx, dz);
            moving = true;
          }
        }
        c.g.position.y = this.groundH(c.g.position.x, c.g.position.z);
        // simple leg trot
        if (c.rig?.legs) {
          const swing = moving ? Math.sin(c.t * 11) * 0.7 : 0;
          c.rig.legs[0].rotation.x = swing; c.rig.legs[3].rotation.x = swing;
          c.rig.legs[1].rotation.x = -swing; c.rig.legs[2].rotation.x = -swing;
          if (c.rig.tail) c.rig.tail.rotation.y = Math.sin(c.t * 4) * 0.4;
        }
      }
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
