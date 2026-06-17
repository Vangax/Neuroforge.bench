import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BandPowerData } from "../../api/client";
import { CH32 } from "../../lib/synthetic";
import { inferno } from "../../lib/format";

const POS = new Map(CH32.map((c) => [c.name, c]));

interface Elec { name: string; mat: THREE.MeshStandardMaterial; mesh: THREE.Mesh }

/** Project a 2D topo coord (nose +y) onto the upper hemisphere of the head. */
function to3D(x: number, y: number): THREE.Vector3 {
  const r = Math.min(Math.hypot(x, y), 1);
  const theta = r * (Math.PI / 2) * 1.02;
  const phi = Math.atan2(y, x);
  return new THREE.Vector3(
    Math.sin(theta) * Math.cos(phi) * 1.0,
    Math.cos(theta) * 1.05,
    Math.sin(theta) * Math.sin(phi) * 1.1
  ).multiplyScalar(1.06);
}

function applyColors(elecs: Elec[], bp: BandPowerData, band: string) {
  const vals = bp.bands[band] ?? [];
  const map = new Map(bp.ch_names.map((n, i) => [n, vals[i]]));
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (const e of elecs) {
    const v = map.get(e.name) ?? 0;
    const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    const col = new THREE.Color(inferno(t));
    e.mat.color.copy(col);
    e.mat.emissive.copy(col).multiplyScalar(0.5);
    e.mesh.scale.setScalar(0.7 + t * 0.9);
  }
}

export default function Brain3D({ bandpower, band }: { bandpower: BandPowerData; band: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef(band);
  bandRef.current = band;
  const elecRef = useRef<Elec[]>([]);

  // build scene once per dataset
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth, H = 250;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0.5, 3.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.1;
    controls.minDistance = 2.4;
    controls.maxDistance = 6;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(1, 36, 28),
      new THREE.MeshBasicMaterial({ color: 0xff2f5e, wireframe: true, transparent: true, opacity: 0.12 })
    );
    head.scale.set(1.0, 1.06, 1.12);
    scene.add(head);

    const brainGeo = new THREE.IcosahedronGeometry(0.8, 4);
    const p = brainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 0.06 * Math.sin(v.x * 6) * Math.cos(v.y * 7) + 0.05 * Math.sin(v.z * 8);
      v.multiplyScalar(1 + n);
      p.setXYZ(i, v.x, v.y * 0.92, v.z * 1.04);
    }
    brainGeo.computeVertexNormals();
    const brain = new THREE.Mesh(
      brainGeo,
      new THREE.MeshBasicMaterial({ color: 0xff8a1e, wireframe: true, transparent: true, opacity: 0.22 })
    );
    scene.add(brain);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.81, 0.004, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0xff2f5e, transparent: true, opacity: 0.32 })
    );
    ring.rotation.y = Math.PI / 2;
    scene.add(ring);

    scene.add(new THREE.AmbientLight(0x3a2230, 1.7));
    const pl = new THREE.PointLight(0xffffff, 1.4);
    pl.position.set(3, 4, 3);
    scene.add(pl);

    const elecGeo = new THREE.SphereGeometry(0.05, 14, 14);
    const elecs: Elec[] = [];
    for (const name of bandpower.ch_names) {
      const c = POS.get(name);
      if (!c) continue;
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff2f5e, emissive: 0x331018, emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.4,
      });
      const m = new THREE.Mesh(elecGeo, mat);
      m.position.copy(to3D(c.x, c.y));
      scene.add(m);
      elecs.push({ name, mat, mesh: m });
    }
    elecRef.current = elecs;
    applyColors(elecs, bandpower, bandRef.current);

    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      renderer.setSize(w, H);
      camera.aspect = w / H; camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [bandpower]);

  // recolor on band change
  useEffect(() => {
    if (elecRef.current.length) applyColors(elecRef.current, bandpower, band);
  }, [band, bandpower]);

  return (
    <div className="center" style={{ width: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: 250 }} />
    </div>
  );
}
