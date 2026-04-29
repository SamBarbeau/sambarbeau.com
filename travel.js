// edit this list — that's it.
const LOCATIONS = [
  // --- NORTH AMERICA ---
  { city: "Montreal",          country: "Canada",       lat: 45.5017,  lng: -73.5673 },
  { city: "Cozumel",           country: "Mexico",       lat: 20.4230,  lng: -86.9223 },
  { city: "Nassau",            country: "Bahamas",      lat: 25.0443,  lng: -77.3504 },
  { city: "Negril",            country: "Jamaica",      lat: 18.2781,  lng: -78.3484 },
  
  // USA (West to East Coast)
  { city: "San Diego",         country: "USA",          lat: 32.7157,  lng: -117.1611},
  { city: "Los Angeles",       country: "USA",          lat: 34.0522,  lng: -118.2437},
  { city: "Las Vegas",         country: "USA",          lat: 36.1716,  lng: -115.1391},
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
  { city: "Kyoto",             country: "Japan",        lat: 35.0116,  lng: 135.7681 },
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
  .showGraticules(true)
  .pointsData(LOCATIONS)
  .pointLat("lat")
  .pointLng("lng")
  .pointColor(() => ACCENT)
  .pointAltitude(0.01)
  .pointRadius(0.45)
  .pointLabel(d => `<div style="background:${BG};color:${INK};padding:4px 8px;border:1px solid ${LINE};border-radius:3px;font-family:Georgia,serif;font-size:13px;">${d.city}, ${d.country}</div>`)
  .onPointClick(d => flyTo(d));

// Load world country outlines (no fill — outline only)
fetch("https://unpkg.com/world-atlas@2.0.2/countries-110m.json")
  .then(r => r.json())
  .then(topo => {
    // topojson -> geojson features (using a tiny inline decoder via three-globe's expectation: it accepts geojson features)
    const features = topojsonFeatures(topo, topo.objects.countries);
    globe
      .polygonsData(features)
      .polygonCapColor(() => "rgba(0,0,0,0)")
      .polygonSideColor(() => "rgba(0,0,0,0)")
      .polygonStrokeColor(() => INK)
      .polygonAltitude(0.005);
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

// Sizing
function resize() {
  globe.width(el.clientWidth);
  globe.height(el.clientHeight);
}
resize();
window.addEventListener("resize", resize);

// Initial camera
globe.pointOfView({ lat: 30, lng: -40, altitude: 2.4 }, 0);

// Controls — gentle auto-rotate until the user interacts
const controls = globe.controls();
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
controls.enableZoom = true;
["mousedown", "touchstart", "wheel"].forEach(evt =>
  el.addEventListener(evt, () => { controls.autoRotate = false; }, { passive: true, once: true })
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
  controls.autoRotate = false;
  globe.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.6 }, 1200);
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
