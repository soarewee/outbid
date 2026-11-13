// What can be bought on Outbid: the categories an intent can name. Each has the words the pages show, the
// description the buyer's agent reads when it works out what a request needs, and the merchant category a
// card for it is bound to. Nothing else in the code knows what a category is: add one here, give a vendor a
// price for it in vendors.mjs, and it can be asked for, bid on and paid for like any other.
import { readFileSync } from "node:fs";

export const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url)));
// What the pages need to name a category and its unit.
export const catalogForPages = Object.fromEntries(Object.entries(catalog).map(([key, c]) => [key, { name: c.name, unit: c.unit }]));
