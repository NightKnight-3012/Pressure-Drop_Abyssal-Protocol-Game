import fs from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".map": "application/json",
  ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".webp": "image/webp", ".jpg": "image/jpeg", ".wav":"audio/wav"
};

export function createStaticHandler(directory, {health=()=>({ok:true}),rooms,leaderboard}={}) {
  const root = path.resolve(directory);
  const rates=new Map();let nextCleanup=0;
  return async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { Allow: "GET, HEAD" }); return res.end(); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
    catch { res.writeHead(400); return res.end("Invalid URL"); }
    const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify(value));};
    if(pathname==='/health'){const state=health();return json(state.ok?200:503,state);}
    if(pathname.startsWith('/api/')){
      const now=Date.now(),ip=req.socket.remoteAddress||'unknown';if(now>=nextCleanup){nextCleanup=now+60000;for(const [key,value] of rates)if(now-value.start>=60000)rates.delete(key);}
      let rate=rates.get(ip);if(!rate||now-rate.start>=60000){rate={start:now,count:0};rates.set(ip,rate);}if(++rate.count>120)return json(429,{error:'Please retry shortly.'});
      if(pathname==='/api/rooms'&&rooms)return json(200,{rooms:rooms()});
      if(pathname==='/api/leaderboard'&&leaderboard){const query=new URL(req.url,'http://localhost').searchParams;try{return json(200,{entries:leaderboard({period:query.get('period')||'all',kind:query.get('kind')||'escapes',crewSize:Number(query.get('crewSize')||0)})});}catch{return json(400,{error:'Invalid leaderboard filters.'});}}
      return json(404,{error:'Not found'});
    }
    const parts = pathname.replace(/\\/g, "/").split("/");
    if (pathname.includes("\0") || pathname.includes(":") || parts.some(part => part.startsWith(".") && part !== "")) { res.writeHead(403); return res.end(); }
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    try {
      const info = await stat(file);
      if (!info.isFile()) { res.writeHead(404); return res.end("Not found"); }
      const etag = `W/"${info.size}-${Math.trunc(info.mtimeMs)}"`;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", /^\/assets\/[\w.-]+-[\w-]+\.(js|css)$/.test(pathname) ? "public, max-age=31536000, immutable" : "no-cache");
      if (req.headers["if-none-match"] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": info.size });
      if (req.method === "HEAD") return res.end();
      const stream = fs.createReadStream(file);
      stream.on("error", () => res.destroy()); res.on("close", () => stream.destroy()); stream.pipe(res);
    } catch (error) {
      res.writeHead(error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500);
      res.end(pathname === "/" && error.code === "ENOENT" ? "Build the client with npm run build, or use http://localhost:5173 for development." : "Not found");
    }
  };
}
