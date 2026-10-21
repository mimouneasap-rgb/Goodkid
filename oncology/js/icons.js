// 24×24 stroke icons (1.75px), drawn for this app.
const P = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  dashboard: "M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z",
  review: "M9 4h6M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 3h6v3H9zM8.5 12.5l2 2 4.5-4.5M8.5 17.5h7",
  spc: "M3 20h18M4 6h16M4 16h16M5 13l3-4 3 2 3-5 3 7 2-3",
  product: "M10.5 3.5a4.95 4.95 0 0 1 7 7l-7 7a4.95 4.95 0 0 1-7-7zM7 10l7 7",
  room: "M4 21V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v17M9 21v-6h6v6M8 7h2M14 7h2M8 11h2M14 11h2",
  map: "M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20",
  equipment: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  fmea: "M12 3 2.5 19.5h19zM12 9.5v4.5M12 17h.01",
  capa: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  cc: "M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3",
  improve: "M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3zM9.5 19h5M10.5 21.5h3",
  sop: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8.5 13h7M8.5 17h5",
  quality: "M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6zM8.8 12l2.2 2.2 4.3-4.4",
  records: "M4 6h16M4 12h16M4 18h10",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.5-4.5",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1.5v2M12 20.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1.5 12h2M20.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z",
  upload: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  print: "M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z",
  close: "M6 6l12 12M18 6 6 18",
  menu: "M4 6h16M4 12h16M4 18h16",
  arrow: "M5 12h14M13 6l6 6-6 6",
  chevron: "M9 6l6 6-6 6",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
};

export function icon(name, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ico");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", P[name] ?? P.records);
  svg.append(p);
  return svg;
}
