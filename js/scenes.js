/* ============================================================
   YOUNIVERSE — definición del recorrido y generadores de campos
   ------------------------------------------------------------
   El scroll atraviesa las escalas: del centro hacia adentro
   (piel → célula → átomo → vacío), el cruce humano, y hacia
   afuera (habitación → ciudad → Tierra → sistema solar →
   galaxia → red cósmica), de vuelta al punto.

   Cada escena es un campo de puntos generado de forma
   determinista. Sólo se renderizan dos escenas a la vez
   (la actual y la siguiente) con un cruce de zoom continuo.
   ============================================================ */

/* RNG determinista (mulberry32) — campos estables entre cuadros */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----- generadores: devuelven array de puntos {x,y,r,c,a,tw}
   x,y en [-0.5, 0.5]; r radio relativo al lado menor; c color;
   a alfa base; tw fase de centelleo (0 = sin centelleo) ----- */

function gScatter(seed, n, opts) {
  const rnd = mulberry32(seed);
  const o = opts || {};
  const pts = [];
  for (let i = 0; i < n; i++) {
    // distribución radial con concentración configurable
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), o.pow || 1) * (o.spread || 0.5);
    pts.push({
      x: Math.cos(ang) * rad,
      y: Math.sin(ang) * rad * (o.flat || 1),
      r: (o.rmin || 0.0008) + rnd() * (o.rvar || 0.0012),
      c: o.c || '#eef0f6',
      a: (o.amin || 0.4) + rnd() * (o.avar || 0.6),
      tw: o.twinkle ? rnd() * Math.PI * 2 : 0
    });
  }
  return pts;
}

/* rejilla suave con jitter — piel / tejido */
function gGrain(seed, n, opts) {
  const rnd = mulberry32(seed);
  const o = opts || {};
  const pts = [];
  const cols = Math.round(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const gx = (i % cols) / (cols - 1) - 0.5;
    const gy = (Math.floor(i / cols) / (cols - 1)) - 0.5;
    // ondulación tipo cresta/relieve de piel
    const ridge = Math.sin((gx + gy) * 9 + rnd() * 0.6) * 0.03;
    pts.push({
      x: gx * 0.96 + (rnd() - 0.5) * 0.05,
      y: gy * 0.96 + ridge + (rnd() - 0.5) * 0.05,
      r: (o.rmin || 0.0016) + rnd() * (o.rvar || 0.002),
      c: o.c || '#e6c79a',
      a: (o.amin || 0.25) + rnd() * (o.avar || 0.5) * (0.5 + 0.5 * Math.cos((gx + gy) * 9)),
      tw: 0
    });
  }
  return pts;
}

/* células: discos translúcidos con núcleo (se dibujan como custom) */
function gCells(seed, n) {
  const rnd = mulberry32(seed);
  const cells = [];
  let tries = 0;
  while (cells.length < n && tries < n * 40) {
    tries++;
    const x = (rnd() - 0.5) * 0.92;
    const y = (rnd() - 0.5) * 0.92;
    const r = 0.045 + rnd() * 0.05;
    let ok = true;
    for (const c of cells) {
      const dx = c.x - x, dy = c.y - y;
      if (Math.hypot(dx, dy) < (c.r + r) * 0.86) { ok = false; break; }
    }
    if (ok) cells.push({ x, y, r, a: 0.5 + rnd() * 0.4, nx: (rnd() - 0.5), ny: (rnd() - 0.5) });
  }
  return cells;
}

/* moléculas: nodos con enlaces (custom) */
function gMolecule(seed, n) {
  const rnd = mulberry32(seed);
  const nodes = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      x: (rnd() - 0.5) * 0.8,
      y: (rnd() - 0.5) * 0.8,
      r: 0.006 + rnd() * 0.014,
      a: 0.5 + rnd() * 0.5
    });
  }
  // enlaces a vecinos cercanos
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    let best = -1, bd = 1e9;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0 && bd < 0.32) links.push([i, best]);
  }
  return { nodes, links };
}

