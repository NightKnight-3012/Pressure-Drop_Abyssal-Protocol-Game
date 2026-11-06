import assert from "node:assert/strict";
import http from "node:http";
import { resolve } from "node:path";
import { createStaticHandler } from "../server/http.js";
import { pathBlocked, collides, PLAYER_RADIUS } from "../shared/layout.js";
import { normalizeOptions } from "../client/src/options.js";
import { podMotionTarget, POD_VISUAL_SCALE } from "../client/src/pod-motion.js";

let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log(`PASS ${name}`); }
check("opposite sides of a thin wall have free destinations", !collides(-0.8, -6) && !collides(0.8, -6));
check("a valid destination cannot bypass the wall along its path", pathBlocked(-0.8, -6, 0.8, -6));
check("the open central corridor remains traversable", !pathBlocked(-1, -1, 1, -1));
check("non-finite movement is refused", pathBlocked(0, 0, NaN, 1));
check("path checking has a bounded cost for extreme packets", pathBlocked(0, 0, 1e10, 1));
check("zero collider radius is refused", pathBlocked(0, 0, 1, 1, 0));
check("null stored preferences recover safely", normalizeOptions(null).quality === "balanced");
check("unknown quality cannot reach renderer settings", normalizeOptions({ quality: "__proto__" }).quality === "balanced");
check("stored sensitivity stays within usable bounds", normalizeOptions({ sensitivity: 100 }).sensitivity === 2.5);
check("invalid brightness recovers to default", normalizeOptions({ brightness: "dark" }).brightness === 1.15);
check("brightness cannot become negative", normalizeOptions({ brightness: -20 }).brightness === 0.7);
check("stored booleans do not accept strings", normalizeOptions({ sound: "false" }).sound === true);
check("unknown storage keys are discarded", !("injected" in normalizeOptions({ injected: true })));
check("valid preferences survive normalization", normalizeOptions({ quality: "low", captions: false }).quality === "low" && !normalizeOptions({ captions: false }).captions);
const cruise = { status: "running", speed: 2.8, creatureDistance: 16 }, boost = { ...cruise, speed: 4.4, boosting: true };
check("pod boost widens vision beyond normal cruise", podMotionTarget(boost).fov > podMotionTarget(cruise).fov);
check("reduced effects keep a fixed pod field of view", podMotionTarget(boost, true).fov === 68);
check("rear view retains a readable fixed field of view", podMotionTarget(boost, false, true).fov === 68);
check("visual route scaling preserves server progression", podMotionTarget(cruise).travelSpeed === cruise.speed * POD_VISUAL_SCALE && cruise.speed === 2.8);
check("a settled pod does not keep engine or boost effects running", podMotionTarget({ ...boost, status: "escaped" }).speed === 0 && !podMotionTarget({ ...boost, status: "escaped" }).boost);
check("low-throttle boost still gives thrust feedback", podMotionTarget({ ...boost, speed: 3 }).boost);
check("pursuit intensity increases as the creature closes", podMotionTarget({ ...cruise, creatureDistance: 5 }).danger > podMotionTarget(cruise).danger);

// The real production handler, independently of Vite or the browser harness.
const server = http.createServer(createStaticHandler(resolve("client")));
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  let response = await fetch(base + "/health?probe=1");
  check("health probe accepts query strings", response.ok && (await response.json()).ok);
  check("responses disable MIME sniffing", response.headers.get("x-content-type-options") === "nosniff");
  response = await fetch(base + "/");
  check("production handler serves the entry document", response.ok && (await response.text()).includes("Pressure Drop"));
  check("entry HTML always revalidates", response.headers.get("cache-control") === "no-cache");
  const etag = response.headers.get("etag");
  response = await fetch(base + "/", { headers: { "If-None-Match": etag } });
  check("unchanged resources support conditional requests", response.status === 304);
  response = await fetch(base + "/", { method: "HEAD" });
  check("HEAD returns metadata without a body", response.ok && response.headers.has("content-length") && (await response.text()) === "");
  response = await fetch(base + "/public/audio/done.wav");
  check("original audio serves as WAV instead of a generic download",response.ok && response.headers.get("content-type")==="audio/wav" && Buffer.from(await response.arrayBuffer()).toString("ascii",0,4)==="RIFF");
  response = await fetch(base + "/missing-model.glb");
  check("missing models return 404 instead of HTML", response.status === 404 && !(await response.text()).includes("<!doctype"));
  response = await fetch(base + "/%zz"); check("malformed URL encoding returns 400", response.status === 400);
  response = await fetch(base + "/%2e%2e%2fpackage.json"); check("encoded traversal is refused", response.status === 403);
  response = await fetch(base + "/%00"); check("null bytes are refused", response.status === 403);
  response = await fetch(base + "/.env"); check("hidden configuration files are refused", response.status === 403);
  response = await fetch(base + "/index.html:private"); check("Windows alternate streams are refused", response.status === 403);
  response = await fetch(base + "/", { method: "POST" }); check("static routes reject unsupported methods", response.status === 405 && response.headers.get("allow") === "GET, HEAD");
  response = await fetch(base + "/public"); check("directory requests do not expose listings", response.status === 404);
} finally { await new Promise(r => server.close(r)); }
console.log(`${checks}/${checks} release checks passed`);
