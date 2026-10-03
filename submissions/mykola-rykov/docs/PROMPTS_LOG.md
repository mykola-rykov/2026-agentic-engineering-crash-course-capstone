# Initial prompt (gpt-6-astra medium, Plan mode):

Plan building a simple interactive 3D RF drone flight-planning Web tool with no backend. Its central question would be:
“Given this terrain, route, frequency, transmitter, receiver, antennas and aircraft configuration, where can the drone fly while maintaining a specified link margin with acceptable energy and aerodynamic cost?”
Research and propose open data sources for the real terrain elevation data for the given region. The terrain data set should be less than 500MB for a flight of up to 100km length.
Propose the most pragmatic architecture for the tool that has no backend, no user registration/login, a pure one-off solution: user picks a starting point on a map, enters their drone flight range, picks up a destination point, multiselects types of antennas and emission power levels which are available to them, and sees a proposed collection of heatmap visualisation of the RF signal level along the flight path along with their pros and cons per each antenna/power level/flight path combination.
Optimise for performance, avoid paid commercial tools like Cesium, Mapbox, Google Earth, etc. 3D map visualisation can be as simple as some basic greyscale 3D terrain built from the open terrain level data plus some shading from a fixed light source.

---

# Manually added vercel-react-best-practices skill:

npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices -a codex --copy -y

---

openspec init

---

$openspec-explore Look at submissions/mykola-rykov/docs/INITIAL_PLAN.md and use Openspec to describe the plan implementation.

I read docs/INITIAL_PLAN.md. OpenSpec is initialized, but there are no existing specs or changes, and no application code yet.

I recommend one change, **`offline-rf-flight-planner`**, covering v1, with tasks grouped into the plan’s five delivery stages:

| Stage                        | Implementation scope                                                                                                                   | Acceptance gate                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1\. Terrain and viewer       | Python/GDAL package builder; versioned manifest; display and conservative obstruction grids; React/Three.js viewer; bounded tile cache | Package below 500,000,000 bytes; peaks and missing-data masks preserved; viewer works offline                     |
| 2\. Manual-route RF analysis | Waypoints; terrain profiles; independent uplink/downlink budgets; curvature, diffraction, Fresnel clearance and antenna orientation    | Analytical free-space and independent diffraction fixtures pass; missing terrain prevents confident feasibility   |
| 3\. Aircraft and comparisons | Separate fixed-wing and multirotor models; battery, antenna mass/drag and radio electrical power; scenario comparison cards            | Hand-calculated energy fixtures pass; reserve and weaker-link constraints govern feasibility                      |
| 4\. Automatic routing        | Corridor search; heading-aware fixed-wing motion; altitude and aircraft constraints; refinement, smoothing and return-leg evaluation   | Final routes satisfy constraints after fine sampling; failed searches report their corridor and resolution limits |
| 5\. Delivery and validation  | Launcher; bundled assets; additional-region validation; offline installation checks; memory and timing benchmarks                      | Networking-disabled installation works; measured performance meets the documented targets; `pnpm check` passes    |

The OpenSpec artifacts would be:

- **`proposal.md`** — v1 outcome, capabilities and exclusions.
- **`design.md`** — terrain format, coordinate/datum handling, worker protocol, numerical models, caching and routing architecture.
- **`specs/*/spec.md`** — requirements and scenarios for terrain packages, offline runtime, mission editing/persistence, RF analysis, aircraft energy, route search and result comparison.
- **`tasks.md`** — ordered implementation work with validation gates for each stage.

The artifacts should distinguish feasibility failures from unknown results, preserve separate outbound/return evaluations, and treat performance and package sizes as targets requiring measurement. Initial region selection and independently sourced diffraction fixtures remain implementation decisions.

**Should I create `openspec/changes/offline-rf-flight-planner/` with those proposal, design, capability specs and task artifacts?**

I need this confirmation because the openspec-explore skill (.codex/skills/openspec-explore/SKILL.md) says: “Before the first write-capable action, name the artifacts or files you would change … ask a direct yes/no question.” No files have been changed.

---

create `openspec/changes/offline-rf-flight-planner/` with those proposal, design, capability specs and task artifacts

---

`pnpm check` failed because no `check` command exists yet. Establishing it is the first implementation task.

Implementation can begin with `$openspec-apply-change offline-rf-flight-planner`.

---

$openspec-apply-change offline-rf-flight-planner

---
