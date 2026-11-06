// Sustained frame pressure lowers pixel count; short loading hitches do not.
export function createRenderBudget(maxRatio, minRatio = 0.75) {
  let ratio = maxRatio, elapsed = 0, frames = 0, warmup = 1.5, good = 0;
  return {
    sample(seconds, active = true) {
      if (!active || !Number.isFinite(seconds) || seconds <= 0) { elapsed = 0; frames = 0; good = 0; return null; }
      if (warmup > 0) { warmup -= seconds; return null; }
      elapsed += Math.min(seconds, 0.2); frames++;
      if (elapsed < 1.5 || frames < 6) return null;
      const fps = frames / elapsed; elapsed = 0; frames = 0;
      let next = ratio;
      if (fps < 38) { next = Math.max(Math.min(minRatio, maxRatio), ratio - 0.15); good = 0; }
      else if (fps > 55) { if (++good >= 6) { next = Math.min(maxRatio, ratio + 0.1); good = 0; } }
      else good = 0;
      if (Math.abs(next - ratio) < 0.01) return null;
      ratio = Math.round(next * 100) / 100; return ratio;
    }
  };
}
