// src/themes/EntranceBackground.ts

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
}

interface FogCloud {
  x: number;
  y: number;
  radius: number;
  speed: number;
  opacity: number;
}

export function mount(container: HTMLElement): () => void {
  // Ensure the background root has z-index and configuration
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.pointerEvents = 'none';
  container.style.overflow = 'hidden';
  container.style.zIndex = '0';
  // CSS Sky & Pavement gradients
  container.style.background = 'linear-gradient(to bottom, #110904 0%, #2b1509 70%, #0d0603 70%, #1c0e07 100%)';

  // 1. Create or select canvas
  let canvas = container.querySelector('.landing-entrance-bg') as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'landing-entrance-bg';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);
  }

  // 2. Create or select silhouette layer
  let silhouetteLayer = container.querySelector('.landing-silhouette-layer') as HTMLDivElement | null;
  if (!silhouetteLayer) {
    silhouetteLayer = document.createElement('div');
    silhouetteLayer.className = 'landing-silhouette-layer';
    container.appendChild(silhouetteLayer);
  } else {
    // Clear safely
    while (silhouetteLayer.firstChild) {
      silhouetteLayer.removeChild(silhouetteLayer.firstChild);
    }
  }

  // Inject keyframe style block for sign sway, breathe, and DOM silhouettes
  let styleTag = document.getElementById('landing-entrance-style') as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'landing-entrance-style';
    styleTag.textContent = `
      @keyframes signSway {
        0%, 100% { transform: translate(-50%, 0) rotate(-1deg); }
        50% { transform: translate(-50%, 0) rotate(1deg); }
      }
      @keyframes windowBreathe {
        0%, 100% { opacity: 0.55; transform: translate(-50%, -50%) scale(0.96); }
        50% { opacity: 0.75; transform: translate(-50%, -50%) scale(1.04); }
      }
      .landing-silhouette-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 1;
      }
      .landing-entrance-bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 2;
      }
      .sky-glow-ambient {
        position: absolute;
        bottom: 30%;
        left: 50%;
        transform: translate(-50%, 50%);
        width: 1000px;
        height: 600px;
        background: radial-gradient(circle, rgba(201, 130, 69, 0.22) 0%, rgba(74, 38, 13, 0.08) 50%, transparent 100%);
        pointer-events: none;
        z-index: 0;
      }
      .distant-rooftops {
        position: absolute;
        bottom: 30%;
        left: 0;
        width: 100%;
        height: 140px;
        opacity: 0.33;
        pointer-events: none;
        z-index: 1;
      }
      .cafe-building {
        position: absolute;
        bottom: 30%;
        left: 50%;
        transform: translateX(-50%);
        width: 65vw;
        max-width: 760px;
        height: 320px;
        opacity: 0.70;
        z-index: 2;
      }
      .cafe-facade-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .facade-wall {
        fill: #4e2912;
      }
      .facade-roof {
        fill: #2f1709;
      }
      .cafe-door-core {
        position: absolute;
        left: 15%;
        bottom: 0;
        width: 65px;
        height: 155px;
        background: #140b05;
        border: 2px solid #2f1709;
        border-bottom: none;
      }
      .cafe-door-light-seep {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: rgba(243, 169, 60, 0.45);
        box-shadow: 0 0 10px rgba(243, 169, 60, 0.6);
      }
      .cafe-window-core {
        position: absolute;
        left: 50%;
        bottom: 80px;
        transform: translateX(-50%);
        width: 90px;
        height: 58px;
        background: #f3a93c;
        border: 2px solid #140b05;
        box-shadow: 0 0 35px #f3a93c;
      }
      .cafe-window-grid-v {
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 3px;
        background: #140b05;
        transform: translateX(-50%);
      }
      .cafe-window-grid-h {
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 3px;
        background: #140b05;
        transform: translateY(-50%);
      }
      .cafe-window-halo {
        position: absolute;
        left: 50%;
        bottom: 80px;
        transform: translateX(-50%);
        width: 90px;
        height: 58px;
        pointer-events: none;
      }
      .cafe-window-halo::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 440px;
        height: 440px;
        background: radial-gradient(circle, rgba(243, 169, 60, 0.72) 0%, rgba(201, 130, 69, 0.35) 45%, rgba(74, 38, 13, 0.12) 75%, transparent 100%);
        animation: windowBreathe 6s infinite ease-in-out;
      }
      .streetlamp-container {
        position: absolute;
        bottom: 30%;
        left: calc(50% - 32.5vw - 50px);
        width: 60px;
        height: 220px;
        z-index: 3;
        pointer-events: none;
      }
      .streetlamp-silhouette {
        opacity: 0.65;
      }
      .streetlamp-halo {
        position: absolute;
        left: 32px;
        top: 60px;
        transform: translate(-50%, -50%);
        width: 140px;
        height: 140px;
        background: radial-gradient(circle, rgba(243, 169, 60, 0.8) 0%, rgba(201, 130, 69, 0.3) 50%, transparent 100%);
        opacity: 0.45;
        pointer-events: none;
      }
      .landing-cafe-sign {
        position: absolute;
        left: 50%;
        bottom: calc(30% + 240px);
        transform: translate(-50%, 0);
        z-index: 4;
        pointer-events: none;
        font-family: var(--font-script);
        color: #E8C97D;
        text-shadow: 0 0 10px #C98245, 0 0 20px #4A260D;
        white-space: nowrap;
        letter-spacing: 1.5px;
        opacity: 0.85;
        transform-origin: top center;
        font-size: 18px;
        animation: signSway 8s infinite ease-in-out;
      }
      @media (min-width: 1170px) {
        .streetlamp-container {
          left: calc(50% - 430px);
        }
      }
      @media (max-width: 600px) {
        .cafe-building {
          width: 90vw;
          height: 220px;
        }
        .cafe-window-core {
          width: 76px;
          height: 50px;
          bottom: 55px;
        }
        .cafe-window-halo {
          bottom: 55px;
          width: 76px;
          height: 50px;
        }
        .cafe-window-halo::after {
          width: 300px;
          height: 300px;
        }
        .streetlamp-container {
          left: 3vw;
          height: 180px;
        }
        .streetlamp-container svg {
          transform: scale(0.8);
          transform-origin: bottom left;
        }
        .landing-cafe-sign {
          bottom: calc(30% + 175px);
          font-size: 14px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .landing-cafe-sign,
        .cafe-window-halo::after {
          animation: none !important;
        }
        .landing-cafe-sign {
          transform: translate(-50%, 0) rotate(0deg);
        }
        .cafe-window-halo::after {
          transform: translate(-50%, -50%) scale(1.0);
          opacity: 0.65;
        }
      }
    `;
    document.head.appendChild(styleTag);
  }

  // --- POPULATE SILHOUETTE LAYER ---
  // Create Sky Glow Ambient layer
  const skyGlowAmbient = document.createElement('div');
  skyGlowAmbient.className = 'sky-glow-ambient';
  silhouetteLayer.appendChild(skyGlowAmbient);

  // Create Distant Rooftops SVG
  const rooftopsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  rooftopsSvg.setAttribute('class', 'distant-rooftops');
  rooftopsSvg.setAttribute('viewBox', '0 0 1200 140');
  rooftopsSvg.setAttribute('preserveAspectRatio', 'none');
  
  const rooftopsPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  rooftopsPath.setAttribute('d', 'M 0,140 L 0,80 L 150,80 L 150,60 L 220,40 L 280,60 L 280,80 L 350,80 L 350,140 L 800,140 L 800,90 L 880,60 L 960,90 L 960,140 Z');
  rooftopsPath.setAttribute('fill', '#201107');
  rooftopsSvg.appendChild(rooftopsPath);
  silhouetteLayer.appendChild(rooftopsSvg);

  // Create Café Building Container
  const building = document.createElement('div');
  building.className = 'cafe-building';

  const facadeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  facadeSvg.setAttribute('class', 'cafe-facade-svg');
  facadeSvg.setAttribute('viewBox', '0 0 760 320');
  facadeSvg.setAttribute('preserveAspectRatio', 'none');

  const facadeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  facadeRect.setAttribute('x', '0');
  facadeRect.setAttribute('y', '80');
  facadeRect.setAttribute('width', '760');
  facadeRect.setAttribute('height', '240');
  facadeRect.setAttribute('class', 'facade-wall');

  const facadeRoof = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  facadeRoof.setAttribute('d', 'M 0,80 L 380,20 L 760,80 Z');
  facadeRoof.setAttribute('class', 'facade-roof');

  facadeSvg.appendChild(facadeRect);
  facadeSvg.appendChild(facadeRoof);
  building.appendChild(facadeSvg);

  // Door recess
  const door = document.createElement('div');
  door.className = 'cafe-door-core';
  const doorSeep = document.createElement('div');
  doorSeep.className = 'cafe-door-light-seep';
  door.appendChild(doorSeep);
  building.appendChild(door);

  // Window Core
  const windowCore = document.createElement('div');
  windowCore.className = 'cafe-window-core';
  const gridV = document.createElement('div');
  gridV.className = 'cafe-window-grid-v';
  const gridH = document.createElement('div');
  gridH.className = 'cafe-window-grid-h';
  windowCore.appendChild(gridV);
  windowCore.appendChild(gridH);
  building.appendChild(windowCore);

  // Window Halo
  const windowHalo = document.createElement('div');
  windowHalo.className = 'cafe-window-halo';
  building.appendChild(windowHalo);

  silhouetteLayer.appendChild(building);

  // Create Streetlamp Container
  const streetlamp = document.createElement('div');
  streetlamp.className = 'streetlamp-container';

  const lampSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lampSvg.setAttribute('class', 'streetlamp-svg streetlamp-silhouette');
  lampSvg.setAttribute('viewBox', '0 0 40 220');
  lampSvg.setAttribute('preserveAspectRatio', 'none');
  
  const lampPost = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  lampPost.setAttribute('x', '18');
  lampPost.setAttribute('y', '40');
  lampPost.setAttribute('width', '4');
  lampPost.setAttribute('height', '180');
  lampPost.setAttribute('fill', '#140b05');

  const lampBracket = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  lampBracket.setAttribute('d', 'M 20,45 Q 32,45 32,55');
  lampBracket.setAttribute('stroke', '#140b05');
  lampBracket.setAttribute('stroke-width', '3');
  lampBracket.setAttribute('fill', 'none');

  const lampHead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  lampHead.setAttribute('d', 'M 28,55 L 36,55 L 34,68 L 30,68 Z');
  lampHead.setAttribute('fill', '#2f1709');

  const lampBulb = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  lampBulb.setAttribute('cx', '32');
  lampBulb.setAttribute('cy', '60');
  lampBulb.setAttribute('r', '2.5');
  lampBulb.setAttribute('fill', '#f3a93c');

  lampSvg.appendChild(lampPost);
  lampSvg.appendChild(lampBracket);
  lampSvg.appendChild(lampHead);
  lampSvg.appendChild(lampBulb);
  streetlamp.appendChild(lampSvg);

  const lampHalo = document.createElement('div');
  lampHalo.className = 'streetlamp-halo';
  streetlamp.appendChild(lampHalo);

  silhouetteLayer.appendChild(streetlamp);

  // Hanging brand sign
  const sign = document.createElement('div');
  sign.className = 'landing-cafe-sign';
  sign.textContent = 'After Hours';
  silhouetteLayer.appendChild(sign);

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let animationFrameId: number | null = null;
  const timeouts: number[] = [];
  const intervals: number[] = [];

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Simulation variables
  const rainDrops: RainDrop[] = [];
  const fogClouds: FogCloud[] = [];

  const initScene = (width: number, height: number) => {
    rainDrops.length = 0;
    const numRain = Math.floor(width * 0.08);
    for (let i = 0; i < numRain; i++) {
      rainDrops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 1.8 + Math.random() * 1.2,
        length: 22 + Math.random() * 10
      });
    }

    fogClouds.length = 0;
    const numFog = 3;
    const horizon = Math.floor(height * 0.70);
    for (let i = 0; i < numFog; i++) {
      fogClouds.push({
        x: Math.random() * width,
        y: horizon - 20 + Math.random() * 30,
        radius: 90 + Math.random() * 60,
        speed: 0.06 + Math.random() * 0.04,
        opacity: 0.08
      });
    }
  };

  const handleResize = () => {
    if (!canvas) return;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    initScene(width, height);
  };

  window.addEventListener('resize', handleResize);
  handleResize();

  let lastTime = Date.now();
  let time = 0;

  const loop = (nowTimestamp?: number) => {
    if (!ctx || !canvas) return;

    const width = canvas.width / Math.min(window.devicePixelRatio || 1, 2);
    const height = canvas.height / Math.min(window.devicePixelRatio || 1, 2);
    
    const current = nowTimestamp || Date.now();
    let dt = current - lastTime;
    if (dt > 100) dt = 16.67;
    lastTime = current;

    if (!prefersReducedMotion) {
      time += dt;
    }

    const horizon = Math.floor(height * 0.70);

    // --- CLEAR FRAME ---
    ctx.clearRect(0, 0, width, height);

    // --- LAYER 5: WET STREET / PAVEMENT HIGHLIGHTS ---
    const streetHeight = height - horizon;
    ctx.strokeStyle = 'rgba(74, 46, 30, 0.40)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 15; i++) {
      const yPos = horizon + Math.floor((i / 15) * streetHeight) + 1;
      const startX = (Math.sin(i * 12.3) * 0.45 + 0.5) * width;
      const strokeLen = 60 + Math.sin(i * 4.1) * 35;
      ctx.beginPath();
      ctx.moveTo(startX - strokeLen / 2, yPos);
      ctx.lineTo(startX + strokeLen / 2, yPos);
      ctx.stroke();
    }

    // --- LAYER 6: SHIMMERING REFLECTION (opacity 0.35–0.50) ---
    const windowWidth = width > 600 ? 90 : 76;
    const shimmerScale = prefersReducedMotion ? 0 : Math.sin(time / 160) * 1.2;

    for (let y = horizon; y < height; y += 3) {
      const dist = y - horizon;
      const opacity = Math.max(0, 1.0 - dist / (streetHeight * 0.88));
      if (opacity <= 0) continue;

      const windowX = width / 2;
      const spread = windowWidth * 0.72 + dist * 0.22;
      
      // Soft reflection layer
      ctx.fillStyle = `rgba(201, 130, 69, ${opacity * 0.42})`;
      ctx.fillRect(windowX - Math.floor(spread / 2) + Math.sin(y * 0.06 + time * 0.003) * shimmerScale, y, spread, 3);

      // Center bright smear
      ctx.fillStyle = `rgba(243, 169, 60, ${opacity * 0.48})`;
      ctx.fillRect(windowX - 3 + Math.sin(y * 0.06 + time * 0.003) * (shimmerScale * 0.6), y, 6, 3);
    }

    // --- LAYER 7: AMBIENT FOG (opacity 0.07–0.10) ---
    for (const cloud of fogClouds) {
      if (!prefersReducedMotion) {
        cloud.x += cloud.speed * (dt / 16.67);
        if (cloud.x - cloud.radius > width) {
          cloud.x = -cloud.radius;
        }
      }
      const fogGrad = ctx.createRadialGradient(
        cloud.x, cloud.y, 0,
        cloud.x, cloud.y, cloud.radius
      );
      fogGrad.addColorStop(0, `rgba(74, 38, 13, ${cloud.opacity})`);
      fogGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = fogGrad;
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- LAYER 8: SOFT RAIN (opacity 0.10–0.16) ---
    ctx.strokeStyle = 'rgba(243, 169, 60, 0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const drop of rainDrops) {
      if (!prefersReducedMotion) {
        drop.y += drop.speed * (dt / 16.67);
        drop.x += (drop.speed * 0.12) * (dt / 16.67);
        if (drop.y > height) {
          drop.y = -20;
          drop.x = Math.random() * width;
        }
      }
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + 0.8, drop.y + drop.length);
    }
    ctx.stroke();

    // --- LAYER 9: VIGNETTE OVERLAY ---
    const vigGrad = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.55,
      width / 2, height / 2, Math.max(width, height) * 0.95
    );
    vigGrad.addColorStop(0, 'rgba(16, 9, 4, 0.0)');
    vigGrad.addColorStop(0.5, 'rgba(16, 9, 4, 0.30)');
    vigGrad.addColorStop(1.0, 'rgba(16, 9, 4, 0.70)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, width, height);

    if (!prefersReducedMotion) {
      animationFrameId = requestAnimationFrame(loop);
    }
  };

  loop();

  const handleVisibilityChange = () => {
    if (document.hidden) {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    } else {
      if (animationFrameId === null && !prefersReducedMotion) {
        lastTime = Date.now();
        loop();
      }
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const cleanup = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
    timeouts.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
    // Remove canvas, style block, and silhouette layer
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    if (silhouetteLayer && silhouetteLayer.parentNode) {
      silhouetteLayer.parentNode.removeChild(silhouetteLayer);
    }
    const styleBlock = document.getElementById('landing-entrance-style');
    if (styleBlock && styleBlock.parentNode) {
      styleBlock.parentNode.removeChild(styleBlock);
    }
    container.style.background = '';
  };

  return cleanup;
}
