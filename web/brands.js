// The demo and its recordings name the vendors "Vendor A", "Vendor B" and "Vendor C"; the pitch does too.
// These are the brands the pages show for them: fictional GPU clouds with short names that read and say
// easily, each with its own mark in its colour. Shared by the buyer and vendor consoles; the site carries
// static copies of the names.
const BRANDS = {
  "Vendor A": { name: "Orbit", slot: 1, mark: "orbit" },
  "Vendor B": { name: "Harbor", slot: 2, mark: "harbor" },
  "Vendor C": { name: "Summit", slot: 3, mark: "summit" },
};
const brandName = (vendor) => BRANDS[vendor]?.name ?? vendor;
const brandColor = (vendor) => `var(--s${BRANDS[vendor]?.slot ?? 1})`;
// The brand's mark as an inline SVG: a rounded tile in the brand's colour with a white glyph that says the
// name (an orbit, a harbour's waves, a summit), not an initial.
function brandMark(vendor, size = 18) {
  const b = BRANDS[vendor];
  const ns = "http://www.w3.org/2000/svg";
  const make = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const s = make("svg", { viewBox: "0 0 20 20", width: size, height: size, class: "mark", "aria-hidden": "true" });
  s.append(make("rect", { width: 20, height: 20, rx: 6, fill: brandColor(vendor) }));
  const line = { fill: "none", stroke: "#fff", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" };
  if (b?.mark === "orbit") {
    s.append(make("ellipse", { cx: 10, cy: 10, rx: 6.6, ry: 3.6, transform: "rotate(-28 10 10)", ...line }));
    s.append(make("circle", { cx: 10, cy: 10, r: 2.2, fill: "#fff" }));
  } else if (b?.mark === "harbor") {
    s.append(make("path", { d: "M4 8.2c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 2-1 3-.6", ...line }));
    s.append(make("path", { d: "M4 12.6c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 2-1 3-.6", ...line }));
  } else if (b?.mark === "summit") {
    s.append(make("path", { d: "M3.6 15 8.4 6.8l2.6 4.2 1.6-2.4 3.8 6.4Z", fill: "#fff" }));
  } else {
    const t = make("text", { x: 10, y: 14.2, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: "#fff", "font-family": "Geist, ui-sans-serif, system-ui, sans-serif" });
    t.textContent = (b?.name ?? vendor).slice(0, 1).toUpperCase();
    s.append(t);
  }
  return s;
}