/* espiral galáctica */
function gGalaxy(seed, n) {
  const rnd = mulberry32(seed);
  const pts = [];
  const arms = 2;
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rnd(), 0.5);          // densidad hacia el centro
    const arm = Math.floor(rnd() * arms);
    const ang = t * 6.5 + arm * (Math.PI * 2 / arms) + (rnd() - 0.5) * 0.5;
    const rad = t * 0.5;
    const jitter = (rnd() - 0.5) * 0.06 * (0.3 + t);
    const warm = t < 0.28;                    // núcleo cálido
    pts.push({
      x: Math.cos(ang) * rad + Math.cos(ang + 1.57) * jitter,
      y: (Math.sin(ang) * rad + Math.sin(ang + 1.57) * jitter) * 0.62, // inclinación
      r: 0.0006 + rnd() * 0.0014 + (warm ? 0.0008 : 0),
      c: warm ? '#ffe6bd' : (rnd() < 0.2 ? '#bcd0ff' : '#eef0f6'),
      a: 0.35 + rnd() * 0.6,
      tw: rnd() * Math.PI * 2
    });
  }
  return pts;
}

/* red cósmica: cúmulos unidos por filamentos */
function gCosmicWeb(seed, nClusters, perCluster) {
  const rnd = mulberry32(seed);
  const clusters = [];
  for (let i = 0; i < nClusters; i++) {
    clusters.push({ x: (rnd() - 0.5) * 0.92, y: (rnd() - 0.5) * 0.92 });
  }
  const pts = [];
  for (const cl of clusters) {
    const cnt = perCluster * (0.5 + rnd());
    for (let k = 0; k < cnt; k++) {
      const ang = rnd() * Math.PI * 2;
      const rad = Math.pow(rnd(), 1.6) * 0.07;
      pts.push({
        x: cl.x + Math.cos(ang) * rad,
        y: cl.y + Math.sin(ang) * rad,
        r: 0.0007 + rnd() * 0.0013,
        c: rnd() < 0.25 ? '#bcd0ff' : '#dfe6fb',
        a: 0.3 + rnd() * 0.6,
        tw: rnd() * Math.PI * 2
      });
    }
  }
  // filamentos: enlaza cada cúmulo con su vecino más cercano (como neuronas)
  const links = [];
  for (let i = 0; i < clusters.length; i++) {
    const order = clusters
      .map((c, j) => ({ j, d: Math.hypot(c.x - clusters[i].x, c.y - clusters[i].y) }))
      .filter(o => o.j !== i)
      .sort((a, b) => a.d - b.d);
    for (let m = 0; m < 2 && m < order.length; m++) {
      if (order[m].d < 0.55) links.push([clusters[i], clusters[order[m].j]]);
    }
  }
  return { pts, links };
}

/* silueta tenue de figura humana hecha de puntos (custom-friendly) */
function gFigure(seed, n) {
  const rnd = mulberry32(seed);
  const pts = [];
  // contorno paramétrico muy simple de una figura de pie
  function sample() {
    const part = rnd();
    let x, y, w;
    if (part < 0.16) { y = -0.42 + rnd() * 0.13; w = 0.05; }       // cabeza
    else if (part < 0.6) { y = -0.29 + rnd() * 0.42; w = 0.11; }   // torso
    else { y = 0.13 + rnd() * 0.34; w = 0.05; }                    // piernas
    x = (rnd() - 0.5) * w * 2;
    return { x, y };
  }
  for (let i = 0; i < n; i++) {
    const s = sample();
    pts.push({
      x: s.x, y: s.y,
      r: 0.0012 + rnd() * 0.0016,
      c: '#f0dcc0',
      a: 0.18 + rnd() * 0.4,
      tw: 0
    });
  }
  return pts;
}

/* ============================================================
   EL RECORRIDO
   ============================================================ */

