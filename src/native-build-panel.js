import {buildDefaults, normalizeBuildSettings, compilerDiagnostic} from '../shared/native-build.mjs';
import {tr} from './i18n.js';

export function installNativeBuildPanel({api, getContext, prepare, openFile, layout = () => {},
  storage = localStorage, documentRef = document, host = documentRef.getElementById('main-area'), focusEditor = () => {}}) {
  if (!api.startNativeBuild) return null;
  const translated = [];
  function node(tag, className, text) {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    if (text) { element.textContent = tr(text); translated.push([element,text]); }
    return element;
  }
  const panel = node('section','native-build-panel'); panel.hidden = true;
  panel.id = 'native-build-panel';
  panel.setAttribute('aria-label',tr('Build & Run'));
  const resizer = node('div','native-build-resizer'); resizer.tabIndex = 0;
  resizer.setAttribute('role','separator'); resizer.setAttribute('aria-orientation','horizontal');
  resizer.setAttribute('aria-controls',panel.id);
  const heading = node('header','native-build-heading');
  const title = node('strong','','Build & Run'), project = node('span','native-build-project');
  const status = node('span','native-build-status'); status.setAttribute('role','status');
  const actions = node('div','native-build-actions');
  const buttons = {};
  for (const [name,label] of [['build','Build C/C++'],['run','Build and run C/C++'],['test','Test C/C++'],['stop','Stop build or program'],['clear','Clear output'],['hide','Hide build panel']]) {
    const button = node('button',name === 'build' ? 'primary' : '',label); button.type = 'button';
    buttons[name] = button; actions.append(button);
  }
  const outputFilter = node('label','native-build-output-filter');
  const programOnly = node('input'); programOnly.type = 'checkbox';
  try { programOnly.checked = storage.getItem('jotta.nativeBuild.programOutputOnly') === 'true'; } catch {}
  outputFilter.append(programOnly,node('span','','Program output only')); actions.append(outputFilter);
  const outputTools = node('div','native-build-output-tools');
  for (const [name,text] of [['fontDecrease','A−'],['fontReset',''],['fontIncrease','A+'],['fullscreen','']]) {
    const button = node('button'); button.type = 'button'; button.textContent = text;
    buttons[name] = button; outputTools.append(button);
  }
  actions.append(outputTools);
  heading.append(title,project,status);
  const details = node('details','native-build-settings'), summary = node('summary','','Build settings');
  const fields = {}, grid = node('div','native-build-fields');
  const definitions = [
    ['system','Build system',[['auto','Auto-detect'],['single','Single file'],['cmake','CMake'],['make','Make']]],
    ['compiler','Compiler',[['gcc','GCC / G++'],['clang','Clang / Clang++']]],
    ['buildDirectory','Build directory'],['target','Build target'],['testTarget','Test target (Make)'],
    ['executable','Executable path'],['compilerFlags','Compiler options (single file)'],
    ['configureArgs','CMake configure options'],['runArgs','Program arguments']
  ];
  for (const [key,label,options] of definitions) {
    const wrap = node('label'), caption = node('span','',label), input = node(options ? 'select' : 'input');
    if (options) for (const [value,text] of options) { const option = node('option','',text); option.value = value; input.append(option); }
    else { input.type = 'text'; input.spellcheck = false; input.maxLength = 8192; }
    input.value = buildDefaults[key]; fields[key] = input;
    input.addEventListener('change',persistSettings);
    wrap.append(caption,input); grid.append(wrap);
  }
  fields.buildDirectory.placeholder = 'build/jotta'; fields.executable.placeholder = 'build/jotta/my-program';
  fields.compilerFlags.placeholder = '-O0 -I"include files"'; fields.configureArgs.placeholder = '-DBUILD_TESTING=ON';
  const hint = node('p','native-build-hint','Uses installed GCC/Clang, CMake or Make. Saves changed project files before building. Paths are relative to the project folder.');
  details.append(summary,grid,hint);
  const output = node('pre','native-build-output'); output.tabIndex = 0;
  output.setAttribute('aria-label',tr('Compiler and program output'));
  const inputRow = node('form','native-build-input');
  const input = node('input'); input.type = 'text'; input.setAttribute('aria-label',tr('Program input')); input.maxLength = 65535;
  const send = node('button','','Send input'), eof = node('button','','End input'); send.type = 'submit'; eof.type = 'button';
  inputRow.append(input,send,eof); inputRow.hidden = true;
  panel.append(resizer,heading,actions,details,output,inputRow); host.append(panel);
  let contextKey = null, outputRoot = null, currentId = null, pending = false, running = false, phase = null;
  let lineBuffer = '', lineStream = '', lineOrigin = '', partial = null, outputBytes = 0, stdinClosed = false;
  const boundedFont = value => Math.max(10,Math.min(72,Number.isFinite(Number(value)) ? Math.round(Number(value)) : 14));
  let fontSize = 14;
  try { fontSize = boundedFont(storage.getItem('jotta.nativeBuild.fontSize') ?? 14); } catch {}
  let preferredHeight = 320, currentHeight = 320, drag = null;
  try {
    const saved = Number(storage.getItem('jotta.nativeBuild.height'));
    if (Number.isFinite(saved) && saved > 0) preferredHeight = saved;
  } catch {}
  function heightLimits() {
    const available = host.clientHeight || documentRef.defaultView?.innerHeight || 800;
    const max = Math.max(100,Math.floor(available * .8));
    return {min:Math.min(180,max),max};
  }
  function applyHeight(value = preferredHeight) {
    if (fullscreen()) return;
    const {min,max} = heightLimits();
    currentHeight = Math.max(min,Math.min(max,Math.round(value)));
    panel.style.height = `${currentHeight}px`;
    resizer.setAttribute('aria-valuemin',String(min)); resizer.setAttribute('aria-valuemax',String(max));
    resizer.setAttribute('aria-valuenow',String(currentHeight));
  }
  function resizePanel(value,save = true) {
    if (fullscreen() || panel.hidden) return;
    applyHeight(value); layout();
    if (save) {
      preferredHeight = currentHeight;
      try { storage.setItem('jotta.nativeBuild.height',String(preferredHeight)); } catch {}
    }
  }
  function endResize(save = false) {
    if (!drag) return;
    const {id} = drag; drag = null;
    if (save) resizePanel(currentHeight);
    else { applyHeight(); layout(); }
    if (resizer.hasPointerCapture(id)) resizer.releasePointerCapture(id);
  }
  resizer.addEventListener('pointerdown',event => {
    if (event.button !== 0 || event.isPrimary === false || drag || panel.hidden || fullscreen()) return;
    event.preventDefault(); resizer.focus();
    drag = {id:event.pointerId,y:event.clientY,height:panel.getBoundingClientRect().height};
    resizer.setPointerCapture(event.pointerId);
  });
  resizer.addEventListener('pointermove',event => {
    if (drag?.id === event.pointerId) resizePanel(drag.height + drag.y - event.clientY,false);
  });
  resizer.addEventListener('pointerup',event => { if (drag?.id === event.pointerId) endResize(true); });
  resizer.addEventListener('pointercancel',event => { if (drag?.id === event.pointerId) endResize(); });
  resizer.addEventListener('lostpointercapture',event => { if (drag?.id === event.pointerId) endResize(); });
  resizer.addEventListener('dblclick',() => resizePanel(320));
  resizer.addEventListener('keydown',event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key) || fullscreen() || panel.hidden) return;
    event.preventDefault();
    const {min,max} = heightLimits();
    resizePanel(event.key === 'Home' ? min : event.key === 'End' ? max : currentHeight + (event.key === 'ArrowUp' ? 20 : -20));
  });
  function fullscreen() { return documentRef.fullscreenElement === panel; }
  function updateOutputTools() {
    resizer.hidden = fullscreen(); resizer.title = tr('Resize build panel'); resizer.setAttribute('aria-label',tr('Resize build panel'));
    for (const [name,label] of [['fontDecrease','Decrease output text size'],['fontReset','Reset output text size'],['fontIncrease','Increase output text size'],
      ['fullscreen',fullscreen() ? 'Exit fullscreen' : 'Fullscreen output']]) {
      buttons[name].title = tr(label); buttons[name].setAttribute('aria-label',tr(label));
    }
    buttons.fullscreen.textContent = tr(fullscreen() ? 'Exit fullscreen' : 'Fullscreen output');
    buttons.fullscreen.setAttribute('aria-pressed',String(fullscreen()));
    buttons.fullscreen.disabled = !panel.requestFullscreen;
    buttons.fontReset.textContent = `${fontSize}px`;
    buttons.fontDecrease.disabled = fontSize === 10; buttons.fontIncrease.disabled = fontSize === 72;
    output.style.fontSize = input.style.fontSize = `${fontSize}px`;
  }
  function setFont(value) {
    fontSize = boundedFont(value); updateOutputTools();
    try { storage.setItem('jotta.nativeBuild.fontSize',String(fontSize)); } catch {}
  }
  function adjustFont(delta) { setFont(fontSize + delta); }
  function resetFont() { setFont(14); }
  function zoomTarget(event) {
    return !panel.hidden && (fullscreen() || Boolean(panel.contains(event?.target) || panel.contains(documentRef.activeElement) || panel.matches(':hover')));
  }
  async function toggleFullscreen() {
    try {
      if (fullscreen()) await documentRef.exitFullscreen();
      else await panel.requestFullscreen();
    } catch (error) { status.textContent = error.message; }
  }
  function fullscreenChanged() {
    endResize(); applyHeight(); updateOutputTools(); layout();
    if (!panel.hidden) output.focus();
  }
  documentRef.addEventListener('fullscreenchange',fullscreenChanged);
  buttons.fullscreen.addEventListener('click',toggleFullscreen);
  buttons.fontDecrease.addEventListener('click',() => adjustFont(-1));
  buttons.fontIncrease.addEventListener('click',() => adjustFont(1));
  buttons.fontReset.addEventListener('click',resetFont);
  let wheelAccum = 0, lastZoomWheel = 0;
  panel.addEventListener('wheel',event => {
    if (!event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault(); event.stopPropagation();
    if (Date.now() - lastZoomWheel > 240) wheelAccum = 0;
    lastZoomWheel = Date.now();
    wheelAccum += event.deltaY * (event.deltaMode === 1 ? 36 : event.deltaMode === 2 ? 600 : 1);
    if (Math.abs(wheelAccum) >= 45) {
      const steps = Math.min(3,Math.floor(Math.abs(wheelAccum) / 45));
      adjustFont((wheelAccum < 0 ? 1 : -1) * steps);
      wheelAccum -= Math.sign(wheelAccum) * steps * 45;
    }
  },{passive:false,capture:true});
  function context() { return getContext(); }
  function settingsKey(value) { return 'jotta.nativeBuild.' + (value.root || value.file?.replace(/[\\/][^\\/]*$/,'') || ''); }
  function refreshContext() {
    const value = context(), key = settingsKey(value);
    if (key !== contextKey) {
      let saved;
      try { saved = normalizeBuildSettings(JSON.parse(storage.getItem(key) || '{}')); } catch { saved = {...buildDefaults}; }
      for (const [name,field] of Object.entries(fields)) field.value = saved[name];
      contextKey = key;
    }
    project.textContent = value.root || value.file || tr('Open a saved C/C++ file or project folder.');
    project.title = project.textContent;
    return value;
  }
  function settings() { return normalizeBuildSettings(Object.fromEntries(Object.entries(fields).map(([name,field]) => [name,field.value]))); }
  function persistSettings() {
    try { storage.setItem(contextKey,JSON.stringify(settings())); }
    catch (error) { status.textContent = error.message; }
  }
  function updateControls() {
    for (const name of ['build','run','test']) buttons[name].disabled = pending || running;
    buttons.stop.disabled = !running;
    for (const field of Object.values(fields)) field.disabled = pending || running;
    inputRow.hidden = !running || phase !== 'run';
    input.disabled = send.disabled = eof.disabled = stdinClosed;
  }
  function show() { panel.hidden = false; applyHeight(); if(!pending&&!running)refreshContext(); layout(); }
  function hide() { endResize(); if (fullscreen()) void toggleFullscreen(); panel.hidden = true; layout(); focusEditor(); }
  function clear() { output.replaceChildren(); lineBuffer = ''; lineStream = ''; lineOrigin = ''; partial = null; outputBytes = 0; }
  function filterRow(row,origin) {
    row.dataset.origin = origin;
    row.hidden = programOnly.checked && origin !== 'program';
  }
  programOnly.addEventListener('change',() => {
    for (const row of output.children) filterRow(row,row.dataset.origin);
    try { storage.setItem('jotta.nativeBuild.programOutputOnly',String(programOnly.checked)); }
    catch (error) { status.textContent = error.message; }
  });
  function line(text,stream,origin = 'editor') {
    text = text.replace(/\n$/,'');
    const row = node('span','native-build-line'); row.dataset.stream = stream;
    filterRow(row,origin);
    const diagnostic = origin === 'build' && compilerDiagnostic(text);
    if (diagnostic && outputRoot) {
      const link = node('button','native-build-diagnostic'); link.type = 'button'; link.textContent = text;
      link.addEventListener('click',() => {
        // Resolve in the main process, including canonical containment checks.
        api.resolveBuildDiagnostic(outputRoot,diagnostic.file).then(file => openFile(file,{line:diagnostic.line,column:diagnostic.column})).catch(error => {status.textContent=error.message;});
      });
      row.append(link);
    } else row.textContent = text;
    output.append(row);
  }
  function append(text,stream = 'stdout',origin = 'editor') {
    if (outputBytes >= 2 * 1024 * 1024 + 65536) return;
    const follow = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
    outputBytes += text.length;
    // Remove terminal control sequences; output is text, never markup.
    text = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\x1b\][^\x07]*(?:\x07|$)/g,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    partial?.remove(); partial = null;
    if (lineBuffer && (lineStream !== stream || lineOrigin !== origin)) {line(lineBuffer,lineStream,lineOrigin);lineBuffer='';}
    lineStream = stream; lineOrigin = origin;
    const parts = (lineBuffer + text).split('\n'); lineBuffer = parts.pop();
    // Keep unterminated prompts visible while stdin is waiting.
    for (const part of parts) line(part + '\n',stream,origin);
    if (lineBuffer) { partial = node('span','native-build-partial'); partial.textContent = lineBuffer; filterRow(partial,origin); output.append(partial); }
    if (follow) output.scrollTop = output.scrollHeight;
  }
  async function start(action) {
    if (pending || running) return;
    show(); pending = true; updateControls();
    try {
      const value = refreshContext(), config = settings(); persistSettings();
      if (!await prepare(value)) {status.textContent=tr('Build cancelled. Resolve unsaved files first.');return;}
      // A workspace/file switch during a Save dialog must not build a new target.
      const latest = context();
      if (latest.root !== value.root || latest.file !== value.file) throw new Error(tr('Project changed. Start the build again.'));
      clear(); outputRoot = value.root; currentId = null; running = true; phase = null; stdinClosed = false;
      status.textContent = tr('Building…');
      const result = await api.startNativeBuild({...value,action,settings:config});
      currentId = result.id;
    } catch (error) { running = false; status.textContent=error.message; append(error.message+'\n','stderr'); }
    finally { pending = false; updateControls(); }
  }
  const unsubscribe = api.onNativeBuildEvent(event => {
    if (!running || currentId !== null && event.id !== currentId) return;
    currentId = event.id;
    if (event.type === 'start') { outputRoot = event.root; project.textContent = `${event.root} · ${event.system}`; }
    if (event.type === 'output') append(event.text,event.stream,event.origin || (event.stream === 'info' ? 'editor' : phase === 'run' ? 'program' : 'build'));
    if (event.type === 'phase') { phase=event.phase;status.textContent=tr(phase==='run'?'Running…':'Building…'); }
    if (event.type === 'done') {
      partial?.remove(); partial = null;
      if (lineBuffer) {line(lineBuffer,lineStream,lineOrigin);lineBuffer='';}
      running = false; phase = null;
      status.textContent = event.stopped ? tr('Stopped') : event.error ? event.error
        : event.code === 0 ? tr('Completed successfully') : `${tr('Failed')} (${event.signal || (event.code ?? '?')})`;
      line('\n'+status.textContent+'\n','info');
    }
    updateControls();
  });
  async function submit(eofRequested = false) {
    try {
      const value = input.value;
      await api.writeNativeBuildInput(eofRequested ? value : value+'\n',eofRequested);
      input.value = ''; if(eofRequested)stdinClosed=true;
      if(value)append(value+'\n','stdin'); updateControls();
    } catch (error) {status.textContent=error.message;}
  }
  inputRow.addEventListener('submit',event => {event.preventDefault();void submit();});
  eof.addEventListener('click',() => submit(true));
  buttons.build.addEventListener('click',() => start('build'));
  buttons.run.addEventListener('click',() => start('run'));
  buttons.test.addEventListener('click',() => start('test'));
  buttons.stop.addEventListener('click',() => api.stopNativeBuild().catch(error => {status.textContent=error.message;}));
  buttons.clear.addEventListener('click',clear); buttons.hide.addEventListener('click',hide);
  function localeChanged() { for(const [element,text]of translated)element.textContent=tr(text); updateOutputTools(); }
  documentRef.addEventListener('jotta:locale-changed',localeChanged);
  // Window size, panel height and expanded settings change the available area.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    if (!drag && entries.some(entry => entry.target === host)) applyHeight();
    layout();
  }) : null;
  observer?.observe(panel); observer?.observe(host);
  applyHeight(); updateControls(); updateOutputTools();
  return {show,hide,start,adjustFont,resetFont,zoomTarget,dispose(){hide();unsubscribe?.();observer?.disconnect();
    documentRef.removeEventListener('fullscreenchange',fullscreenChanged);documentRef.removeEventListener('jotta:locale-changed',localeChanged);panel.remove();}};
}
