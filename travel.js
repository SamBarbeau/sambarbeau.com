const LOCATIONS = [
  // --- NORTH AMERICA ---
  { city: "Montreal",          country: "Canada",       lat: 45.5017,  lng: -73.5673 },
  { city: "Cozumel",           country: "Mexico",       lat: 20.4230,  lng: -86.9223 },
  { city: "Nassau",            country: "Bahamas",      lat: 25.0443,  lng: -77.3504 },
  { city: "Negril",            country: "Jamaica",      lat: 18.2781,  lng: -78.3484 },
  
  // USA (West to East Coast)
  // to add: yellowstone,
  { city: "San Diego",         country: "USA",          lat: 32.7157,  lng: -117.1611},
  { city: "Los Angeles",       country: "USA",          lat: 34.0522,  lng: -118.2437},
  { city: "Las Vegas",         country: "USA",          lat: 36.1716,  lng: -115.1391},
  { city: "Sedona",            country: "USA",          lat: 34.8697,  lng: -111.7610},
  { city: "Santa Fe",          country: "USA",          lat: 35.6870,  lng: -105.9378},
  { city: "Denver",            country: "USA",          lat: 39.7392,  lng: -104.9903},
  { city: "Oklahoma City",     country: "USA",          lat: 35.4676,  lng: -97.5164 },
  { city: "Tulsa",             country: "USA",          lat: 36.1540,  lng: -95.9928 },
  { city: "Waco",              country: "USA",          lat: 31.5493,  lng: -97.1467 },
  { city: "Boyne City",        country: "USA",          lat: 45.2127,  lng: -85.0117 },
  { city: "Minocqua",          country: "USA",          lat: 45.8719,  lng: -89.7093 },
  { city: "Milwaukee",         country: "USA",          lat: 43.0389,  lng: -87.9065 },
  { city: "Chicago",           country: "USA",          lat: 41.8781,  lng: -87.6298 },
  { city: "Champaign",         country: "USA",          lat: 40.1164,  lng: -88.2434 },
  { city: "Washington D.C.",   country: "USA",          lat: 38.9072,  lng: -77.0369 },
  { city: "Blacksburg",        country: "USA",          lat: 37.2296,  lng: -80.4139 },
  { city: "Garden City Beach", country: "USA",          lat: 33.5902,  lng: -78.9959 },
  { city: "Miami",             country: "USA",          lat: 25.7617,  lng: -80.1918 },
  { city: "New York",          country: "USA",          lat: 40.7128,  lng: -74.0060 },
  { city: "Foxborough",        country: "USA",          lat: 42.0654,  lng: -71.2478 },

  // --- EUROPE ---
  { city: "Outer Hebrides",    country: "UK",           lat: 57.7600,  lng: -7.0200  },
  { city: "Glasgow",           country: "UK",           lat: 55.8642,  lng: -4.2518  },
  { city: "Edinburgh",         country: "UK",           lat: 55.9533,  lng: -3.1883  },
  { city: "London",            country: "UK",           lat: 51.5074,  lng: -0.1278  },
  { city: "Amsterdam",         country: "Netherlands",  lat: 52.3676,  lng: 4.9041   },
  { city: "Munich",            country: "Germany",      lat: 48.1351,  lng: 11.5820  },
  { city: "Paris",             country: "France",       lat: 48.8566,  lng: 2.3522   },
  { city: "Nice",              country: "France",       lat: 43.7102,  lng: 7.2620   },
  { city: "Cannes",            country: "France",       lat: 43.5528,  lng: 7.0174   },
  { city: "Monte Carlo",       country: "Monaco",       lat: 43.7401,  lng: 7.4266   },
  { city: "Florence",          country: "Italy",        lat: 43.7696,  lng: 11.2558  },
  { city: "Rome",              country: "Italy",        lat: 41.9028,  lng: 12.4964  },
  { city: "Vatican City",      country: "Vatican City", lat: 41.9029,  lng: 12.4534  },
  { city: "Madrid",            country: "Spain",        lat: 40.4168,  lng: -3.7038  },
  { city: "Tenerife",          country: "Spain",        lat: 28.2916,  lng: -16.6291 },

  // --- ASIA ---
  // { city: "Kyoto",             country: "Japan",        lat: 35.0116,  lng: 135.7681 },
  { city: "Osaka",             country: "Japan",        lat: 34.6937,  lng: 135.5023 },
  { city: "Tokyo",             country: "Japan",        lat: 35.6762,  lng: 139.6503 },
];


