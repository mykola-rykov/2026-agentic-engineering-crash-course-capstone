import { useEffect, useRef, useState } from 'react';
import { AmbientLight, BufferAttribute, BufferGeometry, Color, ConeGeometry, Line, LineBasicMaterial, DirectionalLight, LOD, Mesh, MeshLambertMaterial, PerspectiveCamera, Raycaster, Scene as ThreeScene, Vector2, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TerrainStore } from '../terrain/store';
import { createProjection } from '../terrain/coordinates';
import type { Coordinate, ProjectedPoint } from '../terrain/coordinates';
import { terrainGeometry } from './terrain-geometry';
import { geographicContext, disposeContext } from './context';
import type { Group } from 'three';
import type { ScenarioResult } from '../contracts/result';

interface Props { metric: 'margin' | 'power'; requiredMarginDb: number; route: ScenarioResult | null; sampleIndex: number; onInspect: (index: number) => void; store: TerrainStore; mode: 'perspective' | 'top'; selected: (ProjectedPoint & { surfaceM: number }) | null; onPick: (point: Coordinate) => void }
export default function Scene({ store, mode, selected, onPick, route, sampleIndex, onInspect, metric, requiredMarginDb }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ camera: PerspectiveCamera; controls: OrbitControls; marker: Mesh; routeMarker: Mesh; scene: ThreeScene; routeLine: Line | null } | null>(null);
  const pick = useRef(onPick);
  const inspect = useRef(onInspect);
  const [message, setMessage] = useState('Loading local terrain…');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { pick.current = onPick; inspect.current = onInspect; }, [onPick, onInspect]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let live = true;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) { queueMicrotask(() => { if (live) setError('WebGL2 is required. Open this planner in a supported desktop browser.'); }); return () => { live = false; }; }
    const renderer = new WebGLRenderer({ canvas, context, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new ThreeScene(); scene.background = new Color('#16232a');
    scene.add(new AmbientLight(0xffffff, 1.3));
    const light = new DirectionalLight(0xffffff, 2); light.position.set(-80, 160, 60); scene.add(light);
    const camera = new PerspectiveCamera(45, 1, .01, 2500);
    camera.position.set(190, 190, 190);
    const controls = new OrbitControls(camera, canvas); controls.minDistance = 20; controls.maxDistance = 700;
    const marker = new Mesh(new ConeGeometry(1, 3, 12), new MeshLambertMaterial({ color: '#8ac6bb' }));
    marker.visible = false; scene.add(marker);
    const routeMarker = new Mesh(new ConeGeometry(.8, 2, 12), new MeshLambertMaterial({ color: '#e0c88e' })); routeMarker.visible = false; scene.add(routeMarker);
    runtime.current = { camera, controls, marker, routeMarker, scene, routeLine: null };
    let contextGroup: Group | null = null;
    const lod = new LOD(); scene.add(lod);
    const projection = createProjection(store.manifest);
    let down = [0, 0];
    const pointerDown = (event: PointerEvent) => { down = [event.clientX, event.clientY]; };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down[0]!, event.clientY - down[1]!) > 5) return;
      const rect = canvas.getBoundingClientRect(), ray = new Raycaster();
      ray.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      ray.params.Line.threshold = .4;
      const line = runtime.current?.routeLine;
      const routeHit = line && ray.intersectObject(line)[0];
      if (routeHit && routeHit.index !== undefined) { inspect.current(routeHit.index); return; }
      const mesh = lod.levels.find((level) => level.object.visible)?.object;
      const hit = mesh && ray.intersectObject(mesh)[0];
      if (hit) pick.current(projection.inverse({ xM: hit.point.x * 1000, yM: -hit.point.z * 1000 }));
    };
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointerup', pointerUp);
    container.append(canvas);
    const resize = () => { const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    let frame = 0;
    const animate = () => { if (!live) return; controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    void (async () => {
      const last = store.manifest.levels.length - 1;
      for (let index = last; index >= Math.max(0, last - 2); index--) {
        const geometry = await terrainGeometry(store, index, () => !live);
        if (!geometry) return;
        if (!live) { geometry.dispose(); return; }
        lod.addLevel(new Mesh(geometry, new MeshLambertMaterial({ color: '#b9b9b9' })), index === last ? 350 : index === last - 1 ? 180 : 0);
      }
      contextGroup = await geographicContext(store, () => !live);
      if (contextGroup && live) scene.add(contextGroup);
      else if (contextGroup) disposeContext(contextGroup);
      if (live) setMessage('Local terrain ready · distance-based detail · height display 3×');
    })().catch((reason: unknown) => { if (live) setError(String(reason)); });
    return () => {
      live = false; runtime.current = null; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp);
      scene.traverse((object) => { if (object instanceof Mesh || object instanceof Line) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
      if (contextGroup) disposeContext(contextGroup);
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    };
  }, [store]);
  useEffect(() => {
    const current = runtime.current; if (!current) return;
    if (mode === 'top') current.camera.position.set(0, 330, .001); else current.camera.position.set(190, 190, 190);
    current.controls.target.set(0, 0, 0); current.controls.enableRotate = mode !== 'top'; current.controls.update();
  }, [mode, store]);
  // Three.js objects are mutable rendering resources owned by this effect.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => { const marker = runtime.current?.marker; if (marker) { marker.visible = selected !== null; if (selected) marker.position.set(selected.xM / 1000, selected.surfaceM * .003 + 2, -selected.yM / 1000); } }, [selected, store]);
  useEffect(() => {
    const current = runtime.current; if (!current || !route) return;
    const projection = createProjection(store.manifest), positions = new Float32Array(route.routeSamples.length * 3), colors = new Float32Array(positions.length);
    route.routeSamples.forEach((sample, index) => {
      const point = projection.forward(sample.position); positions.set([point.xM / 1000, sample.altitude.metres * .003, -point.yM / 1000], index * 3);
      const margin = sample.uplink && sample.downlink ? Math.min(sample.uplink.availableMarginDb, sample.downlink.availableMarginDb) : null;
      const value = sample.clearance.status === 'unknown' ? null : metric === 'margin' ? margin === null ? null : margin - requiredMarginDb : sample.uplink && sample.downlink ? Math.min(sample.uplink.receivedPowerDbm, sample.downlink.receivedPowerDbm) + 100 : null;
      const color = new Color(value === null ? '#89969e' : value < 0 ? '#e36e6e' : value < 10 ? '#e0c88e' : '#8ac6bb'); colors.set([color.r, color.g, color.b], index * 3);
    });
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const line = new Line(geometry, new LineBasicMaterial({ vertexColors: true })); current.scene.add(line); current.routeLine = line;
    return () => { current.scene.remove(line); if (current.routeLine === line) current.routeLine = null; geometry.dispose(); (line.material as LineBasicMaterial).dispose(); };
  }, [route, store, metric, requiredMarginDb]);
  useEffect(() => {
    const current = runtime.current; if (!current) return;
    const sample = route?.routeSamples[sampleIndex]; current.routeMarker.visible = !!sample;
    if (sample) { const point = createProjection(store.manifest).forward(sample.position); current.routeMarker.position.set(point.xM / 1000, sample.altitude.metres * .003 + 1.5, -point.yM / 1000); }
  }, [route, sampleIndex, store]);
  return <div className="scene" ref={host} aria-label="Regional 3D terrain"><p className="scene-caption" role={error ? 'alert' : 'status'}>{error ?? message}{route && <><br />{metric === 'margin' ? 'Two-way margin above requirement: red <0 · amber 0–10 · green ≥10 dB' : 'Two-way received power: red <−100 · amber −100 to −90 · green ≥−90 dBm'} · gray unknown</>}</p></div>;
}
