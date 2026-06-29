# Youniverse

Un viaje interactivo a través de las **escalas de la realidad**, en español.

> Lo que eres depende de quién mire, y desde dónde.

Basado en una idea de **Douglas Harding**: a cada rango de observación eres algo
distinto —célula, cuerpo, ciudad, planeta, galaxia… y átomo, partícula, casi
nada—. La identidad es relativa al observador. Tú las contienes todas.

Es la pieza hermana de [**Mira por ti mismo**](https://fabianimv.github.io/rostro-original/):
donde aquel sitio muestra que en tu centro no hay ninguna cosa, este muestra que
a cada distancia eres algo diferente. No afirma una cosmología: invita a mirar.

## Cómo funciona

El recorrido se conduce con el **scroll**, como un *zoom* continuo tipo
*Powers of Ten*. Desde el punto de partida se viaja hacia adentro
(piel → célula → molécula → átomo → vacío), se cruza el rango humano, y luego
hacia afuera (habitación → ciudad → Tierra → sistema solar → galaxia → red
cósmica), para volver al punto de luz del inicio. En cada escala se indica el
orden de magnitud y qué eres a ese rango.

## Stack

Todo se carga vía CDN; no hay backend, login ni tracking.

- **Lenis** — scroll suave.
- **GSAP + ScrollTrigger** — sincronización del recorrido con el scroll.
- **Three.js** — capa de profundidad (campo de estrellas en 3D).
- **Canvas 2D** — motor principal de campos de partículas (zoom continuo).

El motor de canvas-2D funciona **sin dependencias**: si alguna librería de CDN
no carga, el recorrido sigue siendo navegable. Con `prefers-reduced-motion` se
desactiva el zoom fuerte y se mantienen sólo transiciones suaves de opacidad.

## Estructura

```
index.html        # estructura, meta (Open Graph / Twitter), textos
css/style.css     # identidad visual
js/scenes.js      # definición del recorrido y campos de partículas
js/main.js        # motor de scroll y render
assets/og.png     # imagen para compartir (1200×630)
```

## Publicar en GitHub Pages

El sitio es 100 % estático con `index.html` en la raíz, listo para GitHub Pages:

1. Sube estos archivos a la rama que prefieras (por ejemplo `main`).
2. En GitHub ve a **Settings → Pages**.
3. En **Build and deployment → Source** elige **Deploy from a branch**.
4. Selecciona la rama y la carpeta **`/ (root)`**, y guarda.
5. En un par de minutos estará en
   `https://<usuario>.github.io/youniverse/`
   (en este caso: <https://fabianimv.github.io/youniverse/>).

No requiere ningún paso de build.

## Desarrollo local

Cualquier servidor estático sirve. Por ejemplo:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## Créditos

Inspirado en el *«Youniverse»* de Douglas Harding
([headless.org](https://www.headless.org/)), de uso libre.
