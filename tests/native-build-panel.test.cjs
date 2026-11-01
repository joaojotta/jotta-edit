'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
async function fixture(options={}) {
  const {installNativeBuildPanel}=await import('../src/native-build-panel.js');
  const {documentRef,elements}=panelDom(['main-area']);
  elements['main-area'].clientHeight=options.height ?? 800;
  const storage=options.storage || new Map(),calls=[];let callback,prepared=0,layouts=0,editorFocus=0;
  const context={root:'/project',file:'/project/main.cpp'};
  const api={startNativeBuild:async value=>{calls.push(value);return {id:42};},
    onNativeBuildEvent(fn){callback=fn;return ()=>{};},stopNativeBuild:async()=>{},
    writeNativeBuildInput:async(...args)=>{calls.push(args);return options.writeInput?.(...args);},resolveBuildDiagnostic:async(root,file)=>root+'/'+file};
  const controller=installNativeBuildPanel({api,getContext:()=>({...context}),prepare:async()=>{prepared++;return options.saved!==false;},
    openFile:(...args)=>calls.push(args),layout:()=>layouts++,focusEditor:()=>editorFocus++,documentRef,storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  const panel=elements['main-area'].children[0], [resizer,heading,actions,details,output]=panel.children;
  const [history,input]=output.children, eof=actions.children.at(-1);
  const buttons=actions.children,fields=details.children[1].children.map(label=>label.children[1]);
  const key=(key,options={})=>input.dispatch('keydown',{key,preventDefault(){},stopPropagation(){},...options});
  return {controller,panel,resizer,host:elements['main-area'],heading,buttons,fields,output,history,input,eof,key,calls,context,storage,documentRef,emit:event=>callback({id:42,...event}),get prepared(){return prepared;},get layouts(){return layouts;},get editorFocus(){return editorFocus;}};
}
test('panel saves before building, persists project options and follows output/exit state',async()=>{
  const f=await fixture();assert.equal(f.panel.hidden,true);
  f.controller.show();assert.equal(f.panel.hidden,false);assert.equal(f.heading.children[1].textContent,'/project');
  f.fields[2].value='build/custom';f.fields[2].dispatch('change');
  await f.controller.start('test');assert.equal(f.prepared,1);assert.equal(f.calls[0].settings.buildDirectory,'build/custom');
  assert.equal(f.calls[0].action,'test');assert.equal(f.buttons[0].disabled,true);assert.equal(f.buttons[3].disabled,false);
  f.emit({type:'start',root:'/project',system:'cmake'});f.emit({type:'output',text:'<script>unsafe()</script>\n',stream:'stdout'});
  assert.equal(f.history.children.at(-1).textContent,'<script>unsafe()</script>');assert.equal(f.history.children.at(-1).children.length,0);
  f.emit({type:'done',code:0});assert.equal(f.buttons[0].disabled,false);assert.equal(f.buttons[3].disabled,true);
  assert.equal(f.heading.children[2].textContent,'Completed successfully');assert.ok(f.storage.has('jotta.nativeBuild./project'));
});
test('a cancelled save prevents compilation and leaves the panel usable',async()=>{
  const f=await fixture({saved:false});await f.controller.start('run');
  assert.equal(f.calls.length,0);assert.equal(f.buttons[0].disabled,false);assert.match(f.heading.children[2].textContent,/cancelled/);
});
test('program input sends a line and EOF; hiding the panel does not stop execution',async()=>{
  const f=await fixture();await f.controller.start('run');
  f.emit({type:'phase',phase:'run'});assert.equal(f.input.hidden,false);
  assert.equal(f.documentRef.activeElement,f.input);assert.equal(f.output.contains(f.input),true);
  assert.equal(f.panel.querySelectorAll('form').length,0);
  f.input.value='hello';await f.key('Enter');assert.deepEqual(f.calls.at(-1),['hello\n',false]);
  await f.eof.dispatch('click');assert.deepEqual(f.calls.at(-1),['',true]);
  assert.equal(f.input.disabled,true);assert.equal(f.input.hidden,true);
  f.controller.hide();assert.equal(f.panel.hidden,true);f.controller.show();assert.equal(f.buttons[0].disabled,true);
  f.emit({type:'done',code:null,stopped:true});assert.equal(f.heading.children[2].textContent,'Stopped');
});
test('console input stays beside a partial prompt, echoes before program replies and respects the output filter',async()=>{
  let f;
  f=await fixture({writeInput:()=>f.emit({type:'output',text:'Welcome\n',stream:'stdout',origin:'program'})});
  await f.controller.start('run');f.emit({type:'phase',phase:'run'});
  f.emit({type:'output',text:'Name: ',stream:'stdout',origin:'program'});
  const filter=f.buttons[6].children[0];filter.checked=true;filter.dispatch('change');
  assert.equal(f.input.hidden,false);assert.equal(f.history.children.at(-1).textContent,'Name: ');
  f.input.value='João ☕';f.input.dispatch('input');
  await f.key('Enter');assert.deepEqual(f.calls.at(-1),['João ☕\n',false]);
  const prompt=f.history.children[0],echo=prompt.children[0];
  assert.equal(prompt.textContent,'Name: ');assert.equal(echo.textContent,'João ☕');
  assert.equal(echo.hidden,true);assert.equal(prompt.hidden,false);
  assert.equal(f.history.children[1].textContent,'Welcome');assert.equal(f.input.value,'');
  filter.checked=false;filter.dispatch('change');assert.equal(echo.hidden,false);
  f.input.value='next draft';f.buttons[4].dispatch('click');
  assert.equal(f.history.children.length,0);assert.equal(f.input.value,'next draft');
  assert.equal(f.output.contains(f.input),true);assert.equal(f.documentRef.activeElement,f.input);
});
test('console clicks focus input without disturbing selected output or diagnostic links',async()=>{
  const f=await fixture();await f.controller.start('run');f.emit({type:'phase',phase:'run'});
  f.documentRef.activeElement=null;f.output.dispatch('click',{target:f.output});assert.equal(f.documentRef.activeElement,f.input);
  f.documentRef.activeElement=null;f.documentRef.getSelection=()=>({isCollapsed:false});
  f.output.dispatch('click',{target:f.output});assert.equal(f.documentRef.activeElement,null);
  f.documentRef.getSelection=()=>({isCollapsed:true});
  f.output.dispatch('click',{target:{closest:()=>({})}});assert.equal(f.documentRef.activeElement,null);
  f.output.dispatch('focus');assert.equal(f.documentRef.activeElement,f.input);
});
test('Enter sends blank lines, composition stays local and Ctrl+D sends pending text once',async()=>{
  const f=await fixture();await f.controller.start('run');
  await f.key('Enter');assert.equal(f.calls.length,1);assert.equal(f.input.hidden,true);
  f.emit({type:'phase',phase:'run'});f.input.value='composing';
  await f.key('Enter',{isComposing:true});await f.key('Enter',{keyCode:229});assert.equal(f.calls.length,1);
  f.input.value='';await f.key('Enter');assert.deepEqual(f.calls.at(-1),['\n',false]);
  f.input.value='last text';await f.key('d',{ctrlKey:true});assert.deepEqual(f.calls.at(-1),['last text',true]);
  const count=f.calls.length;await f.key('Enter');await f.key('d',{ctrlKey:true});assert.equal(f.calls.length,count);
  assert.equal(f.input.hidden,true);assert.equal(f.eof.disabled,true);
});
test('pending input blocks duplicate sends and late IPC cannot close or clear the next program input',async()=>{
  let resolve;
  const f=await fixture({writeInput:()=>new Promise(done=>{resolve=done;})});
  await f.controller.start('run');f.emit({type:'phase',phase:'run'});f.input.value='first';
  const pending=f.key('d',{ctrlKey:true});await f.key('Enter');assert.equal(f.calls.length,2);
  assert.equal(f.input.readOnly,true);assert.equal(f.eof.disabled,true);
  f.emit({type:'done',code:0});await f.controller.start('run');f.emit({type:'phase',phase:'run'});f.input.value='new draft';
  resolve();await pending;assert.equal(f.input.value,'new draft');assert.equal(f.input.hidden,false);assert.equal(f.input.readOnly,false);
});
test('failed input delivery retains the draft and reports the error',async()=>{
  const f=await fixture({writeInput:()=>{throw new Error('Input unavailable');}});
  await f.controller.start('run');f.emit({type:'phase',phase:'run'});f.input.value='retry';
  await f.key('Enter');assert.equal(f.input.value,'retry');assert.equal(f.input.readOnly,false);
  assert.equal(f.heading.children[2].textContent,'Input unavailable');assert.equal(f.eof.disabled,false);
  f.emit({type:'done',code:0});assert.equal(f.input.value,'');assert.equal(f.input.hidden,true);
});
test('compiler diagnostics resolve paths through IPC before opening at the right line',async()=>{
  const f=await fixture();await f.controller.start('build');f.emit({type:'start',root:'/project',system:'single'});
  f.emit({type:'output',text:'main.cpp:9:3: error: missing semicolon\n',stream:'stderr'});
  const button=f.history.children.at(-1).children[0];await button.dispatch('click');await Promise.resolve();
  assert.deepEqual(f.calls.at(-1),['/project/main.cpp',{line:9,column:3}]);
  f.emit({type:'done',code:1});assert.equal(f.heading.children[2].textContent,'Failed (1)');
});
test('browser builds have no native panel or process API',async()=>{
  const {installNativeBuildPanel}=await import('../src/native-build-panel.js');
  const {documentRef,elements}=panelDom(['main-area']);
  assert.equal(installNativeBuildPanel({api:{},documentRef,storage:{}}),null);
  assert.equal(elements['main-area'].children.length,0);
});
test('program output only hides build/editor messages and stdin echoes, and persists across panels',async()=>{
  const f=await fixture(),filter=f.buttons[6].children[0];
  filter.checked=true;filter.dispatch('change');
  await f.controller.start('run');
  for(const event of [
    {text:'> gcc main.c\n',stream:'info',origin:'editor'},
    {text:'compiler warning\n',stream:'stderr',origin:'build'},
    {text:'program stdout\n',stream:'stdout',origin:'program'},
    {text:'program stderr\n',stream:'stderr',origin:'program'}
  ])f.emit({type:'output',...event});
  f.emit({type:'phase',phase:'run'});
  f.input.value='echoed input';
  await f.key('Enter');
  f.emit({type:'done',code:0});
  assert.deepEqual(f.history.children.filter(row=>!row.hidden).map(row=>row.textContent),['program stdout','program stderr']);
  assert.equal(f.heading.children[2].textContent,'Completed successfully');
  assert.equal(f.storage.get('jotta.nativeBuild.programOutputOnly'),'true');
  const restored=await fixture({storage:f.storage});assert.equal(restored.buttons[6].children[0].checked,true);
  filter.checked=false;filter.dispatch('change');
  assert.ok(f.history.children.every(row=>!row.hidden));
  assert.ok(f.history.children.some(row=>row.textContent.includes('echoed input')));
  assert.ok(f.history.children.some(row=>row.textContent.includes('Completed successfully')));
});
test('filtering partial prompts keeps build and program lines separate and can be changed during a run',async()=>{
  const f=await fixture(),filter=f.buttons[6].children[0];await f.controller.start('run');
  f.emit({type:'output',text:'build partial',stream:'stdout',origin:'build'});
  f.emit({type:'output',text:'Prompt: ',stream:'stdout',origin:'program'});
  filter.checked=true;filter.dispatch('change');
  assert.deepEqual(f.history.children.filter(row=>!row.hidden).map(row=>row.textContent),['Prompt: ']);
  f.emit({type:'output',text:'answer\n',stream:'stdout',origin:'program'});
  assert.deepEqual(f.history.children.filter(row=>!row.hidden).map(row=>row.textContent),['Prompt: answer']);
  f.emit({type:'done',code:7});
  assert.equal(f.history.children.filter(row=>!row.hidden).length,1);
  assert.equal(f.heading.children[2].textContent,'Failed (7)');
  filter.checked=false;filter.dispatch('change');
  assert.equal(f.history.children[0].textContent,'build partial');
});
test('program text resembling a diagnostic is displayed as program output',async()=>{
  const f=await fixture();await f.controller.start('run');f.emit({type:'start',root:'/project',system:'single'});
  f.emit({type:'output',text:'main.cpp:1:1: error: program text\n',stream:'stderr',origin:'program'});
  assert.equal(f.history.children[0].children.length,0);
});
test('fullscreen keeps the running output and stdin; exit, hide and dispose restore the panel',async()=>{
  const f=await fixture(),fullscreen=f.buttons[7].children[3];await f.controller.start('run');
  f.emit({type:'phase',phase:'run'});f.emit({type:'output',text:'hello\n',stream:'stdout',origin:'program'});
  await fullscreen.dispatch('click');
  assert.equal(f.documentRef.fullscreenElement,f.panel);assert.equal(fullscreen.textContent,'Exit fullscreen');
  assert.equal(fullscreen.getAttribute('aria-pressed'),'true');assert.equal(f.input.hidden,false);
  assert.equal(f.documentRef.activeElement,f.input);assert.equal(f.history.children[0].textContent,'hello');
  f.input.value='fullscreen input';await f.key('Enter');
  assert.deepEqual(f.calls.at(-1),['fullscreen input\n',false]);
  // Escape is handled by the browser; its fullscreenchange event updates controls.
  await f.documentRef.exitFullscreen();assert.equal(fullscreen.textContent,'Fullscreen output');
  assert.equal(fullscreen.getAttribute('aria-pressed'),'false');assert.equal(f.panel.hidden,false);
  await fullscreen.dispatch('click');await fullscreen.dispatch('click');assert.equal(f.documentRef.fullscreenElement,null);
  await fullscreen.dispatch('click');f.controller.hide();await Promise.resolve();
  assert.equal(f.documentRef.fullscreenElement,null);assert.equal(f.panel.hidden,true);assert.equal(f.editorFocus,1);
  f.controller.show();assert.equal(f.buttons[0].disabled,true);
  await fullscreen.dispatch('click');f.controller.dispose();await Promise.resolve();
  assert.equal(f.documentRef.fullscreenElement,null);assert.equal(f.panel.parentElement,null);assert.ok(f.layouts>1);
});
test('fullscreen failures are reported without hiding the output or interrupting execution',async()=>{
  const f=await fixture();await f.controller.start('run');
  f.panel.requestFullscreen=async()=>{throw new Error('Fullscreen unavailable');};
  await f.buttons[7].children[3].dispatch('click');
  assert.equal(f.heading.children[2].textContent,'Fullscreen unavailable');
  assert.equal(f.panel.hidden,false);assert.equal(f.buttons[0].disabled,true);assert.equal(f.documentRef.fullscreenElement,null);
});
test('output controls persist bounded text sizing for output and input and keep dynamic labels after locale changes',async()=>{
  const f=await fixture(),[minus,reset,plus]=f.buttons[7].children;
  assert.equal(f.output.style.fontSize,'14px');plus.dispatch('click');
  assert.equal(f.output.style.fontSize,'15px');assert.equal(f.input.style.fontSize,'15px');assert.equal(reset.textContent,'15px');
  assert.equal(f.storage.get('jotta.nativeBuild.fontSize'),'15');
  const restored=await fixture({storage:f.storage});assert.equal(restored.output.style.fontSize,'15px');
  f.controller.adjustFont(1000);assert.equal(f.output.style.fontSize,'72px');assert.equal(plus.disabled,true);
  f.controller.adjustFont(-1000);assert.equal(f.output.style.fontSize,'10px');assert.equal(minus.disabled,true);
  reset.dispatch('click');assert.equal(f.output.style.fontSize,'14px');assert.equal(minus.disabled,false);assert.equal(plus.disabled,false);
  minus.dispatch('click');f.documentRef.dispatch('jotta:locale-changed');assert.equal(reset.textContent,'13px');
  assert.equal(f.buttons[7].children[3].textContent,'Fullscreen output');
});
test('Ctrl+wheel scales output with editor delta handling and leaves normal and modified scrolling alone',async()=>{
  const f=await fixture();f.controller.show();let prevented=0,stopped=0;
  const wheel=(options={})=>f.panel.dispatch('wheel',{ctrlKey:true,deltaY:-45,deltaMode:0,
    preventDefault(){prevented++;},stopPropagation(){stopped++;},...options});
  wheel({ctrlKey:false});wheel({altKey:true});wheel({shiftKey:true});assert.equal(f.output.style.fontSize,'14px');assert.equal(prevented,0);
  wheel({deltaY:-20});assert.equal(f.output.style.fontSize,'14px');
  wheel({deltaY:-25});assert.equal(f.output.style.fontSize,'15px');
  wheel({deltaY:3,deltaMode:1});assert.equal(f.output.style.fontSize,'13px');
  wheel({deltaY:-1,deltaMode:2});assert.equal(f.output.style.fontSize,'16px');
  assert.equal(prevented,4);assert.equal(stopped,4);
});
test('shared keyboard zoom targets output by focus, pointer or fullscreen and falls back to editor outside the panel',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const f=await fixture();let editorSize=14;
  const code=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const routing=code.slice(code.indexOf('function adjustTextSize('),code.indexOf('function applyPlainTextHighlights('));
  const state={fontSize:14},context={nativeBuildPanel:f.controller,markdownPanel:null,explorerZoomTarget:()=>false,editorLayout:null,
    state,adjustFont:delta=>editorSize+=delta,applyTypography:()=>editorSize=state.fontSize};
  vm.createContext(context);vm.runInContext(routing,context);
  f.controller.show();f.input.focus();context.adjustTextSize(1);
  assert.equal(f.output.style.fontSize,'15px');assert.equal(editorSize,14);
  context.resetTextSize();assert.equal(f.output.style.fontSize,'14px');
  f.documentRef.activeElement=null;f.panel.hovered=true;context.adjustTextSize(-1);assert.equal(f.output.style.fontSize,'13px');
  f.panel.hovered=false;context.adjustTextSize(1,{target:f.output});assert.equal(f.output.style.fontSize,'14px');
  await f.buttons[7].children[3].dispatch('click');f.documentRef.activeElement=null;context.adjustTextSize(1);assert.equal(f.output.style.fontSize,'15px');
  f.controller.hide();context.adjustTextSize(1);assert.equal(editorSize,15);assert.equal(f.output.style.fontSize,'15px');
});
test('dragging the top separator resizes in both directions, captures the pointer and remembers height',async()=>{
  const f=await fixture();f.controller.show();
  assert.equal(f.panel.style.height,'320px');assert.equal(f.resizer.getAttribute('role'),'separator');
  assert.equal(f.resizer.getAttribute('aria-orientation'),'horizontal');
  const down={button:0,pointerId:1,clientY:400,preventDefault(){}};
  f.resizer.dispatch('pointerdown',down);assert.equal(f.resizer.hasPointerCapture(1),true);
  f.resizer.dispatch('pointermove',{pointerId:2,clientY:100});assert.equal(f.panel.style.height,'320px');
  f.resizer.dispatch('pointermove',{pointerId:1,clientY:300});assert.equal(f.panel.style.height,'420px');
  assert.equal(f.resizer.getAttribute('aria-valuenow'),'420');
  f.resizer.dispatch('pointermove',{pointerId:1,clientY:450});assert.equal(f.panel.style.height,'270px');
  f.resizer.dispatch('pointerup',{pointerId:1});assert.equal(f.resizer.hasPointerCapture(1),false);
  assert.equal(f.storage.get('jotta.nativeBuild.height'),'270');
  const restored=await fixture({storage:f.storage});restored.controller.show();assert.equal(restored.panel.style.height,'270px');
  f.controller.hide();f.controller.show();assert.equal(f.panel.style.height,'270px');
});
test('panel resizing is bounded, supports keyboard controls and double-click restores the default',async()=>{
  const f=await fixture();f.controller.show();let prevented=0;
  const key=key=>f.resizer.dispatch('keydown',{key,preventDefault(){prevented++;}});
  key('ArrowUp');assert.equal(f.panel.style.height,'340px');key('ArrowDown');assert.equal(f.panel.style.height,'320px');
  key('End');assert.equal(f.panel.style.height,'640px');assert.equal(f.resizer.getAttribute('aria-valuemax'),'640');
  key('ArrowUp');assert.equal(f.panel.style.height,'640px');key('Home');assert.equal(f.panel.style.height,'180px');
  key('ArrowDown');assert.equal(f.panel.style.height,'180px');assert.equal(f.resizer.getAttribute('aria-valuemin'),'180');
  assert.equal(prevented,6);
  f.resizer.dispatch('dblclick');assert.equal(f.panel.style.height,'320px');assert.equal(f.storage.get('jotta.nativeBuild.height'),'320');
  f.resizer.dispatch('pointerdown',{button:0,pointerId:3,clientY:400,preventDefault(){}});
  f.resizer.dispatch('pointermove',{pointerId:3,clientY:-500});assert.equal(f.panel.style.height,'640px');
  f.resizer.dispatch('pointermove',{pointerId:3,clientY:5000});assert.equal(f.panel.style.height,'180px');
  f.resizer.dispatch('pointerup',{pointerId:3});
});
test('cancelled and lost drags restore the saved height and hidden or fullscreen panels ignore resizing',async()=>{
  const f=await fixture();f.controller.show();
  const down={button:0,pointerId:1,clientY:400,preventDefault(){}};
  for(const end of ['pointercancel','lostpointercapture']) {
    f.resizer.dispatch('pointerdown',down);f.resizer.dispatch('pointermove',{pointerId:1,clientY:300});
    f.resizer.dispatch(end,{pointerId:1});assert.equal(f.panel.style.height,'320px');
    assert.equal(f.resizer.hasPointerCapture(1),false);assert.equal(f.storage.has('jotta.nativeBuild.height'),false);
  }
  f.resizer.dispatch('pointerdown',{...down,button:2});assert.equal(f.resizer.hasPointerCapture(1),false);
  f.resizer.dispatch('keydown',{key:'ArrowUp',preventDefault(){}});assert.equal(f.panel.style.height,'340px');
  await f.buttons[7].children[3].dispatch('click');assert.equal(f.resizer.hidden,true);
  f.resizer.dispatch('pointerdown',down);assert.equal(f.resizer.hasPointerCapture(1),false);
  f.resizer.dispatch('keydown',{key:'End',preventDefault(){}});assert.equal(f.panel.style.height,'340px');
  await f.documentRef.exitFullscreen();assert.equal(f.resizer.hidden,false);assert.equal(f.panel.style.height,'340px');
  f.controller.hide();f.resizer.dispatch('pointerdown',down);assert.equal(f.resizer.hasPointerCapture(1),false);
});
test('window resizing clamps the panel and restores its preferred height when space returns',async t=>{
  const previous=globalThis.ResizeObserver;let callback,disconnected=false;const observed=[];
  globalThis.ResizeObserver=class {constructor(fn){callback=fn;}observe(target){observed.push(target);}disconnect(){disconnected=true;}};
  t.after(()=>{if(previous===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=previous;});
  const f=await fixture({storage:new Map([['jotta.nativeBuild.height','500']])});f.controller.show();
  assert.deepEqual(observed,[f.panel,f.host]);assert.equal(f.panel.style.height,'500px');
  f.host.clientHeight=400;callback([{target:f.host}]);assert.equal(f.panel.style.height,'320px');
  assert.equal(f.storage.get('jotta.nativeBuild.height'),'500');
  f.host.clientHeight=200;callback([{target:f.host}]);assert.equal(f.panel.style.height,'160px');
  f.host.clientHeight=800;callback([{target:f.host}]);assert.equal(f.panel.style.height,'500px');
  f.controller.dispose();assert.equal(disconnected,true);
});
