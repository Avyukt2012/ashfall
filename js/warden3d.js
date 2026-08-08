import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

function wedges(innerScale) {
  const src = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const pos = src.getAttribute('position');
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    const n = mid.clone().multiplyScalar(innerScale);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
      a.x, a.y, a.z, c.x, c.y, c.z, n.x, n.y, n.z,
      c.x, c.y, c.z, b.x, b.y, b.z, n.x, n.y, n.z,
      b.x, b.y, b.z, a.x, a.y, a.z, n.x, n.y, n.z
    ]), 3));
    g.computeVertexNormals();
    out.push({ geo: g, dir: mid.clone().normalize() });
  }
  src.dispose();
  return out;
}

export class Warden {
  constructor(canvas) {
    this.cv = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, 9);
    this.dist = 9;

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.heart = new THREE.Group();
    this.scene.add(this.root);
    this.root.add(this.body, this.heart);

    this.state = {
      hp: 1, phase: 0, hit: 0, charge: 0, shield: 0, eclipse: 0,
      recoil: 0, alive: true, visible: false, spin: 0, breath: 0, intensity: 1
    };
    this.pointer = { x: 0, y: 0, ex: 0, ey: 0 };
    this.tmpAxis = new THREE.Vector3(1, 0, 0);
    this.dummy = new THREE.Object3D();

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    this.buildLights();
    this.buildShell();
    this.buildHeart();
    this.buildArcs();
    this.buildBelt();
    this.buildWard();
    this.buildComposer();
    this.resize();
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.05);
    this.key = new THREE.DirectionalLight(0xfff2e6, 1.8);
    this.key.position.set(-3, 5, 4);
    this.rimLight = new THREE.DirectionalLight(0xffd9c0, 1.0);
    this.rimLight.position.set(4, -2, -3);
    this.scene.add(this.ambient, this.key, this.rimLight);
    this.furnace = new THREE.PointLight(0xff3d1f, 4, 10, 2);
    this.root.add(this.furnace);
  }

  buildShell() {
    this.fres = { value: 0.4 };
    this.emberU = { value: new THREE.Color('#ff3d1f') };
    this.shardMat = new THREE.MeshStandardMaterial({
      color: 0x0a0807, roughness: 0.3, metalness: 0.94,
      envMapIntensity: 0.62, flatShading: true
    });
    this.shardMat.onBeforeCompile = sh => {
      sh.uniforms.uFres = this.fres;
      sh.uniforms.uEmber = this.emberU;
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uFres;\nuniform vec3 uEmber;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uEmber * rimF * uFres;`);
    };

    this.shards = [];
    for (const { geo, dir } of wedges(0.34)) {
      const m = new THREE.Mesh(geo, this.shardMat);
      m.userData = { dir, seed: rand(0, TAU), kick: 0 };
      this.body.add(m);
      this.shards.push(m);
    }
  }

  buildHeart() {
    this.heartMat = new THREE.MeshStandardMaterial({
      color: 0x180b06, emissive: new THREE.Color('#ff3d1f'), emissiveIntensity: 3,
      roughness: 0.45, metalness: 0.5, flatShading: true
    });
    this.heartShards = [];
    for (const { geo, dir } of wedges(0.12)) {
      const m = new THREE.Mesh(geo, this.heartMat);
      m.userData = { dir, seed: rand(0, TAU) };
      m.scale.setScalar(0.4);
      this.heart.add(m);
      this.heartShards.push(m);
    }
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xf4ede0 });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), this.coreMat);
    this.heart.add(this.core);
  }

  buildArcs() {
    this.arcs = [];
    const defs = [
      { r: 1.6, t: 0.014, arc: 1.5, seg: 44, c: '#ff3d1f' },
      { r: 1.6, t: 0.012, arc: 0.7, seg: 24, c: '#ff3d1f' },
      { r: 1.98, t: 0.011, arc: 2.0, seg: 52, c: '#d9ff4a' },
      { r: 1.98, t: 0.009, arc: 0.55, seg: 20, c: '#d9ff4a' },
      { r: 2.38, t: 0.009, arc: 1.15, seg: 36, c: '#ff3d1f' },
      { r: 2.38, t: 0.007, arc: 0.45, seg: 18, c: '#f4ede0' }
    ];
    for (const d of defs) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(d.c), transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(d.r, d.t, 6, d.seg, d.arc), mat);
      mesh.rotation.z = rand(0, TAU);
      const pivot = new THREE.Group();
      pivot.add(mesh);
      pivot.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
      pivot.userData = {
        ax: rand(0.12, 0.42) * (Math.random() < 0.5 ? -1 : 1),
        ay: rand(0.12, 0.4) * (Math.random() < 0.5 ? -1 : 1),
        az: rand(0.06, 0.24) * (Math.random() < 0.5 ? -1 : 1),
        ph: rand(0, TAU)
      };
      this.root.add(pivot);
      this.arcs.push({ pivot, mesh, mat });
    }
  }

  buildBelt() {
    const N = 64;
    this.beltCount = N;
    this.beltMat = new THREE.MeshStandardMaterial({
      color: 0x100c0a, roughness: 0.34, metalness: 0.88,
      envMapIntensity: 0.75, flatShading: true,
      emissive: new THREE.Color('#ff3d1f'), emissiveIntensity: 0
    });
    this.beltMesh = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(0.06, 0), this.beltMat, N
    );
    this.beltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beltMesh.frustumCulled = false;
    this.beltData = [];
    for (let i = 0; i < N; i++) {
      this.beltData.push({
        r: rand(1.3, 2.75), speed: rand(0.14, 0.5) * (Math.random() < 0.5 ? -1 : 1),
        ph: rand(0, TAU), tilt: rand(-1.25, 1.25), bob: rand(0.1, 0.5),
        s: rand(0.45, 1.8), spin: rand(-2.4, 2.4)
      });
    }
    this.root.add(this.beltMesh);
  }

  buildWard() {
    this.wardMat = new THREE.MeshBasicMaterial({
      color: 0xf4ede0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.ward = new THREE.Mesh(new THREE.OctahedronGeometry(1.62, 0), this.wardMat);
    this.ward.material.wireframe = true;
    this.root.add(this.ward);
  }

  buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setPalette(pal) {
    const hex = h => new THREE.Color(h || '#ff3d1f');
    this.shardMat.color = hex(pal.body);
    this.emberU.value = hex(pal.ember);
    this.furnace.color = hex(pal.ember);
    this.heartMat.emissive = hex(pal.ember);
    this.coreMat.color = hex(pal.pale);
    this.beltMat.color = hex(pal.body);
    this.beltMat.emissive = hex(pal.ember);
    this.wardMat.color = hex(pal.pale);
    const cols = [pal.ember, pal.ember, pal.acid, pal.acid, pal.ember, pal.pale];
    this.arcs.forEach((a, i) => { a.mat.color = hex(cols[i]); });
  }

  setPointer(x, y) { this.pointer.x = x - 0.5; this.pointer.y = y - 0.5; }

  kick(power) {
    const p = Math.min(2.2, power);
    for (const m of this.shards) m.userData.kick = p * rand(0.5, 1.5);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewH = 2 * this.dist * Math.tan((this.camera.fov * Math.PI / 180) / 2);
  }

  setFocus(cx, cy, R) {
    const ndcX = (cx / this.w) * 2 - 1;
    const ndcY = -((cy / this.h) * 2 - 1);
    const halfH = this.viewH / 2;
    this.root.position.set(ndcX * halfH * this.camera.aspect, ndcY * halfH, 0);
    this.root.scale.setScalar(R * (this.viewH / this.h) * 0.92);
  }

  update(dt) {
    const s = this.state;
    s.breath += dt * (1.1 + s.phase * 0.28);
    s.spin += dt * (0.16 + s.phase * 0.12);
    s.hit *= Math.pow(0.0016, dt);

    this.pointer.ex += (this.pointer.x - this.pointer.ex) * Math.min(1, dt * 2.2);
    this.pointer.ey += (this.pointer.y - this.pointer.ey) * Math.min(1, dt * 2.2);
    this.camera.position.x = this.pointer.ex * 1.6;
    this.camera.position.y = -this.pointer.ey * 1.1;
    this.camera.lookAt(0, 0, 0);

    const veil = 1 - s.eclipse * 0.88;
    const gap = 0.055 + s.phase * 0.07 + (1 - s.hp) * 0.09
      + Math.sin(s.breath * 1.05) * 0.012 + s.hit * 0.2;

    for (const m of this.shards) {
      const u = m.userData;
      u.kick *= Math.pow(0.02, dt);
      const wob = 1 + Math.sin(s.breath * 1.5 + u.seed) * 0.03;
      m.position.copy(u.dir).multiplyScalar((gap + u.kick * 0.15) * wob);
      m.rotation.x = Math.sin(s.breath * 0.6 + u.seed) * (0.1 + s.phase * 0.08) + u.kick * 0.22;
      m.rotation.y = Math.cos(s.breath * 0.5 + u.seed) * (0.1 + s.phase * 0.08);
    }

    this.body.rotation.y = s.spin * 0.9;
    this.body.rotation.x = Math.sin(s.breath * 0.42) * 0.2;
    this.body.rotation.z = Math.sin(s.breath * 0.3) * 0.08;

    const pulse = 0.55 + Math.sin(s.breath * 3.1) * 0.12 + s.hit * 0.9 + s.charge * 0.4;
    this.heart.rotation.y = -s.spin * 2.2;
    this.heart.rotation.x = Math.cos(s.breath * 0.5) * 0.45;
    this.heart.rotation.z = s.spin * 1.4;
    this.heart.scale.setScalar((0.92 + pulse * 0.14) * (s.alive ? 1 : 0));
    for (const m of this.heartShards) {
      const u = m.userData;
      m.position.copy(u.dir).multiplyScalar(0.04 + Math.sin(s.breath * 2 + u.seed) * 0.025 + gap * 0.5);
      m.rotation.z = s.breath * 0.3 + u.seed;
    }
    this.heartMat.emissiveIntensity = (2.1 + pulse * 3.2) * veil * s.intensity;
    this.core.rotation.set(s.spin * 3.2, s.spin * 2.4, 0);
    this.core.scale.setScalar((0.85 + pulse * 0.55) * (s.alive ? 1 : 0));

    this.furnace.intensity = (2.2 + pulse * 3.6 + gap * 11) * veil * s.intensity;
    this.fres.value = (0.32 + s.hit * 1.5 + s.charge * 0.35) * veil * s.intensity;

    for (const a of this.arcs) {
      const u = a.pivot.userData;
      a.pivot.rotation.x += dt * u.ax * (1 + s.phase * 0.3);
      a.pivot.rotation.y += dt * u.ay * (1 + s.phase * 0.3);
      a.pivot.rotation.z += dt * u.az;
      a.mat.opacity = (0.4 + s.hit * 0.45 + Math.sin(s.breath * 1.4 + u.ph) * 0.12) * veil * s.intensity;
    }

    const d = this.dummy;
    for (let i = 0; i < this.beltCount; i++) {
      const b = this.beltData[i];
      b.ph += dt * b.speed * (1 + s.phase * 0.3);
      const r = b.r * (1 + gap * 0.7 + s.hit * 0.3);
      d.position.set(Math.cos(b.ph) * r, Math.sin(b.ph * 1.4) * b.bob, Math.sin(b.ph) * r);
      d.position.applyAxisAngle(this.tmpAxis, b.tilt);
      d.rotation.set(b.ph * b.spin, b.ph * b.spin * 0.7, 0);
      d.scale.setScalar(b.s * (s.alive ? 1 : 0));
      d.updateMatrix();
      this.beltMesh.setMatrixAt(i, d.matrix);
    }
    this.beltMesh.instanceMatrix.needsUpdate = true;
    this.beltMat.emissiveIntensity = s.hit * 0.9 * veil;

    this.wardMat.opacity = s.shield * 0.8 * veil * s.intensity;
    this.ward.scale.setScalar(1 + s.shield * 0.1 + gap * 0.4);
    this.ward.rotation.y += dt * 0.32;
    this.ward.rotation.x += dt * 0.18;

    this.root.visible = s.visible;
    this.bloom.strength = (0.52 + s.hit * 1.0 + s.charge * 0.22) * veil;
  }

  render() { this.composer.render(); }
}
