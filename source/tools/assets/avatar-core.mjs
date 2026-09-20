import { createAvatar, bottts, botttsNeutral } from './vendor/dicebear.mjs?v=9.4.3';

export function avatarSVG({ seed, style = 'bottts', color = '#00897b', background = '#e9f0e4', transparent = false, radius = 18, flip = false }) {
  const identity = String(seed || '').normalize('NFC').trim().slice(0, 80) || 'Oniums';
  if (!['bottts', 'bottts-neutral'].includes(style)) throw new Error('未知头像风格');
  if (![color, background].every(c => /^#[0-9a-f]{6}$/i.test(c))) throw new Error('无效颜色');
  const options = {
    seed: identity, size: 512, radius: Math.max(0, Math.min(50, Number(radius) || 0)), flip,
    backgroundColor: [transparent ? 'transparent' : background.slice(1)],
    ...(style === 'bottts' ? { baseColor: [color.slice(1)] } : {})
  };
  return createAvatar(style === 'bottts' ? bottts : botttsNeutral, options).toString();
}
