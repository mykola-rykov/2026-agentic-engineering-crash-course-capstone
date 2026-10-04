# Stage 1 viewer evidence

The Alpine-Adriatic package was installed with `node scripts/install-terrain.mjs terrain/packages/alpine-adriatic` and included in a fresh production build. The package covers 220.02 × 220.02 km at a 30 m grid spacing and is 379,354,027 bytes uncompressed, including metadata and Natural Earth context.

Run `pnpm browser:install` once during development setup, then `pnpm check` and `pnpm test:browser`. The latter launches Chromium in a new browser context and serves the build using the dependency-free localhost launcher. Every external browser request is blocked and recorded as a test failure. Browser downloads are a development dependency; the installed viewer never downloads a browser.

Verified: terrain and local context load; coordinate entry selects the launch with a DSM elevation of 282.3 m in EGM2008; top-down and perspective switching retain the selection and use one canvas; absent WebGL2 produces an explicit unsupported message. The screenshot is generated at `test-results/terrain-viewer.png`. These checks verify the foundation, not the later complete mission workflow or performance targets.

Terrain geometry uses the three coarsest available grids (960/480/240 m for this package), selected by camera distance. It never constructs a dense full-resolution regional mesh. Elevation is visually exaggerated 3×; coordinate sampling and numerical heights remain unscaled. Unknown cells have no display triangles. Coastal and administrative lines are draped on the overview surface, with up to 18 locally bundled labels. Numerical sampling uses the 30 m obstruction/display grids independently of rendering.

The tile cache retains at most 32 MiB, with at most four tile loads pending. Scene teardown releases geometries, materials, label textures, controls, observers, and the WebGL context. Worker jobs yield between bounded batches; replacement/cancellation invalidates their ids in the client. Transferable arrays are fresh copies, leaving cache ownership unchanged. Lifecycle tests exercise cancellation, replacement, late progress/results, and detached-copy ownership.
