// The first-person world renderer: three.js, its own requestAnimationFrame
// loop, reading the client's state directly. The world is drawn as blocks:
// one ground cube per tile, deposits stacked on top (trees, stone, water),
// buildings as stacked boxes, other players as blocky figures. The camera is
// our own avatar's eyes; yaw and pitch are set by Game's mouse look.
import * as THREE from "three";
import { BUILDINGS, STAGES, type BuildingType } from "../shared/content.ts";
import type { Building, RoomState, Snapshot } from "../shared/protocol.ts";
import { blockHeight } from "../shared/noise.ts";
import { effectiveLife, lifeCap, placementProblem } from "../shared/sim.ts";
import type { GameClient } from "./net.ts";
import { PLAYER_COLOURS, type View } from "./render.ts";

const EYE = 1.6;
const REACH = 9;

const BUILD_LOOK: Record<BuildingType, { colour: string; roof: string; h: number }> = {
  extractor: { colour: "#d9a441", roof: "#8a5a2b", h: 1.2 },
  furnace: { colour: "#a35d4a", roof: "#5b3a35", h: 2 },
  solar: { colour: "#3d5a8a", roof: "#7fb2ff", h: 0.3 },
  city: { colour: "#f3e2c7", roof: "#d0664f", h: 2.4 },
  datacentre: { colour: "#5a6170", roof: "#2e333d", h: 2.8 },
  habitat: { colour: "#d8e6ee", roof: "#9fc8de", h: 2.2 },
  radiator: { colour: "#8b8f99", roof: "#ff7a4d", h: 1.5 },
  relay: { colour: "#c7cbd6", roof: "#6fd0ff", h: 3 },
  plaza: { colour: "#e0c99a", roof: "#e8735a", h: 0.2 },
  depot: { colour: "#a58a5c", roof: "#6b5a3a", h: 2.2 },
  engine: { colour: "#6b6f88", roof: "#c9c4ff", h: 2.8 },
};

const hash = (i: number): number => {
  let h = i * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const rgb = (c: [number, number, number]): THREE.Color => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);

interface Avatar {
  group: THREE.Group;
  x: number;
  y: number;
}

interface Bit {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  t0: number;
}

