// Formats decoded by Chromium's image element on desktop and web.
import {fontType,FONT_LIMIT} from './font-files.mjs';
export const IMAGE_LIMIT = 20 * 1024 * 1024;
export const imageTypes = Object.freeze({png:'image/png', apng:'image/apng', jpg:'image/jpeg', jpeg:'image/jpeg', jfif:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif', svg:'image/svg+xml', bmp:'image/bmp', ico:'image/x-icon'});
export function imageType(path) { return imageTypes[String(path).split('.').at(-1).toLowerCase()] || null; }
export function fileByteLimit(path) {if(fontType(path))return FONT_LIMIT;const type=imageType(path); return type && type!=='image/svg+xml' ? IMAGE_LIMIT : 5 * 1024 * 1024;}
export function imageData(path, bytes) {
  const type = imageType(path);
  if (!type) throw new Error('Unsupported image format');
  if (type === 'image/svg+xml' && bytes.byteLength > 5 * 1024 * 1024) throw new Error('SVG exceeds the 5 MB editor limit');
  if (bytes.byteLength > IMAGE_LIMIT) throw new Error('Image exceeds the 20 MB limit');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return {type, bytes:bytes.byteLength, url:`data:${type};base64,${btoa(binary)}`};
}
export const rasterDocument = doc => Boolean(doc?.image && doc.image.type !== 'image/svg+xml');