const INK    = "#082f49";
const ACCENT = "#0369a1";
const BG     = "#e7e5e4";
const LINE   = "#a8a29e";

const el = document.getElementById("globe");

const globe = Globe()(el)
  .backgroundColor("rgba(0,0,0,0)")
  .showGlobe(false)            // no filled sphere — minimalist
  .showAtmosphere(false)
  .showGraticules(false)
  .htmlElementsData(LOCATIONS)
  .htmlAltitude(0.006)
  .htmlTransitionDuration(0)
  .htmlElement(d => {
    const anchor = document.createElement('div');
    anchor.className = 'travel-marker';
    const button = document.createElement('button');
    button.type = 'button';
    button.title = `${d.city}, ${d.country}`;
    button.setAttribute('aria-label', `Fly to ${d.city}, ${d.country}`);
    // The tip is anchored to the city; the 7 × 11 px body stays screen-sized.
    button.innerHTML = `<svg width="9" height="13" viewBox="-4.5 -12 9 13" aria-hidden="true"><path d="M0 0 C-1.05 -2.75 -3.5 -5.28 -3.5 -7.37 C-3.5 -12.21 3.5 -12.21 3.5 -7.37 C3.5 -5.28 1.05 -2.75 0 0 Z" fill="${ACCENT}" stroke="${BG}" stroke-width="2" stroke-linejoin="round" paint-order="stroke"/></svg>`;
    button.addEventListener('click', event => { event.stopPropagation(); flyTo(d); });
    button.addEventListener('pointerdown', () => { controls.autoRotate = false; hasInteracted = true; });
    button.addEventListener('pointerenter', () => { controls.autoRotate = false; });
    button.addEventListener('focus', () => { controls.autoRotate = false; });
    anchor.append(button);
    return anchor;
  });

