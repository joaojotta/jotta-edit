// CSS colour parsing and conversion for Jotta Edit's built-in colour editor.
// This module has no DOM dependencies so it can be tested without Electron.
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = v => Math.round(clamp(v, 0, 255));
const percent = v => clamp(v, 0, 100);
const n = v => Number(v);
function numberPart(raw, unit = '') {
  const s = String(raw).trim();
  if (unit === '%' && !s.endsWith('%')) return NaN;
  return Number(s.replace(/%$/, ''));
}
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = percent(s) / 100; l = percent(l) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
  return { r: round((r + m) * 255), g: round((g + m) * 255), b: round((b + m) * 255) };
}
export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), diff = max-min;
  let h = 0; const l = (max+min)/2;
  let s = 0;
  if (diff) {
    s = diff / (1-Math.abs(2*l-1));
    switch(max) {
      case r: h = ((g-b)/diff)%6; break;
      case g: h = (b-r)/diff+2; break;
      default: h = (r-g)/diff+4;
    }
    h = ((h*60)%360+360)%360;
  }
  return { h: Math.round(h), s: Math.round(s*100), l: Math.round(l*100) };
}
export function parseCssColor(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(text);
  if (hex) {
    let parts = hex[1];
    if (parts.length <= 4) parts = [...parts].map(x => x+x).join('');
    const vals = parts.match(/../g).map(x => parseInt(x,16));
    return { r: vals[0], g: vals[1], b: vals[2], a: vals.length === 4 ? vals[3] / 255 : 1, kind: 'hex', shortHex: hex[1].length <= 4 };
  }
  const fn = /^(rgba?|hsla?)\((.*)\)$/i.exec(text);
  if (!fn) return null;
  const kind = fn[1].toLowerCase().startsWith('hsl') ? 'hsl' : 'rgb';
  const args = fn[2].includes(',') ? fn[2].split(/\s*,\s*/) : fn[2].trim().replace(/\s*\/\s*/, ' / ').split(/\s+/).filter(v => v !== '/');
  if (args.length < 3 || args.length > 4) return null;
  const alpha = args.length === 4 ? (args[3].endsWith('%') ? n(args[3].slice(0,-1))/100 : n(args[3])) : 1;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  if (kind === 'rgb') {
    const values = args.slice(0,3).map(v => v.endsWith('%') ? n(v.slice(0,-1))*255/100 : n(v));
    if (!values.every(v => Number.isFinite(v) && v >= 0 && v <= 255)) return null;
    return { r: round(values[0]), g: round(values[1]), b: round(values[2]), a: alpha, kind };
  }
  const h = numberPart(args[0].replace(/deg$/,'')), s = numberPart(args[1], '%'), l = numberPart(args[2], '%');
  if (![h,s,l].every(Number.isFinite) || s<0 || s>100 || l<0 || l>100) return null;
  return { ...hslToRgb(h,s,l), a: alpha, kind };
}
const byteHex = v => round(v).toString(16).padStart(2, '0');
export function formatCssColor(color, kind = 'hex') {
  const c = { r:round(color.r), g:round(color.g), b:round(color.b), a:clamp(Number(color.a ?? 1),0,1) };
  const a = Math.round(c.a*100)/100;
  if (kind === 'hsl') {
    const hsl = rgbToHsl(c);
    return `${a < 1 ? 'hsla' : 'hsl'}(${hsl.h}, ${hsl.s}%, ${hsl.l}%${a < 1 ? ', ' + a : ''})`;
  }
  if (kind === 'rgb') return `${a < 1 ? 'rgba' : 'rgb'}(${c.r}, ${c.g}, ${c.b}${a < 1 ? ', ' + a : ''})`;
  return `#${byteHex(c.r)}${byteHex(c.g)}${byteHex(c.b)}${a < 1 ? byteHex(c.a*255) : ''}`;
}
export function findCssColors(text, max = 350) {
  const result = [];
  const regexp = /(?:#[\da-fA-F]{3,8}(?![\da-fA-F])|\b(?:rgb|rgba|hsl|hsla)\(\s*[^()\n]{3,90}\))/g;
  let match;
  while ((match = regexp.exec(text)) && result.length < max) {
    const color = parseCssColor(match[0]);
    if (color) result.push({ start: match.index, end: match.index+match[0].length, text: match[0], color });
  }
  return result;
}

// sRGB/CMYK conversion for editing only. CSS output uses HEX/RGBA: CMYK
// needs a device-specific colour profile and is not reliably supported by CSS.
export function rgbToCmyk({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1 - 1e-9) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round((1 - rr - k) / (1 - k) * 100),
    m: Math.round((1 - gg - k) / (1 - k) * 100),
    y: Math.round((1 - bb - k) / (1 - k) * 100),
    k: Math.round(k * 100)
  };
}
export function cmykToRgb(c, m, y, k) {
  const channel = v => clamp(Number(v) || 0, 0, 100) / 100;
  const kk = channel(k);
  return {
    r: round(255 * (1 - channel(c)) * (1 - kk)),
    g: round(255 * (1 - channel(m)) * (1 - kk)),
    b: round(255 * (1 - channel(y)) * (1 - kk))
  };
}

// Choose readable text after compositing transparent colours onto the editor.
export function colorTextContrast(color, background = {r:30, g:30, b:30}) {
  const alpha = clamp(Number(color.a ?? 1), 0, 1);
  const linear = value => {
    const channel = clamp(value, 0, 255) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const rgb = ['r','g','b'].map(key => linear(color[key] * alpha + background[key] * (1 - alpha)));
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}
