import { WORLDS, WorldConfig } from './worlds';
import { $ } from '../utils/dom';

export function applyAtmosphere(themeName: string) {
  const config = WORLDS[themeName] || WORLDS['default'];

  // Apply accent colors and lighting variables
  applyCSSVariables(config);

  // Update room subtitle/description with the atmospheric copy
  const roomDesc = $('room-desc');
  if (roomDesc) {
    roomDesc.textContent = config.ambientCopy;
  }

  // Update body class
  const body = document.body;
  if (body) {
    const classesToRemove: string[] = [];
    body.classList.forEach(cls => {
      if (cls.startsWith('theme-')) {
        classesToRemove.push(cls);
      }
    });
    classesToRemove.forEach(cls => body.classList.remove(cls));
    body.classList.add(`theme-${config.theme}`);
  }

  // Apply room-view positional transform
  const roomView = $('room-view');
  if (roomView) {
    // Get the value set by CSS variable (we set it via inline style for direct control)
    const transform = getComputedStyle(document.documentElement)
      .getPropertyValue('--room-view-transform').trim();
    if (transform) {
      (roomView as HTMLElement).style.transform = transform;
    }
  }

  // Apply theme page tint to body background tint layer
  applyThemeTint(config);

  // Clear layers — no illustrative SVG art
  renderFarLayer(config);
  renderMidLayer(config);
  renderNearLayer(config);
}

function applyCSSVariables(config: WorldConfig) {
  const doc = document.documentElement;
  doc.style.setProperty('--sky-top', config.skyTop);
  doc.style.setProperty('--sky-bottom', config.skyBottom);
  
  // Set the theme lighting style
  const styles = config.lightingStyle.trim().split(';');
  styles.forEach(style => {
    const parts = style.split(':');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      // Rejoin in case value contained colons (e.g. gradients with rgba)
      const val = parts.slice(1).join(':').trim();
      if (name && val) {
        doc.style.setProperty(name, val);
      }
    }
  });
}

function applyThemeTint(_config: WorldConfig) {
  // Find or create the tint overlay element
  let tintEl = document.getElementById('theme-tint-overlay') as HTMLElement | null;
  if (!tintEl) {
    tintEl = document.createElement('div');
    tintEl.id = 'theme-tint-overlay';
    tintEl.style.position = 'fixed';
    tintEl.style.inset = '0';
    tintEl.style.pointerEvents = 'none';
    tintEl.style.zIndex = '1';
    tintEl.style.transition = 'background 2s cubic-bezier(0.4, 0, 0.2, 1)';
    document.body.appendChild(tintEl);
  }
  const tint = getComputedStyle(document.documentElement)
    .getPropertyValue('--theme-tint').trim() || 'rgba(0,0,0,0)';
  tintEl.style.background = tint;
}

// Phase 5: Per-theme micro details
function renderFarLayer(_config: WorldConfig) {
  // Use the body theme class to determine which micro-detail to show
  const theme = document.body.className.match(/theme-(\S+)/)?.[1] || 'default';
  const container = $('atmosphere-far');
  if (!container) return;
  container.textContent = ''; // safe clear

  if (theme === 'window-seat') {
    // Very faint diagonal glass reflection lines (SVG)
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;';

    const line1 = document.createElementNS(ns, 'line');
    line1.setAttribute('x1', '25%'); line1.setAttribute('y1', '0');
    line1.setAttribute('x2', '10%'); line1.setAttribute('y2', '100%');
    line1.setAttribute('stroke', 'rgba(255,255,255,0.016)');
    line1.setAttribute('stroke-width', '120');

    const line2 = document.createElementNS(ns, 'line');
    line2.setAttribute('x1', '68%'); line2.setAttribute('y1', '0');
    line2.setAttribute('x2', '52%'); line2.setAttribute('y2', '100%');
    line2.setAttribute('stroke', 'rgba(255,255,255,0.010)');
    line2.setAttribute('stroke-width', '80');

    svg.appendChild(line1);
    svg.appendChild(line2);
    container.appendChild(svg);
  }
}

function renderMidLayer(_config: WorldConfig) {
  const theme = document.body.className.match(/theme-(\S+)/)?.[1] || 'default';
  const container = $('atmosphere-mid');
  if (!container) return;
  container.textContent = ''; // safe clear

  if (theme === 'last-train') {
    // Single tiny red signal dot — no tracks, no platform
    const dot = document.createElement('div');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = `
      position: absolute;
      left: 14%;
      top: 52%;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #cc3322;
      box-shadow: 0 0 8px 3px rgba(204,51,34,0.55), 0 0 18px 6px rgba(204,51,34,0.25);
      animation: signalBlink 2.8s infinite ease-in-out;
      pointer-events: none;
    `;
    container.appendChild(dot);

    // Inject blink keyframe if not already present
    if (!document.getElementById('signal-blink-style')) {
      const style = document.createElement('style');
      style.id = 'signal-blink-style';
      style.textContent = `
        @keyframes signalBlink {
          0%, 100% { opacity: 0.85; }
          48% { opacity: 0.85; }
          50% { opacity: 0.15; }
          52% { opacity: 0.85; }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

function renderNearLayer(_config: WorldConfig) {
  const theme = document.body.className.match(/theme-(\S+)/)?.[1] || 'default';
  const container = $('atmosphere-near');
  if (!container) return;
  container.textContent = ''; // safe clear

  if (theme === 'northern-lights') {
    // Soft top glow — green-blue aurora wash, no bokeh/mountains
    const glow = document.createElement('div');
    glow.setAttribute('aria-hidden', 'true');
    glow.style.cssText = `
      position: absolute;
      top: -5%;
      left: -10%;
      width: 120%;
      height: 45%;
      background: radial-gradient(ellipse at 50% 0%, rgba(80,160,120,0.10) 0%, rgba(60,100,140,0.07) 40%, transparent 75%);
      animation: auroraShift 18s infinite alternate ease-in-out;
      pointer-events: none;
    `;
    container.appendChild(glow);

    if (!document.getElementById('aurora-shift-style')) {
      const style = document.createElement('style');
      style.id = 'aurora-shift-style';
      style.textContent = `
        @keyframes auroraShift {
          0%   { opacity: 0.7; transform: scaleX(1) translateY(0); }
          33%  { opacity: 1;   transform: scaleX(1.04) translateY(1vh); }
          66%  { opacity: 0.85; transform: scaleX(0.97) translateY(-1vh); }
          100% { opacity: 0.7; transform: scaleX(1.02) translateY(0.5vh); }
        }
      `;
      document.head.appendChild(style);
    }
  }
}
