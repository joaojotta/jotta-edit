// SVG is always loaded as an image, never inserted into the page as markup.
export function installImageViewer({host, tr = s => s, activate = () => {}, changed = () => {}}) {
  const make = (tag, cls, parent = host) => {
    const node = document.createElement(tag); node.className = cls; parent.appendChild(node); return node;
  };
  host.classList.add('image-viewer'); host.hidden = true;
  const toolbar = make('div', 'image-toolbar');
  let doc = null, code = false, scale = null, source = null;
  const button = (label, action) => {
    const node = make('button', '', toolbar); node.type = 'button'; node.textContent = tr(label);
    node.setAttribute('aria-label', tr(label)); node.onclick = () => {activate(); action();}; return node;
  };
  const codeButton = button('View code', () => {doc.imageCode = !doc.imageCode; changed();});
  const minus = button('Zoom out', () => zoom(-1));
  const plus = button('Zoom in', () => zoom(1));
  const actual = button('Actual size', () => {scale = 1; draw();});
  const fit = button('Fit image', () => {scale = null; draw();});
  const info = make('span', 'image-info', toolbar); info.setAttribute('role', 'status');
  const viewport = make('div', 'image-viewport'); viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', tr('Image preview'));
  const image = make('img', 'image-content', viewport);
  image.draggable = false;
  const error = make('p', 'image-error', viewport); error.hidden = true;
  error.textContent = tr('Cannot display this image. The file may be damaged or unsupported.');
  function draw() {
    const natural = image.naturalWidth;
    if (scale === null) {
      image.style.width = ''; image.style.height = ''; image.style.maxWidth = '100%'; image.style.maxHeight = '100%';
    } else {
      image.style.maxWidth = 'none'; image.style.maxHeight = 'none';
      image.style.width = natural ? `${natural * scale}px` : ''; image.style.height = 'auto';
    }
    info.textContent = natural ? `${natural} × ${image.naturalHeight} · ${scale === null ? tr('Fit image') : Math.round(scale * 100) + '%'}` : '';
    minus.disabled = scale !== null && scale <= .1; plus.disabled = scale !== null && scale >= 10;
  }
  function zoom(delta) {
    const current = scale ?? (image.naturalWidth ? Math.min(1, image.clientWidth / image.naturalWidth) : 1);
    scale = Math.max(.1, Math.min(10, current * (delta > 0 ? 1.25 : .8))); draw();
  }
  image.onload = () => {error.hidden = true; image.hidden = false; draw();};
  image.onerror = () => {image.hidden = true; error.hidden = false; info.textContent = '';};
  host.addEventListener('pointerdown', activate);
  host.addEventListener('focusin', activate);
  viewport.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
    event.preventDefault(); event.stopPropagation(); zoom(event.deltaY < 0 ? 1 : -1);
  }, {passive:false});
  return {
    show(next) {
      const different = doc !== next;
      doc = next; host.hidden = !doc?.image;
      if (!doc?.image) {source = null; image.removeAttribute('src'); return false;}
      if (different) scale = null;
      const svg = doc.image.type === 'image/svg+xml'; code = svg && Boolean(doc.imageCode);
      host.classList.toggle('image-code', code);
      codeButton.hidden = !svg; codeButton.textContent = tr(code ? 'View image' : 'View code');
      codeButton.setAttribute('aria-label', codeButton.textContent);
      codeButton.setAttribute('aria-pressed', String(code));
      viewport.hidden = code;
      for (const node of [minus, plus, actual, fit, info]) node.hidden = code;
      const url = svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc.model.getValue()) : doc.image.url;
      if (source !== url) {source = url; error.hidden = true; image.hidden = false; image.alt = doc.name; image.src = url;}
      draw(); return !code;
    },
    focus() { (code ? codeButton : viewport).focus(); },
    zoom, reset() {scale = null; draw();},
    get visible() {return Boolean(doc?.image && !code);}
  };
}