const JOURNEY = [
  {
    id: 'umbral',
    phrase: 'Lo que eres depende de <em>quién mire</em>, y desde dónde.',
    sub: 'Empieza aquí, en el centro. Y aléjate.',
    mag: null, label: null,
    dirTo: +1,                 // hacia adentro
    kind: 'point'
  },
  {
    id: 'piel',
    phrase: 'A esta distancia eres <em>piel</em>.',
    mag: '10⁻³', label: 'piel',
    dirTo: +1,
    kind: 'grain', build: () => gGrain(101, 1100, { c: '#e6c79a', amin: 0.18, avar: 0.5 })
  },
  {
    id: 'celulas',
    phrase: 'Más cerca: <em>células</em>. Un país de células, ninguna eres “tú”.',
    mag: '10⁻⁵', label: 'células',
    dirTo: +1,
    kind: 'cells', build: () => gCells(202, 90)
  },
  {
    id: 'moleculas',
    phrase: 'Más cerca: moléculas. <em>Átomos</em>.',
    mag: '10⁻⁹', label: 'moléculas · átomos',
    dirTo: +1,
    kind: 'molecule', build: () => gMolecule(303, 46)
  },
  {
    id: 'vacio',
    phrase: 'Más cerca aún: casi puro <em>espacio vacío</em>. En el corazón de cada átomo, casi nada.',
    mag: '10⁻¹⁵', label: 'casi nada',
    dirTo: +1,                 // el cruce: re-emerger hacia lo humano
    kind: 'vacuum', build: () => gScatter(404, 26, { pow: 2.4, spread: 0.5, c: '#cdd3ec', amin: 0.2, avar: 0.5, rmin: 0.001, rvar: 0.002, twinkle: true })
  },
  {
    id: 'humano',
    phrase: 'Y a un metro y medio, este rango <em>improbable</em>: apareces como una persona. Una cara, un nombre. Sólo aquí.',
    mag: '10⁰', label: 'una persona',
    dirTo: -1,                 // a partir de aquí, hacia afuera
    kind: 'figure', build: () => gFigure(505, 520)
  },
  {
    id: 'habitacion',
    phrase: 'Aléjate: una <em>habitación</em>. Eres una figura en un cuarto.',
    mag: '10¹', label: 'una figura',
    dirTo: -1,
    kind: 'room', build: () => gFigure(505, 360)
  },
  {
    id: 'ciudad',
    phrase: 'Más lejos: una <em>ciudad</em> encendida de noche. Ya no se te distingue.',
    mag: '10⁴', label: 'una ciudad',
    dirTo: -1,
    kind: 'city', build: () => gScatter(606, 420, { pow: 1.1, spread: 0.52, flat: 0.7, c: '#ffcf8a', amin: 0.25, avar: 0.6, rmin: 0.001, rvar: 0.002, twinkle: true })
  },
  {
    id: 'tierra',
    phrase: 'Más lejos: la <em>Tierra</em> entera. Un punto azul. Tú, aquí, indistinguible.',
    mag: '10⁷', label: 'un punto azul',
    dirTo: -1,
    kind: 'earth', build: () => gScatter(707, 240, { pow: 0.7, spread: 0.3, c: '#cfe0ff', amin: 0.3, avar: 0.5 })
  },
  {
    id: 'solar',
    phrase: 'Más lejos: el <em>sistema solar</em>. Una mota alrededor de una estrella común.',
    mag: '10¹³', label: 'una mota',
    dirTo: -1,
    kind: 'solar'
  },
  {
    id: 'galaxia',
    phrase: 'Más lejos: la <em>galaxia</em>. Doscientos mil millones de soles.',
    mag: '10²¹', label: 'la galaxia',
    dirTo: -1,
    kind: 'galaxy', build: () => gGalaxy(909, 2200)
  },
  {
    id: 'red',
    phrase: 'Más lejos: la <em>red cósmica</em>. Filamentos de galaxias como neuronas.',
    mag: '10²⁶', label: 'la red cósmica',
    dirTo: -1,                 // colapsa de vuelta al punto
    kind: 'web', build: () => gCosmicWeb(1010, 22, 40)
  },
  {
    id: 'cierre',
    phrase: 'En ningún rango encontraste un límite donde <em>terminaras tú</em> y empezara el resto.',
    mag: null, label: null,
    dirTo: 0,
    kind: 'point'
  }
];
