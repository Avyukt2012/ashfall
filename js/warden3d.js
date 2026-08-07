import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

export class Warden {
  constructor(canvas) {
    this.cv = canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, 9);
    this.dist = 9;

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.body = new THREE.Group();
    this.root.add(this.body);

    this.state = {
      hp: 1, phase: 0, hit: 0, charge: 0, shield: 0, eclipse: 0,
      recoil: 0, alive: true, visible: false, spin: 0, breath: 0, intensity: 1
    };

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    this.buildLights();
    this.buildShards();
    this.buildCore();
    this.buildRings();
    this.buildComposer();
    this.resize();
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.05);
    this.scene.add(this.ambient);

    this.key = new THREE.DirectionalLight(0xfff2e6, 1.7);
    this.key.position.set(-3, 5, 4);
    this.scene.add(this.key);

    this.rim = new THREE.DirectionalLight(0xffd9c0, 0.9);
    this.rim.position.set(4, -2, -3);
    this.scene.add(this.rim);

    this.furnace = new THREE.PointLight(0xff3d1f, 4, 9, 2);
    this.root.add(this.furnace);
  }

  buildShards() {
    const src = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
    const pos = src.getAttribute('position');
    this.shards = [];

    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0807, roughness: 0.34, metalness: 0.9, envMapIntensity: 0.55, flatShading: true
    });
    this.shardMat = mat;

    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
      const inner = mid.clone().multiplyScalar(0.34);

      const g = new THREE.BufferGeometry();
      const verts = new Float32Array([
        a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
        a.x, a.y, a.z, c.x, c.y, c.z, inner.x, inner.y, inner.z,
        c.x, c.y, c.z, b.x, b.y, b.z, inner.x, inner.y, inner.z,
        b.x, b.y, b.z, a.x, a.y, a.z, inner.x, inner.y, inner.z
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      g.computeVertexNormals();

      const m = new THREE.Mesh(g, mat);
      m.userData.dir = mid.clone().normalize();
      m.userData.seed = Math.random() * TAU;
      this.body.add(m);
      this.shards.push(m);
    }
  }

  radialTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  buildCore() {
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xff3d1f, transparent: true, opacity: 0.9 });
    this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 2), this.shellMat);
    this.body.add(this.shell);

    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.95 });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), this.coreMat);
    this.body.add(this.core);

    this.haloMat = new THREE.SpriteMaterial({
      map: this.radialTexture(),
      color: 0xff3d1f, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(3.2);
    this.body.add(this.halo);
  }

  buildRings() {
    this.rings = [];
    const defs = [
      { r: 1.62, t: 0.012, rx: 1.2, ry: 0.3, s: 0.5, c: 0xff3d1f },
      { r: 2.0, t: 0.008, rx: -0.5, ry: 1.1, s: -0.36, c: 0xd9ff4a },
      { r: 2.42, t: 0.006, rx: 0.4, ry: -0.8, s: 0.24, c: 0xff3d1f }
    ];
    for (const d of defs) {
      const mat = new THREE.MeshBasicMaterial({
        color: d.c, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const m = new THREE.Mesh(new THREE.TorusGeometry(d.r, d.t, 8, 128), mat);
      m.rotation.set(d.rx, d.ry, 0);
      m.userData.spin = d.s;
      this.root.add(m);
      this.rings.push(m);
    }

    this.ward = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.02, 6, 4),
      new THREE.MeshBasicMaterial({
        color: 0xf4ede0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    this.ward.rotation.z = Math.PI / 4;
    this.root.add(this.ward);
  }

  buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setPalette(pal) {
    const hex = h => new THREE.Color(h || '#ff3d1f');
    this.shardMat.color = hex(pal.body);
    this.shellMat.color = hex(pal.ember);
    this.furnace.color = hex(pal.ember);
    this.coreMat.color = hex(pal.pale);
    this.haloMat.color = hex(pal.ember);
    this.rings[0].material.color = hex(pal.ember);
    this.rings[1].material.color = hex(pal.acid);
    this.rings[2].material.color = hex(pal.ember);
    this.ward.material.color = hex(pal.pale);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(this.dpr);
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
    const halfW = halfH * this.camera.aspect;
    this.root.position.set(ndcX * halfW, ndcY * halfH, 0);
    this.unit = this.viewH / this.h;
    this.root.scale.setScalar(R * this.unit * 0.92);
  }

  update(dt) {
    const s = this.state;
    s.breath += dt * (1.1 + s.phase * 0.28);
    s.spin += dt * (0.16 + s.phase * 0.12);
    s.hit *= Math.pow(0.0016, dt);

    const veil = 1 - s.eclipse * 0.88;
    const gap = 0.06 + s.phase * 0.075 + (1 - s.hp) * 0.1
      + Math.sin(s.breath * 1.05) * 0.014 + s.hit * 0.24;

    for (const m of this.shards) {
      const d = m.userData.dir;
      const wob = 1 + Math.sin(s.breath * 1.5 + m.userData.seed) * 0.03;
      m.position.copy(d).multiplyScalar(gap * wob);
      m.rotation.x = Math.sin(s.breath * 0.6 + m.userData.seed) * 0.12 * (1 + s.phase);
      m.rotation.y = Math.cos(s.breath * 0.5 + m.userData.seed) * 0.12 * (1 + s.phase);
    }

    this.body.rotation.y = s.spin * 0.9;
    this.body.rotation.x = Math.sin(s.breath * 0.42) * 0.22;
    this.body.rotation.z = Math.sin(s.breath * 0.3) * 0.1 + s.recoil * 0.02;

    const pulse = 0.55 + Math.sin(s.breath * 3.1) * 0.12 + s.hit * 0.9 + s.charge * 0.4;
    this.furnace.intensity = (2.2 + pulse * 3.6 + gap * 11) * veil * s.intensity;
    this.core.scale.setScalar((0.85 + pulse * 0.3) * (s.alive ? 1 : 0));
    this.shell.scale.setScalar((0.86 + gap * 0.5) * (s.alive ? 1 : 0));
    this.shellMat.opacity = Math.min(0.95, (0.3 + gap * 2.2 + s.hit * 0.5)) * veil * s.intensity;
    this.coreMat.opacity = 0.95 * veil * s.intensity;
    this.haloMat.opacity = (0.16 + pulse * 0.2) * veil * s.intensity;
    this.halo.scale.setScalar(2.6 + pulse * 1.1 + s.charge);
    this.shardMat.emissive = this.shardMat.emissive || new THREE.Color(0, 0, 0);
    this.shardMat.emissiveIntensity = s.hit * 0.9;

    for (const r of this.rings) {
      r.rotation.z += dt * r.userData.spin * (1 + s.phase * 0.35);
      r.material.opacity = (0.42 + s.hit * 0.4) * veil * s.intensity;
    }

    this.ward.material.opacity = s.shield * 0.85 * s.intensity;
    this.ward.scale.setScalar(1 + s.shield * 0.12);
    this.ward.rotation.z += dt * 0.28;

    this.root.visible = s.visible;
    this.bloom.strength = (0.5 + s.hit * 0.9 + s.charge * 0.22) * veil;
  }

  render() {
    this.composer.render();
  }
}
