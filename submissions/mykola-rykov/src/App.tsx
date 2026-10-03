import { lazy, Suspense, useState } from 'react';

const Scene = lazy(() => import('./scene/Scene'));

export default function App() {
  const [showScene, setShowScene] = useState(false);
  return (
    <main>
      <header>
        <span className="eyebrow">REGIONAL FLIGHT PLANNING</span>
        <h1>RF Flight Planner</h1>
        <p>Terrain, radio links, and aircraft endurance in one offline workspace.</p>
      </header>
      <section className="workspace" aria-labelledby="region-title">
        <div className="region-panel">
          <span className="status">No terrain installed</span>
          <h2 id="region-title">Start with a region</h2>
          <p>A regional terrain package is required before placing a mission or estimating connectivity.</p>
          <p>Terrain preparation and mission analysis are being implemented. No feasibility results are available yet.</p>
          <button onClick={() => setShowScene((shown) => !shown)} aria-expanded={showScene}>
            {showScene ? 'Close scene preview' : 'Open scene preview'}
          </button>
        </div>
        <div className="scene-panel">
          {showScene ? (
            <Suspense fallback={<p role="status">Loading scene…</p>}><Scene /></Suspense>
          ) : <p className="placeholder">Your terrain workspace</p>}
        </div>
      </section>
      <footer>Desktop WebGL2 · Local files · Engineering estimates</footer>
    </main>
  );
}
