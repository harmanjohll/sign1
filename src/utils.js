// Small math helpers shared across modules.

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// Linear interpolate from a -> b by t (t in 0..1).
export const lerp = (a, b, t) => a + (b - a) * t;

// Remap x from [inMin,inMax] to [outMin,outMax], clamped to the output range.
export const remap = (x, inMin, inMax, outMin, outMax) => {
  const t = clamp((x - inMin) / (inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * t;
};

// Lowercase the first character: "LeftUpperArm" -> "leftUpperArm".
export const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
