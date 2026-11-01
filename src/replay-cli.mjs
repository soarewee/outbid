#!/usr/bin/env node
// Replays a saved demo run on the stage, with the original pacing, so the page can be recorded or
// reviewed without touching the sandbox. Run: npm run demo:replay -- out/demo-<time>.json [--speed 2]
import { readFileSync } from "node:fs";
import { sleep } from "./airwallex.mjs";
import { openStage } from "./stage.mjs";

const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run demo:replay -- out/demo-<time>.json [--speed 2]");
  process.exit(1);
}
const speedArg = process.argv.indexOf("--speed");
const speed = speedArg > 0 ? Number(process.argv[speedArg + 1]) : 1;
const { events } = JSON.parse(readFileSync(file));
if (!events?.length) {
  console.error("This run has no stage events to replay.");
  process.exit(1);
}

const stage = openStage();
await stage.listening;
console.log(`Stage: ${stage.url}/buyer and ${stage.url}/vendor  (waiting for a browser)`);
await stage.viewer;

let last = 0;
// A replay never waits for the buyer: the intent that was posted is in the start event.
for (const { type, t, ...data } of events.filter((e) => e.type !== "await-intent")) {
  await sleep(Math.min((t - last) / speed, 8000));
  last = t;
  stage.emit(type, data);
  if (type === "scene") console.log(`━━ ${data.n}. ${data.title}`);
}
console.log("Replayed. Press Ctrl-C to close the stage.");
