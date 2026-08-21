const SAMPLES = 140;
const SPEED = 0.28;
const FLOOR = 1020;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function samplePath(path, n) {
  const len = path.getTotalLength();
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const p = path.getPointAtLength((i / n) * Math.max(len, 1));
    pts.push([p.x, p.y]);
  }
  return pts;
}

function catmullPath(pts) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

function warp(pts, i, t, lineU) {
  return pts.map(([x, y]) => {
    const xn = x / 2476;
    const elev = FLOOR - y;
    const pulse = 1 + 0.08 * Math.sin(t * 0.7 + xn * 2.2 + i * 0.5);
    const roll = Math.sin(t * 0.5 + xn * 2.6 + i * 0.35) * 14 * (0.2 + lineU);
    const heave = Math.sin(t * 0.32 + i * 0.4) * 6 * lineU;
    return [x, FLOOR - elev * pulse + roll + heave];
  });
}

function boot() {
  const svg = document.getElementById("terrain");
  if (!svg) return;

  const paths = [...svg.querySelectorAll("path")];
  const rest = paths.map((path) => samplePath(path, SAMPLES));
  const count = paths.length;

  paths.forEach((path) => {
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#7C7C7C");
    path.setAttribute("stroke-width", "0.85");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
  });

  if (reduceMotion) return;

  let t = 0;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt * SPEED;
    for (let i = 0; i < count; i++) {
      const lineU = i / Math.max(1, count - 1);
      paths[i].setAttribute("d", catmullPath(warp(rest[i], i, t, lineU)));
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
