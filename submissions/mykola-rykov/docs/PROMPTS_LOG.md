# Initial prompt (gpt-6-astra medium, Plan mode):

Plan building a simple interactive 3D RF drone flight-planning Web tool with no backend. Its central question would be:
“Given this terrain, route, frequency, transmitter, receiver, antennas and aircraft configuration, where can the drone fly while maintaining a specified link margin with acceptable energy and aerodynamic cost?”
Research and propose open data sources for the real terrain elevation data for the given region. The terrain data set should be less than 500MB for a flight of up to 100km length.
Propose the most pragmatic architecture for the tool that has no backend, no user registration/login, a pure one-off solution: user picks a starting point on a map, enters their drone flight range, picks up a destination point, multiselects types of antennas and emission power levels which are available to them, and sees a proposed collection of heatmap visualisation of the RF signal level along the flight path along with their pros and cons per each antenna/power level/flight path combination.
Optimise for performance, avoid paid commercial tools like Cesium, Mapbox, Google Earth, etc. 3D map visualisation can be as simple as some basic greyscale 3D terrain built from the open terrain level data plus some shading from a fixed light source.

---

# Manually added vercel-react-best-practices skill:

npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices -a codex --copy -y
