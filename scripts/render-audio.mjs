import { mkdir, writeFile } from "node:fs/promises";
import { SOUNDS } from "../client/src/sound-catalog.js";
import { renderSound, encodeWav } from "./sound-design.mjs";
const folder=new URL("../client/public/audio/",import.meta.url); await mkdir(folder,{recursive:true});
let bytes=0;
for(const name of Object.keys(SOUNDS)) { const wav=encodeWav(renderSound(name));await writeFile(new URL(name+".wav",folder),wav);bytes+=wav.length; }
console.log(`Rendered ${Object.keys(SOUNDS).length} original sounds (${(bytes/1024/1024).toFixed(2)} MiB).`);
