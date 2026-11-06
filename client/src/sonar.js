// The sonar screen shown on the Command console: where the Leviathan is, plus the crew.
import { EXT_LIMIT, HULL_OUT, WALLS, EXTERIOR_STRUCTURES, EXTERIOR_ROUTES } from "../../shared/layout.js";
import { SALVAGE } from '../../shared/salvage.js';

const RANGE = EXT_LIMIT+4; // all survey routes fit on Command's tactical display

export function drawSonar(canvas, state, time) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const w = canvas.width, h = canvas.height, c = w / 2, r = w / 2 - 6;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#031017"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(112,234,255,0.25)"; g.lineWidth = 1;
  for (const f of [0.25, 0.5, 0.75, 1]) { g.beginPath(); g.arc(c, c, r * f, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(c - r, c); g.lineTo(c + r, c); g.moveTo(c, c - r); g.lineTo(c, c + r); g.stroke();

  // sweep
  const sweep = (time * 1.6) % (Math.PI * 2);
  const grad = g.createLinearGradient(c, c, c + Math.cos(sweep) * r, c + Math.sin(sweep) * r);
  grad.addColorStop(0, "rgba(112,234,255,0)"); grad.addColorStop(1, "rgba(112,234,255,0.55)");
  g.strokeStyle = grad; g.lineWidth = 2;
  g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(sweep) * r, c + Math.sin(sweep) * r); g.stroke();

  // station footprint
  const k = r / RANGE;
  g.strokeStyle='rgba(145,174,166,.4)';g.lineWidth=1;
  for(const route of EXTERIOR_ROUTES){g.beginPath();route.points.forEach(([x,z],i)=>i?g.lineTo(c+x*k,c+z*k):g.moveTo(c+x*k,c+z*k));g.stroke();}
  for(const s of EXTERIOR_STRUCTURES)g.strokeRect(c+(s.cx-s.w/2)*k,c+(s.cz-s.d/2)*k,s.w*k,s.d*k);
  g.strokeRect(c-EXT_LIMIT*k,c-EXT_LIMIT*k,EXT_LIMIT*2*k,EXT_LIMIT*2*k);
  g.fillStyle='#90aaa9';g.font='8px monospace';
  g.fillText('VENT GARDEN',c-52*k,c+30*k);g.fillText('WRECK',c+32*k,c+27*k);g.fillText('BASALT CLEFT',c-16*k,c-48*k);
  g.strokeStyle = "rgba(160,200,215,0.7)"; g.lineWidth = 1.5;
  g.strokeRect(c - HULL_OUT * k, c - HULL_OUT * k, HULL_OUT * 2 * k, HULL_OUT * 2 * k);
  g.beginPath();
  for(const wall of WALLS.slice(4)) {
    const horizontal=wall.w>wall.d;
    g.moveTo(c+(wall.cx-(horizontal?wall.w/2:0))*k,c+(wall.cz-(horizontal?0:wall.d/2))*k);
    g.lineTo(c+(wall.cx+(horizontal?wall.w/2:0))*k,c+(wall.cz+(horizontal?0:wall.d/2))*k);
  }g.stroke();

  // crew
  if(state.salvage?.state==='available'){
    g.strokeStyle='#e0d8a0';g.strokeRect(c+SALVAGE.x*k-4,c+SALVAGE.z*k-4,8,8);
    g.fillStyle='#e0d8a0';g.font='8px monospace';g.fillText('PART',c+SALVAGE.x*k+6,c+SALVAGE.z*k);
  }
  for (const p of state.players) {
    if (p.lost || p.aboard) continue;
    g.fillStyle = p.down ? "#ff5364" : p.ext ? "#6ec1ff" : "#d6e9ef";
    g.beginPath(); g.arc(c + p.x * k, c + p.z * k, p.ext ? 3.5 : 2.5, 0, Math.PI * 2); g.fill();
  }

  // decoy
  if (state.decoy.active) {
    g.fillStyle = "#5dffb0";
    g.font = "10px monospace";
    g.fillText("DECOY", 8, h - 8);
  }

  // Leviathan
  const lev = state.lev;
  const d = Math.min(lev.dist, RANGE - 1) * k;
  const lx = c + Math.cos(lev.angle) * d, lz = c + Math.sin(lev.angle) * d;
  const hot = lev.state === "approach" || lev.state === "attack";
  const pulse = 5 + Math.sin(time * 6) * (hot ? 3 : 1);
  g.fillStyle = hot ? "rgba(255,83,100,0.95)" : "rgba(255,179,71,0.9)";
  g.beginPath(); g.arc(lx, lz, pulse, 0, Math.PI * 2); g.fill();
  g.strokeStyle = g.fillStyle; g.lineWidth = 1;
  g.beginPath(); g.arc(lx, lz, pulse + 6, 0, Math.PI * 2); g.stroke();
  void EXT_LIMIT;
}

export function sonarReadout(state) {
  const lev = state.lev;
  const bearing = Math.round(((lev.angle * 180) / Math.PI + 450) % 360); // 0 = north
  return `CONTACT: ${lev.state.toUpperCase()}  |  BEARING ${String(bearing).padStart(3, "0")}  |  RANGE ${Math.round(lev.dist)} m  |  THREAT ${Math.round(lev.threat)}%`;
}