export class Renderer {
  yaw = Math.PI * 0.75;
  pitch = -0.25;
  frameMs = 0;
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
  private ray = new THREE.Raycaster();
  private box = new THREE.BoxGeometry(1, 1, 1);
  private ground: THREE.InstancedMesh | null = null;
  private turf: THREE.InstancedMesh | null = null;
  private blocks: THREE.InstancedMesh | null = null;
  private logs: THREE.InstancedMesh | null = null;
  private leaves: THREE.InstancedMesh | null = null;
  /** which tile each deposit voxel belongs to, by instance id */
  private owners = new Map<THREE.InstancedMesh, Int32Array>();
  private heights: number[] = [];
  private eye = EYE;
  private worldKey = "";
  private lastVersion = -1;
  private buildings = new Map<number, { key: string; group: THREE.Group }>();
  private avatars = new Map<string, Avatar>();
  private cursor: THREE.LineSegments;
  private hand: THREE.Mesh;
  private swingAt = 0;
  private bits: Bit[] = [];
  private sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.1);
  private raf = 0;
  private last = performance.now();
  private hit: { tile: [number, number]; building: Building | null } | null = null;
  private canvas: HTMLCanvasElement;
  private client: GameClient;
  private view: View;

  constructor(canvas: HTMLCanvasElement, client: GameClient, view: View) {
    this.canvas = canvas;
    this.client = client;
    this.view = view;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera, this.sun, this.hemi);
    this.sun.position.set(-30, 50, -20);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
    this.cursor = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x111111 }));
    this.scene.add(this.cursor);

    this.hand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.55), new THREE.MeshLambertMaterial({ color: 0xe0b48c }));
    this.hand.position.set(0.38, -0.32, -0.55);
    this.camera.add(this.hand);

    client.onTile = (i, before, after) => this.burst(i, before - after);
    client.onBoundary = () => {
      this.worldKey = "";
      for (const b of this.bits) this.scene.remove(b.mesh);
      this.bits = [];
    };
  }

  start(): void {
    const loop = (now: number): void => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.gl.dispose();
  }

  swing(): void {
    this.swingAt = performance.now();
  }

  /** The tile under the crosshair (the arguments are ignored: aim is the view). */
  pick(_sx?: number, _sy?: number): [number, number] | null {
    return this.hit?.tile ?? null;
  }

  pickBuilding(_sx?: number, _sy?: number): Building | null {
    return this.hit?.building ?? null;
  }

  facingTile(): [number, number] | null {
    return this.pick();
  }

  target(): [number, number] | null {
    return this.pick();
  }

  /** Horizontal unit vectors for walking, in tile coordinates (x, y). */
  forward(): [number, number] {
    return [-Math.sin(this.yaw), -Math.cos(this.yaw)];
  }

  photo(): string {
    return this.canvas.toDataURL("image/png");
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const size = this.gl.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) {
      this.gl.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
  }

  private buildWorld(s: Snapshot): void {
    for (const m of [this.ground, this.turf, this.blocks, this.logs, this.leaves]) if (m) this.scene.remove(m);
    const n = s.w * s.w;
    this.heights = s.tiles.map((t, i) => blockHeight(s.seed, s.stage, i % s.w, Math.floor(i / s.w), t.t));
    this.ground = new THREE.InstancedMesh(this.box, new THREE.MeshLambertMaterial(), n);
    this.turf = new THREE.InstancedMesh(this.box, new THREE.MeshLambertMaterial(), n);
    this.blocks = new THREE.InstancedMesh(this.box, new THREE.MeshLambertMaterial(), n * 2);
    this.logs = new THREE.InstancedMesh(this.box, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), n * 3);
    this.leaves = new THREE.InstancedMesh(this.box, new THREE.MeshLambertMaterial(), n * 10);
    this.owners = new Map([this.blocks, this.logs, this.leaves].map((m) => [m, new Int32Array(m.count)]));
    this.scene.add(this.ground, this.turf, this.blocks, this.logs, this.leaves);
    for (const { group } of this.buildings.values()) this.scene.remove(group);
    this.buildings.clear();
  }

  private heightAt(x: number, y: number): number {
    const s = this.client.state;
    if (!s) return 0;
    const i = Math.max(0, Math.min(s.w - 1, Math.round(y))) * s.w + Math.max(0, Math.min(s.w - 1, Math.round(x)));
    return this.heights[i] ?? 0;
  }

  /** Recolour and restack every block from the current state; cheap enough to run whenever the state changes. */
  private updateWorld(s: Snapshot): void {
    const st = STAGES[s.stage];
    const cap = lifeCap(s.ledger);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const pal = st.palette;
    const used = new Map<THREE.InstancedMesh, number>([[this.blocks!, 0], [this.logs!, 0], [this.leaves!, 0]]);
    const voxel = (mesh: THREE.InstancedMesh, tile: number, x: number, y: number, z: number, colour: THREE.Color | null, size = 0.98): void => {
      const k = used.get(mesh)!;
      if (k >= mesh.count) return;
      m.makeScale(size, size, size).setPosition(x, y + 0.5, z);
      mesh.setMatrixAt(k, m);
      if (colour) mesh.setColorAt(k, colour);
      this.owners.get(mesh)![k] = tile;
      used.set(mesh, k + 1);
    };
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      const x = i % s.w;
      const y = Math.floor(i / s.w);
      const full = t.init ? t.amt / t.init : 0;
      const jitter = (hash(i) - 0.5) * 0.08;
      const h = this.heights[i];
      // ground: a column of earth with a turf block on top whose colour is the land's life
      if (t.t === 2) {
        this.ground!.setMatrixAt(i, zero);
        this.turf!.setMatrixAt(i, zero);
      } else {
        const top = t.t === 1 ? h - 0.2 : h;
        m.makeScale(1, top + 3 - 0.2, 1).setPosition(x, (top - 0.2 - 3) / 2, y);
        this.ground!.setMatrixAt(i, m);
        m.makeScale(1, 0.2, 1).setPosition(x, top - 0.1, y);
        this.turf!.setMatrixAt(i, m);
        if (t.t === 1) c.set(full > 0 ? (st.id === "earth" ? 0x3f8fd0 : 0xc8e6ff) : 0x846c56);
        else if (t.t === 3) c.set(full > 0 ? 0xffd27a : 0x3a2828);
        else if (t.t === 4) c.setRGB(0.25 + hash(i) * 0.1, 0.24, 0.27);
        else {
          const k = Math.max(0, Math.min(1, effectiveLife(t, cap) / 100 + jitter));
          c.copy(rgb(pal.dead)).lerp(rgb(pal.lush), k);
        }
        c.offsetHSL(0, 0, (hash(i * 3) - 0.5) * 0.05);
        this.turf!.setColorAt(i, c);
        c.copy(rgb(pal.dead)).multiplyScalar(t.t === 1 ? 0.55 : 0.7).offsetHSL(0, 0, (hash(i * 5) - 0.5) * 0.04);
        this.ground!.setColorAt(i, c);
      }
      // deposits on top, as whole voxels (water is the ground itself)
      if (!t.d || t.amt <= 0 || t.b || t.t === 1 || t.t === 3) continue;
      if (t.d === "matter" && st.id === "earth") {
        // a tree: a trunk of logs and a crown of leaves that thins as it's cut
        const trunk = 1 + Math.round(2 * full);
        for (let k = 0; k < trunk; k++) voxel(this.logs!, i, x, h + k, y, null, 0.96);
        const leaf = new THREE.Color(pal.matter);
        const crown = h + trunk;
        if (full > 0.35) {
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              if (dx && dz && hash(i * 13 + dx * 3 + dz) < 0.3 * (1 - full)) continue;
              const lift = dx || dz ? 0 : 1;
              voxel(this.leaves!, i, x + dx, crown - 1 + lift, y + dz, leaf.clone().offsetHSL(0, 0, (hash(i + dx * 7 + dz * 11) - 0.5) * 0.08), 1);
            }
        } else voxel(this.leaves!, i, x, crown, y, leaf, 1);
      } else {
        // stone, ore, ice: stacked blocks, two high while plentiful
        c.set(pal[t.d]).offsetHSL(0, 0, (hash(i * 7) - 0.5) * 0.08);
        voxel(this.blocks!, i, x, h, y, c);
        if (full > 0.5) voxel(this.blocks!, i, x, h + 1, y, c.clone().offsetHSL(0, 0, 0.04), t.d === "coolant" ? 0.8 : 0.98);
      }
    }
    for (const [mesh, k] of used) for (let j = k; j < mesh.count; j++) mesh.setMatrixAt(j, zero);
    for (const mesh of [this.ground!, this.turf!, this.blocks!, this.logs!, this.leaves!]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    this.syncBuildings(s);
  }

  private syncBuildings(s: Snapshot): void {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      seen.add(b.id);
      const def = BUILDINGS[b.type];
      const done = Math.min(1, b.work / (def.build * 10));
      const key = `${b.type}:${Math.round(done * 20)}:${b.status === "ok"}:${b.owner ?? ""}`;
      const have = this.buildings.get(b.id);
      if (have?.key === key) continue;
      if (have) this.scene.remove(have.group);
      const look = BUILD_LOOK[b.type];
      const n = def.size;
      const g = new THREE.Group();
      const h = look.h * (0.15 + 0.85 * done);
      const body = new THREE.Mesh(this.box, new THREE.MeshLambertMaterial({ color: look.colour, transparent: done < 1, opacity: done < 1 ? 0.55 : 1 }));
      body.scale.set(n - 0.15, h, n - 0.15);
      body.position.y = h / 2;
      const roof = new THREE.Mesh(this.box, new THREE.MeshLambertMaterial({ color: look.roof, emissive: b.status === "ok" && done >= 1 ? look.roof : "#000", emissiveIntensity: 0.25 }));
      roof.scale.set(n - 0.05, 0.2, n - 0.05);
      roof.position.y = h + 0.1;
      g.add(body, roof);
      if (b.owner) {
        const p = s.players[b.owner];
        const flag = new THREE.Mesh(this.box, new THREE.MeshLambertMaterial({ color: PLAYER_COLOURS[(p?.colour ?? 0) % PLAYER_COLOURS.length] }));
        flag.scale.set(0.12, 0.5, 0.12);
        flag.position.set((n - 1) / 2 - 0.1, h + 0.45, (n - 1) / 2 - 0.1);
        g.add(flag);
      }
      let base = 0;
      for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) base = Math.max(base, this.heightAt(b.x + dx, b.y + dy));
      g.position.set(b.x + (n - 1) / 2, base, b.y + (n - 1) / 2);
      g.userData.building = b.id;
      this.scene.add(g);
      this.buildings.set(b.id, { key, group: g });
    }
    for (const [id, v] of this.buildings)
      if (!seen.has(id)) {
        this.scene.remove(v.group);
        this.buildings.delete(id);
      }
  }

  private avatar(colour: string): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: colour });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48c });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3b3550 });
    const part = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
      const p = new THREE.Mesh(this.box, m);
      p.scale.set(sx, sy, sz);
      p.position.set(x, y, z);
      g.add(p);
    };
    part(dark, 0.18, 0.7, 0.2, -0.11, 0.35, 0);
    part(dark, 0.18, 0.7, 0.2, 0.11, 0.35, 0);
    part(mat, 0.45, 0.6, 0.25, 0, 1.0, 0);
    part(skin, 0.4, 0.4, 0.4, 0, 1.5, 0);
    part(mat, 0.14, 0.6, 0.18, -0.3, 1.0, 0);
    part(mat, 0.14, 0.6, 0.18, 0.3, 1.0, 0);
    return g;
  }

  private syncAvatars(s: Snapshot, dt: number): void {
    const seen = new Set<string>();
    for (const p of Object.values(s.players)) {
      if (p.id === this.client.you || !p.connected) continue;
      seen.add(p.id);
      let a = this.avatars.get(p.id);
      if (!a) {
        a = { group: this.avatar(PLAYER_COLOURS[p.colour % PLAYER_COLOURS.length]), x: p.x, y: p.y };
        this.scene.add(a.group);
        this.avatars.set(p.id, a);
      }
      const k = Math.min(1, dt * 8);
      a.x += (p.x - a.x) * k;
      a.y += (p.y - a.y) * k;
      if (Math.hypot(p.x - a.x, p.y - a.y) > 4) [a.x, a.y] = [p.x, p.y];
      a.group.position.set(a.x, this.heightAt(a.x, a.y), a.y);
      const ang = (p.facing / 8) * Math.PI * 2;
      a.group.rotation.y = -ang + Math.PI / 2;
      const walking = p.dx !== 0 || p.dy !== 0;
      const sw = walking ? Math.sin(performance.now() / 120) * 0.15 : 0;
      a.group.position.y += Math.abs(sw) * 0.3;
    }
    for (const [id, a] of this.avatars)
      if (!seen.has(id)) {
        this.scene.remove(a.group);
        this.avatars.delete(id);
      }
  }

  private burst(i: number, _amount: number): void {
    const s = this.client.state;
    if (!s || this.view.low) return;
    const t = s.tiles[i];
    const colour = t.d ? STAGES[s.stage].palette[t.d] : "#ffffff";
    const mat = new THREE.MeshLambertMaterial({ color: colour });
    for (let k = 0; k < 6; k++) {
      const mesh = new THREE.Mesh(this.box, mat);
      mesh.scale.setScalar(0.12);
      mesh.position.set(i % s.w, (this.heights[i] ?? 0) + 0.8, Math.floor(i / s.w));
      this.scene.add(mesh);
      this.bits.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), t0: performance.now() });
    }
  }

  private aim(s: Snapshot): void {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.ray.far = REACH;
    const targets: THREE.Object3D[] = [this.blocks!, this.logs!, this.leaves!, this.turf!, this.ground!];
    for (const { group } of this.buildings.values()) targets.push(group);
    const hits = this.ray.intersectObjects(targets, true);
    this.hit = null;
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.building === undefined) o = o.parent;
      if (o) {
        const b = s.buildings.find((x) => x.id === o!.userData.building) ?? null;
        if (b) {
          this.hit = { tile: [b.x, b.y], building: b };
          break;
        }
      }
      if (h.instanceId === undefined) continue;
      const own = this.owners.get(h.object as THREE.InstancedMesh);
      const i = own ? own[h.instanceId] : h.instanceId;
      this.hit = { tile: [i % s.w, Math.floor(i / s.w)], building: null };
      break;
    }
  }

  frame(now: number): void {
    const t0 = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.resize();
    const s = this.client.state;
    if (!s) {
      this.scene.background = new THREE.Color(0xfdf3d8);
      this.gl.render(this.scene, this.camera);
      return;
    }
    this.client.predict(dt);
    const st = STAGES[s.stage];
    const key = `${s.gen}:${s.w}`;
    if (key !== this.worldKey) {
      this.worldKey = key;
      this.buildWorld(s);
      this.lastVersion = -1;
      const sky = new THREE.Color(st.palette.sky[0]);
      this.scene.background = sky;
      this.scene.fog = new THREE.Fog(new THREE.Color(st.palette.sky[1]).lerp(sky, 0.5), s.w * 0.6, s.w * 2.2);
      const dark = st.id === "system" || st.id === "universe";
      this.hemi.intensity = dark ? 0.6 : 1.1;
      this.sun.intensity = st.id === "sun" ? 2.2 : dark ? 0.8 : 1.6;
    }
    if (this.client.version !== this.lastVersion) {
      this.lastVersion = this.client.version;
      this.updateWorld(s);
    }
    this.syncAvatars(s, dt);

    // camera at our eyes; pull up and back during a transition and after the end
    let lift = 0;
    if (s.phase.k === "transition") lift = Math.max(0, Math.min(1, 1 - (s.phase.until - s.tick) / 90)) * 12;
    else if (s.phase.k === "ended") lift = 10;
    const bob = !this.view.reducedMotion && (this.client.me.dx || this.client.me.dy) ? Math.sin(now / 110) * 0.05 : 0;
    const ground = this.heightAt(this.client.me.x, this.client.me.y) + EYE;
    this.eye += (ground - this.eye) * (this.view.reducedMotion ? 1 : Math.min(1, dt * 10));
    this.camera.position.set(this.client.me.x, this.eye + bob + lift, this.client.me.y);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // hand swing
    const sw = Math.max(0, 1 - (now - this.swingAt) / 250);
    this.hand.rotation.x = -Math.sin(sw * Math.PI) * 1.1;
    this.hand.visible = lift === 0;

    // flying bits
    this.bits = this.bits.filter((b) => {
      const age = (now - b.t0) / 1000;
      if (age > 0.8) {
        this.scene.remove(b.mesh);
        return false;
      }
      b.v.y -= 9 * dt;
      b.mesh.position.addScaledVector(b.v, dt);
      return true;
    });

    this.aim(s);
    const tgt = this.hit?.tile;
    if (tgt) {
      const n = this.view.tool === "build" && this.view.build ? BUILDINGS[this.view.build].size : this.hit?.building ? BUILDINGS[this.hit.building.type].size : 1;
      const tall = this.hit?.building ? BUILD_LOOK[this.hit.building.type].h + 0.3 : 1;
      this.cursor.visible = true;
      this.cursor.scale.set(n, tall, n);
      let base = this.heightAt(tgt[0], tgt[1]);
      if (this.hit?.building) base = this.buildings.get(this.hit.building.id)?.group.position.y ?? base;
      this.cursor.position.set(tgt[0] + (n - 1) / 2, base + tall / 2, tgt[1] + (n - 1) / 2);
      const mat = this.cursor.material as THREE.LineBasicMaterial;
      if (this.view.tool === "build" && this.view.build) {
        const me = s.players[this.client.you];
        mat.color.set(placementProblem(s as RoomState, this.view.build, tgt[0], tgt[1], me ? { ...me, x: this.client.me.x, y: this.client.me.y } : undefined) ? 0xe04a3a : 0x3ad06a);
      } else if (this.view.tool === "demolish") mat.color.set(0xe08a3a);
      else mat.color.set(0x111111);
      this.view.hover = tgt;
    } else {
      this.cursor.visible = false;
      this.view.hover = null;
    }

    this.gl.render(this.scene, this.camera);
    this.frameMs = performance.now() - t0;
  }
}
