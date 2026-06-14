const SVG_NS = "http://www.w3.org/2000/svg";

interface SVGNodeDef {
  tag: string;
  attrs: Record<string, string>;
}

const ICONS: Record<string, SVGNodeDef[]> = {
  coffee: [
    { tag: "path", attrs: { d: "M18 8h1a4 4 0 0 1 0 8h-1" } },
    { tag: "path", attrs: { d: "M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" } },
    { tag: "path", attrs: { d: "M6 1v3" } },
    { tag: "path", attrs: { d: "M10 1v3" } },
    { tag: "path", attrs: { d: "M14 1v3" } }
  ],
  vhs: [
    { tag: "rect", attrs: { x: "2", y: "5", width: "20", height: "14", rx: "2" } },
    { tag: "circle", attrs: { cx: "7.5", cy: "12", r: "2.5" } },
    { tag: "circle", attrs: { cx: "16.5", cy: "12", r: "2.5" } },
    { tag: "rect", attrs: { x: "11", y: "9", width: "2", height: "6" } }
  ],
  polaroid: [
    { tag: "rect", attrs: { x: "3", y: "3", width: "18", height: "18", rx: "2" } },
    { tag: "rect", attrs: { x: "5", y: "5", width: "14", height: "11" } },
    { tag: "circle", attrs: { cx: "12", cy: "18", r: "1" } }
  ],
  pushpin: [
    { tag: "path", attrs: { d: "M12 17v5M5 8h14M7 8v5c0 1.5 1 2.5 3.5 3h3c2.5-.5 3.5-1.5 3.5-3V8M9 4h6M12 4v4" } }
  ],
  note: [
    { tag: "path", attrs: { d: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" } },
    { tag: "path", attrs: { d: "M14 3v6h6M8 13h8M8 17h5" } }
  ],
  book: [
    { tag: "path", attrs: { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" } },
    { tag: "path", attrs: { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" } }
  ],
  object: [
    { tag: "path", attrs: { d: "M8 22h8M12 14v8M12 6a4 4 0 1 0 0 8 4 4 0 1 0 0-8z" } },
    { tag: "path", attrs: { d: "M12 2v4" } }
  ],
  room: [
    { tag: "path", attrs: { d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" } },
    { tag: "polyline", attrs: { points: "9 22 9 12 15 12 15 22" } }
  ],
  star: [
    { tag: "polygon", attrs: { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" } }
  ],
  user: [
    { tag: "path", attrs: { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" } },
    { tag: "circle", attrs: { cx: "12", cy: "7", r: "4" } }
  ],
  train: [
    { tag: "rect", attrs: { x: "4", y: "6", width: "16", height: "12", rx: "2" } },
    { tag: "circle", attrs: { cx: "8", cy: "20", r: "2" } },
    { tag: "circle", attrs: { cx: "16", cy: "20", r: "2" } },
    { tag: "path", attrs: { d: "M2 18h20M9 6v4M15 6v4M6 13h12" } }
  ],
  window: [
    { tag: "rect", attrs: { x: "3", y: "3", width: "18", height: "18", rx: "2" } },
    { tag: "line", attrs: { x1: "12", y1: "3", x2: "12", y2: "21" } },
    { tag: "line", attrs: { x1: "3", y1: "12", x2: "21", y2: "12" } }
  ],
  aurora: [
    { tag: "path", attrs: { d: "M2 17c4-4 8 4 12 0s6-4 8-1M2 11c3-3 7 3 10 0s8-3 10-1M2 5c5-2 8 2 11 0s7-2 9 0" } }
  ],
  library: [
    { tag: "rect", attrs: { x: "3", y: "3", width: "18", height: "18", rx: "2" } },
    { tag: "line", attrs: { x1: "8", y1: "3", x2: "8", y2: "21" } },
    { tag: "line", attrs: { x1: "16", y1: "3", x2: "16", y2: "21" } },
    { tag: "line", attrs: { x1: "8", y1: "9", x2: "16", y2: "9" } },
    { tag: "line", attrs: { x1: "8", y1: "15", x2: "16", y2: "15" } }
  ],
  lantern: [
    { tag: "path", attrs: { d: "M12 2v3M8 9h8v9H8zM6 18h12v3H6zM8 5h8v4H8z" } },
    { tag: "line", attrs: { x1: "12", y1: "9", x2: "12", y2: "18" } }
  ]
};

export function getIcon(name: string, options: { class?: string, label?: string, title?: string, style?: string } = {}): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  
  const cls = `hc-icon ${options.class || ''}`;
  svg.setAttribute("class", cls.trim());
  
  if (options.label) {
    svg.setAttribute("aria-hidden", "false");
    svg.setAttribute("aria-label", options.label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  
  if (options.style) {
    svg.setAttribute("style", options.style);
  }
  
  if (options.title) {
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = options.title;
    svg.appendChild(title);
  }
  
  const shapes = ICONS[name] || ICONS.room;
  for (const shape of shapes) {
    const el = document.createElementNS(SVG_NS, shape.tag);
    for (const [key, val] of Object.entries(shape.attrs)) {
      el.setAttribute(key, val);
    }
    svg.appendChild(el);
  }
  
  return svg;
}
