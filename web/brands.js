// The demo and its recordings name the vendors "Vendor A", "Vendor B" and "Vendor C"; the pitch does too.
// These are the brands the pages show for them: fictional names, each with a monogram mark in its colour.
// Shared by the buyer and vendor consoles; the site carries static copies.
const BRANDS = {
  "Vendor A": { name: "Arbor", slot: 1, shape: "square" },
  "Vendor B": { name: "Birch", slot: 2, shape: "circle" },
  "Vendor C": { name: "Cedar", slot: 3, shape: "hex" },
};
const brandName = (vendor) => BRANDS[vendor]?.name ?? vendor;
const brandColor = (vendor) => `var(--s${BRANDS[vendor]?.slot ?? 1})`;
// A monogram mark: the brand's initial on its shape, as an inline SVG.
function brandMark(vendor, size = 18) {
  const b = BRANDS[vendor];
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 20 20"); s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("class", "mark"); s.setAttribute("aria-hidden", "true");
  const shape = b?.shape === "circle" ? "circle" : b?.shape === "hex" ? "polygon" : "rect";
  const bg = document.createElementNS(ns, shape);
  if (shape === "circle") { bg.setAttribute("cx", 10); bg.setAttribute("cy", 10); bg.setAttribute("r", 10); }
  else if (shape === "polygon") bg.setAttribute("points", "10,0 19,5 19,15 10,20 1,15 1,5");
  else { bg.setAttribute("width", 20); bg.setAttribute("height", 20); bg.setAttribute("rx", 5); }
  bg.setAttribute("fill", brandColor(vendor));
  const t = document.createElementNS(ns, "text");
  t.setAttribute("x", 10); t.setAttribute("y", 14.2); t.setAttribute("text-anchor", "middle");
  t.setAttribute("font-size", 12); t.setAttribute("font-weight", 600); t.setAttribute("fill", "#fff");
  t.setAttribute("font-family", "Geist, ui-sans-serif, system-ui, sans-serif");
  t.textContent = (b?.name ?? vendor).slice(0, 1).toUpperCase();
  s.append(bg, t);
  return s;
}