// Each outline fades continuously across the horizon as the camera moves.
// Geography is uploaded once; the GPU handles front/rear contrast during rotation.
function outlineLayer(paths, color, rearOpacity) {
  const vertices = [];
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      for (const [lng, lat] of [path[i - 1], path[i]]) {
        const p = globe.getCoords(lat, lng, 0.005);
        vertices.push(p.x, p.y, p.z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: { ink: { value: new THREE.Color(color) }, rear: { value: rearOpacity } },
    vertexShader: `varying vec3 surface;
      void main() {
        surface = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(surface, 1.0);
      }`,
    fragmentShader: `uniform vec3 ink; uniform float rear; varying vec3 surface;
      void main() {
        float facing = dot(normalize(surface), normalize(cameraPosition - surface));
        float opacity = mix(rear, 1.0, smoothstep(-0.03, 0.03, facing));
        gl_FragColor = vec4(ink, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.raycast = () => {};
  globe.scene().add(lines);
}
const graticules = [];
for (let lat = -80; lat <= 80; lat += 10) {
  graticules.push(Array.from({length: 361}, (_, i) => [i - 180, lat]));
}
for (let lng = -180; lng < 180; lng += 10) {
  graticules.push(Array.from({length: 181}, (_, i) => [lng, i - 90]));
}
outlineLayer(graticules, LINE, 0.08);
fetch("https://unpkg.com/world-atlas@2.0.2/countries-110m.json")
  .then(r => r.json())
  .then(topo => {
    const features = topojsonFeatures(topo, topo.objects.countries);
    const paths = features.flatMap(f => f.geometry.type === 'Polygon'
      ? f.geometry.coordinates : f.geometry.coordinates.flat());
    outlineLayer(paths, INK, 0.12);
  });

// Tiny inline topojson feature decoder (avoids loading the full topojson-client lib).
// Adapted from the topojson-client mesh/feature algorithm — handles arcs + transform.
function topojsonFeatures(topology, object) {
  const transform = topology.transform;
  const arcs = topology.arcs;
  const tx = transform ? transform.translate : [0, 0];
  const sc = transform ? transform.scale : [1, 1];

  function decodeArc(i) {
    const reverse = i < 0;
    if (reverse) i = ~i;
    const arc = arcs[i];
    let x = 0, y = 0;
    const out = arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * sc[0] + tx[0], y * sc[1] + tx[1]];
    });
    return reverse ? out.slice().reverse() : out;
  }
  function ring(arcIdxs) {
    const coords = [];
    arcIdxs.forEach((idx, k) => {
      const dec = decodeArc(idx);
      if (k > 0) dec.shift(); // dedupe shared endpoint
      coords.push(...dec);
    });
    return coords;
  }
  function geometry(g) {
    if (g.type === "Polygon") {
      return { type: "Polygon", coordinates: g.arcs.map(ring) };
    }
    if (g.type === "MultiPolygon") {
      return { type: "MultiPolygon", coordinates: g.arcs.map(p => p.map(ring)) };
    }
    return null;
  }
  return object.geometries
    .map(g => ({ type: "Feature", properties: g.properties || {}, geometry: geometry(g) }))
    .filter(f => f.geometry);
}

// Fit the sphere with a small margin; preserve the user's zoom after interaction.
let hasInteracted = false;
function fittedAltitude() {
  const radius = Math.min(el.clientWidth, el.clientHeight) * 0.47;
  const focalLength = el.clientHeight / (2 * Math.tan(globe.camera().fov * Math.PI / 360));
  return Math.sqrt(1 + (focalLength / radius) ** 2) - 1;
}
// Sizing
function resize() {
  globe.width(el.clientWidth);
  globe.height(el.clientHeight);
  if (!hasInteracted) globe.pointOfView({ altitude: fittedAltitude() }, 0);
}
resize();
window.addEventListener("resize", resize);
if ("ResizeObserver" in window) new ResizeObserver(resize).observe(el);

// Initial camera
globe.pointOfView({ lat: 30, lng: -40, altitude: fittedAltitude() }, 0);

// Controls — gentle auto-rotate until the user interacts
const controls = globe.controls();
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
controls.enableZoom = true;
// Globe.gl recalibrates zoom on every camera change. Apply our multiplier
// afterwards so quicker wheel and pinch zoom persists at every altitude.
function updateZoomSpeed({ altitude }) {
  controls.zoomSpeed = (altitude + 1) * 0.1 * 1.6;
}
globe.onZoom(updateZoomSpeed);
updateZoomSpeed(globe.pointOfView());
["mousedown", "touchstart", "wheel"].forEach(evt =>
  el.addEventListener(evt, () => { controls.autoRotate = false; hasInteracted = true; }, { passive: true, once: true })
);

// Pause the render loop when the page/tab isn't visible or scrolled out of view.
// globe.gl exposes its internal animation via _animationFrameRequestId on newer versions,
// but the portable approach is to toggle three.js's renderer pause via _destructor-safe pause.
// We use the documented pauseAnimation / resumeAnimation methods.
function pause() { if (globe.pauseAnimation) globe.pauseAnimation(); }
function resume() { if (globe.resumeAnimation) globe.resumeAnimation(); }

document.addEventListener("visibilitychange", () => {
  document.hidden ? pause() : resume();
});

// Pause when scrolled offscreen, resume when visible.
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => e.isIntersecting ? resume() : pause());
  }, { threshold: 0 });
  io.observe(el);
}

function flyTo(d) {
  hasInteracted = true;
  controls.autoRotate = false;
  globe.pointOfView({ lat: d.lat, lng: d.lng, altitude: Math.min(1.6, fittedAltitude()) }, 1200);
  document.querySelectorAll("#locations li").forEach(li => {
    li.classList.toggle("active", li.dataset.city === d.city);
  });
}

// Render the location list
const list = document.getElementById("locations");
LOCATIONS.forEach(d => {
  const li = document.createElement("li");
  li.dataset.city = d.city;
  li.innerHTML = `${d.city}<span class="country">· ${d.country}</span>`;
  li.addEventListener("click", () => flyTo(d));
  list.appendChild(li);
});
