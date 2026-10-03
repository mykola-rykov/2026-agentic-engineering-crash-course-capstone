import { useEffect, useRef, useState } from 'react';
import { Color, GridHelper, PerspectiveCamera, Scene as ThreeScene, WebGLRenderer } from 'three';

export default function Scene() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) {
      queueMicrotask(() => setError('WebGL2 is required. Open this planner in a supported desktop browser.'));
      return;
    }
    const renderer = new WebGLRenderer({ canvas, context, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new ThreeScene();
    scene.background = new Color('#16232a');
    const grid = new GridHelper(200, 20, '#557783', '#293e46');
    scene.add(grid);
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(110, 100, 110);
    camera.lookAt(0, 0, 0);
    container.append(canvas);
    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      observer.disconnect();
      grid.geometry.dispose();
      for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return <div className="scene" ref={host} aria-label="Empty 3D scene preview">
    <p className="scene-caption" role={error ? 'alert' : undefined}>{error ?? 'Scene preview · No terrain data'}</p>
  </div>;
}
