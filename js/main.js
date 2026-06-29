/* ============================================================
   YOUNIVERSE — motor de scroll y render
   Lenis (scroll suave) + GSAP/ScrollTrigger (scrub) +
   campo de partículas canvas-2D (zoom continuo, "Powers of Ten")
   + capa de profundidad Three.js (degrada con elegancia).
   ============================================================ */
(function () {
  'use strict';

  const html = document.documentElement;
  html.classList.remove('no-js');
  html.classList.add('js');

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE  = window.matchMedia('(pointer: coarse)').matches;
  const LOWPOWER = COARSE && Math.min(window.screen.width, window.screen.height) <= 520;

  // ---- elementos ----
  const stage  = document.getElementById('stage');
  const field  = document.getElementById('field');
  const depth  = document.getElementById('depth');
  const overlay = document.getElementById('overlay');
  const hud    = document.getElementById('hud');
  const hudMag = document.getElementById('hud-mag');
  const hudLabel = document.getElementById('hud-label');
  const scrollHint = document.getElementById('scroll-hint');
  const spacer = document.getElementById('spacer');
  const loader = document.getElementById('loader');
  const ctx = field.getContext('2d', { alpha: true });

  // ---- escenas de texto (DOM) ----
  const sceneEls = JOURNEY.map(s => document.querySelector('.scene[data-id="' + s.id + '"]'));

  // ---- construir campos de partículas (perezoso, una vez) ----
  function densify(arr) {
    // submuestreo en dispositivos de baja potencia
    if (!LOWPOWER || !Array.isArray(arr)) return arr;
    return arr.filter((_, i) => i % 5 !== 0); // ~80%
  }
  JOURNEY.forEach(s => {
    if (typeof s.build === 'function') {
      const built = s.build();
      if (Array.isArray(built)) s._pts = densify(built);
      else s._data = built; // {nodes,links} | {pts,links}
    }
  });

  // ---- intensidad de estrellas de fondo por escena (capa Three.js) ----
  const STAR = {
    umbral: 0.18, piel: 0.0, celulas: 0.0, moleculas: 0.05, vacio: 0.35,
    humano: 0.04, habitacion: 0.05, ciudad: 0.10, tierra: 0.22,
    solar: 0.6, galaxia: 0.45, red: 0.5, cierre: 0.2
  };

  /* ====================== DIMENSIONES ====================== */
  let W = 0, H = 0, DPR = 1, span = 0, cx = 0, cy = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, LOWPOWER ? 1.5 : 2);
    field.width = Math.round(W * DPR);
    field.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    span = Math.min(W, H);
    cx = W / 2; cy = H / 2;
    // longitud de scroll: ~1 pantalla por escena + holds en los extremos
    const factor = JOURNEY.length + 1.5;
    spacer.style.height = Math.round(H * factor) + 'px';
    if (three) three.resize(W, H);
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  /* ====================== UTILIDADES ====================== */
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  function smooth(x, a, b) { // smoothstep en [a,b]
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ====================== RENDER DE CAMPOS ====================== */
  function drawPoints(pts, zoom, alpha, t, glow) {
    const s = span * zoom;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const px = cx + p.x * s;
      const py = cy + p.y * s;
      if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;
      let r = p.r * s;
      if (r < 0.4) continue;
      let a = p.a * alpha;
      if (p.tw && !REDUCED) a *= 0.6 + 0.4 * Math.sin(t * 1.6 + p.tw);
      if (a <= 0.01) continue;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(px, py, Math.min(r, 60), 0, 6.2832);
      ctx.fill();
    }
    if (glow) {
      ctx.globalAlpha = clamp(alpha, 0, 1);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.5);
      g.addColorStop(0, 'rgba(238,240,246,0.10)');
      g.addColorStop(1, 'rgba(238,240,246,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }

  function drawGlowPoint(zoom, alpha, t, color) {
    color = color || '238,240,246';
    const breathe = REDUCED ? 1 : (0.92 + 0.08 * Math.sin(t * 0.9));
    const core = span * 0.006 * zoom * breathe;
    const halo = span * 0.32 * zoom;
    // halo
    let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, halo);
    g.addColorStop(0, 'rgba(' + color + ',' + (0.5 * alpha) + ')');
    g.addColorStop(0.18, 'rgba(' + color + ',' + (0.12 * alpha) + ')');
    g.addColorStop(1, 'rgba(' + color + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // núcleo
    ctx.globalAlpha = clamp(alpha, 0, 1);
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 3);
    g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
    g.addColorStop(0.5, 'rgba(' + color + ',' + (0.9 * alpha) + ')');
    g.addColorStop(1, 'rgba(' + color + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, core * 3, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawCells(cells, zoom, alpha, t) {
    const s = span * zoom;
    for (const c of cells) {
      const px = cx + c.x * s, py = cy + c.y * s, r = c.r * s;
      if (r < 1) continue;
      const drift = REDUCED ? 0 : Math.sin(t * 0.5 + c.x * 6) * r * 0.04;
      const g = ctx.createRadialGradient(px, py, r * 0.1, px, py, r);
      const aa = clamp(c.a * alpha, 0, 1);
      g.addColorStop(0, 'rgba(150,210,190,' + (0.10 * aa) + ')');
      g.addColorStop(0.7, 'rgba(120,200,180,' + (0.06 * aa) + ')');
      g.addColorStop(1, 'rgba(120,200,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py + drift, r, 0, 6.2832); ctx.fill();
      // membrana
      ctx.globalAlpha = aa * 0.5;
      ctx.strokeStyle = 'rgba(170,225,205,0.5)';
      ctx.lineWidth = Math.max(0.5, r * 0.02);
      ctx.beginPath(); ctx.arc(px, py + drift, r * 0.92, 0, 6.2832); ctx.stroke();
      // núcleo
      ctx.globalAlpha = aa * 0.8;
      ctx.fillStyle = 'rgba(200,240,225,0.7)';
      ctx.beginPath(); ctx.arc(px + c.nx * r * 0.25, py + drift + c.ny * r * 0.25, r * 0.16, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMolecule(data, zoom, alpha, t) {
    const s = span * zoom;
    ctx.globalAlpha = clamp(alpha * 0.5, 0, 1);
    ctx.strokeStyle = 'rgba(159,182,232,0.6)';
    ctx.lineWidth = Math.max(0.6, span * 0.0012 * zoom);
    ctx.beginPath();
    for (const [a, b] of data.links) {
      const na = data.nodes[a], nb = data.nodes[b];
      ctx.moveTo(cx + na.x * s, cy + na.y * s);
      ctx.lineTo(cx + nb.x * s, cy + nb.y * s);
    }
    ctx.stroke();
    for (const n of data.nodes) {
      const px = cx + n.x * s, py = cy + n.y * s, r = n.r * s;
      if (r < 0.5) continue;
      const aa = clamp(n.a * alpha, 0, 1);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
      g.addColorStop(0, 'rgba(207,219,255,' + aa + ')');
      g.addColorStop(0.5, 'rgba(159,182,232,' + (aa * 0.8) + ')');
      g.addColorStop(1, 'rgba(159,182,232,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, r * 2.2, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawEarth(pts, zoom, alpha, t) {
    const s = span * zoom;
    const r = span * 0.28 * zoom;
    // disco azul iluminado a medias
    let g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    const aa = clamp(alpha, 0, 1);
    g.addColorStop(0, 'rgba(120,170,235,' + (0.95 * aa) + ')');
    g.addColorStop(0.55, 'rgba(60,110,190,' + (0.8 * aa) + ')');
    g.addColorStop(0.85, 'rgba(20,45,95,' + (0.7 * aa) + ')');
    g.addColorStop(1, 'rgba(10,20,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    // atmósfera
    ctx.globalAlpha = aa * 0.5;
    g = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.12);
    g.addColorStop(0, 'rgba(150,200,255,0)');
    g.addColorStop(0.6, 'rgba(150,200,255,0.35)');
    g.addColorStop(1, 'rgba(150,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.12, 0, 6.2832); ctx.fill();
    // continentes tenues (puntos verdosos dentro del disco)
    if (pts) {
      for (const p of pts) {
        if (Math.hypot(p.x, p.y) > 0.28) continue;
        const px = cx + p.x * s, py = cy + p.y * s;
        ctx.globalAlpha = clamp(p.a * alpha * 0.5, 0, 1);
        ctx.fillStyle = 'rgba(120,180,140,0.6)';
        ctx.beginPath(); ctx.arc(px, py, Math.max(0.6, p.r * s), 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSolar(zoom, alpha, t) {
    const aa = clamp(alpha, 0, 1);
    // sol
    const sr = span * 0.05 * zoom;
    let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr * 6);
    g.addColorStop(0, 'rgba(255,240,210,' + aa + ')');
    g.addColorStop(0.25, 'rgba(255,210,140,' + (0.8 * aa) + ')');
    g.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, sr * 6, 0, 6.2832); ctx.fill();
    // órbitas
    ctx.strokeStyle = 'rgba(180,195,235,' + (0.18 * aa) + ')';
    ctx.lineWidth = Math.max(0.5, span * 0.0009 * zoom);
    const orbits = [0.12, 0.19, 0.27, 0.36];
    for (let i = 0; i < orbits.length; i++) {
      const orad = span * orbits[i] * zoom;
      ctx.beginPath(); ctx.ellipse(cx, cy, orad, orad * 0.42, 0, 0, 6.2832); ctx.stroke();
      // planeta (mota) — la Tierra resaltada en la 3a órbita
      const ang = t * (0.25 - i * 0.04) + i * 1.7;
      const pxp = cx + Math.cos(ang) * orad;
      const pyp = cy + Math.sin(ang) * orad * 0.42;
      ctx.globalAlpha = aa;
      ctx.fillStyle = i === 2 ? 'rgba(150,195,255,1)' : 'rgba(220,225,240,0.85)';
      ctx.beginPath(); ctx.arc(pxp, pyp, Math.max(1, span * (i === 2 ? 0.006 : 0.004) * zoom), 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawWeb(data, zoom, alpha, t) {
    const s = span * zoom;
    const aa = clamp(alpha, 0, 1);
    // filamentos
    ctx.strokeStyle = 'rgba(150,170,230,' + (0.16 * aa) + ')';
    ctx.lineWidth = Math.max(0.4, span * 0.0008 * zoom);
    ctx.beginPath();
    for (const [a, b] of data.links) {
      ctx.moveTo(cx + a.x * s, cy + a.y * s);
      ctx.lineTo(cx + b.x * s, cy + b.y * s);
    }
    ctx.stroke();
    drawPoints(data.pts, zoom, alpha, t, false);
  }

  /* despacha el dibujo de una escena según su tipo */
  function renderScene(scene, zoom, alpha, t) {
    if (alpha <= 0.004) return;
    switch (scene.kind) {
      case 'point':   drawGlowPoint(zoom, alpha, t); break;
      case 'grain':   drawPoints(scene._pts, zoom, alpha, t, false); break;
      case 'cells':   drawCells(scene._pts, zoom, alpha, t); break;
      case 'molecule':drawMolecule(scene._data, zoom, alpha, t); break;
      case 'vacuum':  drawGlowPoint(zoom * 0.4, alpha * 0.5, t, '205,211,236');
                      drawPoints(scene._pts, zoom, alpha, t, false); break;
      case 'figure':  drawGlowPoint(zoom * 0.7, alpha * 0.35, t, '240,220,192');
                      drawPoints(scene._pts, zoom, alpha, t, false); break;
      case 'room': {
        // figura dentro de un cuarto tenue
        const rw = span * 0.42 * zoom, rh = span * 0.5 * zoom;
        ctx.globalAlpha = clamp(alpha * 0.4, 0, 1);
        ctx.strokeStyle = 'rgba(200,210,235,0.5)';
        ctx.lineWidth = Math.max(0.5, span * 0.001 * zoom);
        ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
        ctx.globalAlpha = 1;
        drawPoints(scene._pts, zoom, alpha, t, false);
        break;
      }
      case 'city':    drawPoints(scene._pts, zoom, alpha, t, false); break;
      case 'earth':   drawEarth(scene._pts, zoom, alpha, t); break;
      case 'solar':   drawSolar(zoom, alpha, t); break;
      case 'galaxy':  drawPoints(scene._pts, zoom, alpha, t, true); break;
      case 'web':     drawWeb(scene._data, zoom, alpha, t); break;
    }
  }

  /* ====================== PROGRESO → ESTADO ====================== */
  const N = JOURNEY.length;
  const KF_START = 0.035, KF_END = 0.93;
  const kf = JOURNEY.map((_, i) => lerp(KF_START, KF_END, i / (N - 1)));

  // zoom de cada lado según dirección
  function zoomsFor(dir, frac) {
    if (REDUCED || dir === 0) return { zOut: 1, zIn: 1 };
    if (dir > 0) { // dive in: el actual crece y pasa; el nuevo emerge del centro
      return { zOut: 1 + frac * 2.0, zIn: 0.34 + frac * 0.66 };
    } else {       // zoom out: el actual encoge a un punto; el nuevo se asienta desde grande
      return { zOut: 1 - frac * 0.82, zIn: 2.6 - frac * 1.6 };
    }
  }

  let curMag = '__init__';
  function updateHUD(scene) {
    if (!scene || !scene.mag) { hud.classList.remove('visible'); curMag = null; return; }
    hud.classList.add('visible');
    if (curMag !== scene.mag) {
      curMag = scene.mag;
      hudMag.innerHTML = formatMag(scene.mag);
      hudLabel.textContent = scene.label || '';
    }
  }
  function formatMag(m) {
    // "10⁻⁹" ya viene con superíndices unicode; añadimos unidad
    return '<span>' + m + ' m</span>';
  }

  function setOverlay(i, frac) {
    for (let k = 0; k < N; k++) {
      if (!sceneEls[k]) continue;
      let op = 0;
      if (k === i)      op = clamp(1 - frac / 0.42, 0, 1);
      else if (k === i + 1) op = clamp((frac - 0.58) / 0.42, 0, 1);
      sceneEls[k].style.opacity = op;
    }
  }

  /* ====================== BUCLE DE RENDER ====================== */
  let progress = 0;          // 0..1 objetivo (desde scroll)
  let shown = 0;             // valor suavizado mostrado
  let tNow = 0;
  let started = false;

  function frame(time) {
    tNow = time * 0.001;
    // suavizado adicional (además de Lenis) para que el zoom respire
    shown += (progress - shown) * (REDUCED ? 1 : 0.12);
    const p = shown;

    ctx.clearRect(0, 0, W, H);

    let i, frac, domScene;
    if (p <= kf[0]) {
      i = 0; frac = 0;
      const intro = clamp(p / kf[0], 0, 1);
      renderScene(JOURNEY[0], 1, 1, tNow);
      domScene = JOURNEY[0];
      setOverlay(0, 0);
      // pista de scroll visible sólo arriba del todo
      scrollHint.style.opacity = (1 - intro) * 0.0 + (p < kf[0] * 0.9 ? 1 : 0);
    } else if (p >= kf[N - 1]) {
      i = N - 1; frac = 0;
      renderScene(JOURNEY[N - 1], 1, 1, tNow);
      domScene = JOURNEY[N - 1];
      setOverlay(N - 1, -1); // fuerza sólo la última visible
      sceneEls[N - 1].style.opacity = 1;
      scrollHint.style.opacity = 0;
    } else {
      // localizar segmento
      i = 0;
      while (i < N - 2 && p >= kf[i + 1]) i++;
      frac = (p - kf[i]) / (kf[i + 1] - kf[i]);
      const a = JOURNEY[i], b = JOURNEY[i + 1];
      const z = zoomsFor(a.dirTo, frac);
      const aOut = clamp(1 - smooth(frac, 0.45, 0.85), 0, 1);
      const aIn  = clamp(smooth(frac, 0.15, 0.55), 0, 1);
      // dibujar el de atrás primero según dirección de profundidad
      if (a.dirTo > 0) { renderScene(a, z.zOut, aOut, tNow); renderScene(b, z.zIn, aIn, tNow); }
      else             { renderScene(b, z.zIn, aIn, tNow); renderScene(a, z.zOut, aOut, tNow); }
      domScene = frac < 0.5 ? a : b;
      setOverlay(i, frac);
      scrollHint.style.opacity = 0;
    }

    updateHUD(domScene);

    // capa de estrellas Three.js
    if (three) {
      const sa = STAR[(p <= kf[0]) ? JOURNEY[0].id : (p >= kf[N - 1] ? JOURNEY[N - 1].id : JOURNEY[i].id)] || 0;
      const sb = STAR[(JOURNEY[Math.min(i + 1, N - 1)].id)] || 0;
      const starAmt = lerp(sa, sb, clamp(frac, 0, 1));
      three.render(p, starAmt, tNow);
    }

    requestAnimationFrame(frame);
  }

  /* ====================== THREE.JS (profundidad) ====================== */
  let three = null;
  function initThree() {
    if (REDUCED) return null;
    if (!window.THREE) return null;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: depth, antialias: false, alpha: true, powerPreference: 'low-power' });
    } catch (e) { return null; }
    if (!renderer || !renderer.getContext()) return null;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOWPOWER ? 1.25 : 1.75));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

    const COUNT = LOWPOWER ? 1100 : 2600;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const c1 = new THREE.Color('#dfe6fb'), c2 = new THREE.Color('#bcd0ff'), c3 = new THREE.Color('#ffe6bd');
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 220;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 220;
      positions[i * 3 + 2] = -Math.random() * 320;
      const pick = Math.random();
      const col = pick < 0.7 ? c1 : (pick < 0.92 ? c2 : c3);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.7, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(geo, mat);
    scene.add(stars);

    let shownOpacity = 0;
    return {
      resize(w, h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
      },
      render(p, amt, t) {
        shownOpacity += (amt - shownOpacity) * 0.06;
        mat.opacity = shownOpacity;
        if (shownOpacity < 0.005) { renderer.clear(); return; }
        // vuelo continuo a través del campo de estrellas (dolly por scroll)
        camera.position.z = 60 - p * 80;
        stars.rotation.z = t * 0.006;
        stars.rotation.y = p * 0.3;
        renderer.render(scene, camera);
      }
    };
  }

  /* ====================== SCROLL (Lenis + ScrollTrigger) ====================== */
  let lenis = null;
  function computeProgress() {
    const max = (spacer.offsetHeight - window.innerHeight);
    const y = window.scrollY || window.pageYOffset || 0;
    progress = max > 0 ? clamp(y / max, 0, 1) : 0;
  }

  function initScroll() {
    if (!REDUCED && window.Lenis) {
      lenis = new Lenis({
        duration: 1.15,
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
        touchMultiplier: 1.2
      });
      function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
      lenis.on('scroll', () => {
        computeProgress();
        if (window.ScrollTrigger) ScrollTrigger.update();
      });
    } else {
      window.addEventListener('scroll', computeProgress, { passive: true });
    }

    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      if (lenis) {
        ScrollTrigger.scrollerProxy(document.documentElement, {
          scrollTop(value) {
            if (arguments.length) lenis.scrollTo(value, { immediate: true });
            return window.scrollY;
          }
        });
      }
      // marca de presencia del stack (scrub real sobre el progreso global)
      ScrollTrigger.create({
        trigger: spacer, start: 'top top', end: 'bottom bottom',
        scrub: true, onUpdate: computeProgress
      });
    }
    computeProgress();
  }

  /* ====================== ACCESIBILIDAD: teclado ====================== */
  function scrollByPage(dir) {
    const dest = (window.scrollY || 0) + dir * window.innerHeight * 0.9;
    if (lenis) lenis.scrollTo(dest, { duration: 1.1 });
    else window.scrollTo({ top: dest, behavior: REDUCED ? 'auto' : 'smooth' });
  }
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown': case 'PageDown': case ' ': case 'Spacebar':
        if (e.target === document.body || e.target === document.documentElement) {
          e.preventDefault(); scrollByPage(+1);
        }
        break;
      case 'ArrowUp': case 'PageUp':
        if (e.target === document.body || e.target === document.documentElement) {
          e.preventDefault(); scrollByPage(-1);
        }
        break;
      case 'Home': e.preventDefault(); (lenis ? lenis.scrollTo(0) : window.scrollTo({ top: 0 })); break;
      case 'End':  e.preventDefault(); (lenis ? lenis.scrollTo(spacer.offsetHeight) : window.scrollTo({ top: spacer.offsetHeight })); break;
    }
  });

  /* ====================== ARRANQUE ====================== */
  function start() {
    if (started) return; started = true;
    three = initThree();
    resize();
    initScroll();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    requestAnimationFrame(frame);
    // ocultar loader
    setTimeout(() => { loader.classList.add('hidden'); }, 350);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 1);
  } else {
    window.addEventListener('DOMContentLoaded', start);
  }
})();
