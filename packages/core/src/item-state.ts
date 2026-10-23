/** Vanilla Java durability bar, in logical item pixels. Full durability is hidden. */
export function durabilityBar(damage: number, maxDamage: number): { width: number; color: string } | null {
  if (!Number.isSafeInteger(damage) || damage < 0 || !Number.isSafeInteger(maxDamage) || maxDamage < 0) throw new Error('Damage and maxDamage must be nonnegative safe integers.');
  if (!maxDamage || !damage) return null;
  const f = Math.fround;
  const remaining = Math.max(0,f(f(f(maxDamage)-f(damage))/f(maxDamage)));
  const hue = f(f(remaining/3)*6);
  const red = hue < 1 ? 255 : Math.floor(f(f(2-hue)*255));
  const green = hue < 1 ? Math.floor(f(hue*255)) : 255;
  const rgb = (Math.max(0,Math.min(255,red)) << 16) | (Math.max(0,Math.min(255,green)) << 8);
  return {width:Math.max(0,Math.min(13,Math.round(f(13-f(f(f(damage)*13)/f(maxDamage)))))),color:`#${rgb.toString(16).padStart(6,'0')}`};
}
