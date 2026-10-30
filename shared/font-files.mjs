export const FONT_LIMIT = 20 * 1024 * 1024;
export const fontTypes = Object.freeze({ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'});
export function fontType(path) {return fontTypes[String(path).split('.').at(-1).toLowerCase()] || null;}
export function fontData(path, bytes) {
  const type=fontType(path);
  if (!type) throw new Error('Unsupported font format');
  if (bytes.byteLength > FONT_LIMIT) throw new Error('Font exceeds the 20 MB limit');
  let binary='';
  for (let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {type,bytes:bytes.byteLength,url:`data:${type};base64,${btoa(binary)}`};
}
export const readOnlyDocument = doc => Boolean(doc?.font || (doc?.image && doc.image.type!=='image/svg+xml'));
