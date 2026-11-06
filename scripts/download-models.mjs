import { mkdir, writeFile, rename, rm, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_FILES, modelUrls } from "../client/src/model-assets.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../client/public/models");
let failed = false;
const only = process.argv.slice(2);
if (only.some(id => !Object.hasOwn(MODEL_FILES, id))) {
  console.error(`Unknown model. Choose from: ${Object.keys(MODEL_FILES).join(", ")}`);
  process.exit(1);
}
for (const [id, file] of Object.entries(MODEL_FILES)) {
  if (only.length && !only.includes(id)) continue;
  const target = resolve(root, file);
  try {
    if (id === "crew") {
      await access(target);
      console.log(`Using authored local crew: ${file}`);
      continue;
    }
    let bytes, lastError;
    for (const url of modelUrls(id)) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
        break;
      } catch (error) { lastError = error; }
    }
    if (!bytes) throw lastError;
    if (file.endsWith(".gltf")) {
      const json = JSON.parse(bytes.toString("utf8"));
      if (!json.asset || [...(json.buffers || []), ...(json.images || [])].some(v => v.uri && !v.uri.startsWith("data:"))) {
        throw new Error("Expected a self-contained glTF model");
      }
    } else if (bytes.toString("utf8", 0, 4) !== "glTF") throw new Error("Invalid GLB model");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target + ".tmp", bytes);
    await rename(target + ".tmp", target);
    console.log(`Installed ${id}: ${file} (${Math.round(bytes.length / 1024)} KB)`);
  } catch (error) {
    failed = true;
    await rm(target + ".tmp", { force: true }).catch(() => {});
    console.error(`Could not install ${id}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
