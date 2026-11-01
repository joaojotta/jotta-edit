'use strict';
const fs = require('./project-fs.cjs');
async function readImage(file) {
  const {imageType, imageData, fileByteLimit} = await import('../shared/image-files.mjs');
  const type = imageType(file);
  if (!type) return null;
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('Not a regular file');
  if (stat.size > fileByteLimit(file)) throw new Error(type==='image/svg+xml' ? 'SVG exceeds the 5 MB editor limit' : 'Image exceeds the 20 MB limit');
  const data = await fs.readFile(file);
  return {path:file, content:type === 'image/svg+xml' ? data.toString('utf8') : '', image:imageData(file, data), mtimeMs:stat.mtimeMs};
}
module.exports = {readImage};
