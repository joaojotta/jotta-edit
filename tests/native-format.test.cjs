'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {formatNativeCode} = require('../electron/native-format.cjs');

function fakeFormatter({stdout='int main() { return 0; }\n',stderr='',error=null}={}) {
  const calls=[];
  const runFile=(executable,args,options,callback)=>{
    const call={executable,args,options};calls.push(call);
    return {stdin:{on(){},end(source){call.source=source;queueMicrotask(()=>callback(error,stdout,stderr));}}};
  };
  return {calls,runFile};
}
test('C/C++ formatting dispatches the current buffer and editor options through the native bridge',async()=>{
  const {formatCode,formatLanguages}=await import('../src/formatting.js');
  for(const language of ['c','cpp']) {
    assert.ok(formatLanguages.has(language));
    let received;
    const result=await formatCode('int main(){return 0;}',{language,filename:'my file.cpp',tabWidth:4,useTabs:true,printWidth:'100',
      nativeFormatter:async params=>{received=params;return 'formatted';}});
    assert.equal(result,'formatted');
    assert.deepEqual(received,{source:'int main(){return 0;}',language,filename:'my file.cpp',tabWidth:4,useTabs:true,printWidth:'100'});
  }
  await assert.rejects(formatCode('int x;',{language:'cpp'}),/desktop app and clang-format/);
  await assert.rejects(formatCode('int x;',{language:'c',nativeFormatter:async()=>{throw new Error('tool failed');}}),/tool failed/);
});
test('native formatter reads stdin, uses project styles and applies indentation/width without invoking a shell',async()=>{
  const f=fakeFormatter(),filename=path.resolve('my project','file; $(echo bad).cpp');
  const result=await formatNativeCode({language:'cpp',source:'int main(){return 0;}',filename,tabWidth:4,useTabs:true,printWidth:'100'}, {...f,flatpak:null});
  const call=f.calls[0];assert.equal(result,'int main() { return 0; }\n');
  assert.equal(call.executable,'clang-format');assert.equal(call.source,'int main(){return 0;}');
  assert.ok(call.args.includes(`--assume-filename=${filename}`));
  assert.match(call.args[1],/InheritParentConfig.*IndentWidth: 4.*TabWidth: 4.*UseTab: ForIndentation.*ColumnLimit: 100/);
  assert.equal(call.options.shell,false);assert.equal(call.options.timeout,10000);
  const unlimited=fakeFormatter();await formatNativeCode({language:'c',source:'int x;'}, {...unlimited,flatpak:null});
  assert.match(unlimited.calls[0].args[0],/untitled\.c$/);assert.match(unlimited.calls[0].args[1],/UseTab: Never, ColumnLimit: 0/);
});
test('Flatpak formats through the host tool with unchanged argument boundaries',async()=>{
  const f=fakeFormatter();await formatNativeCode({language:'cpp',source:'int x;',filename:'/project with spaces/main.cpp'}, {...f,flatpak:'pt.jotta.edit'});
  assert.equal(f.calls[0].executable,'flatpak-spawn');
  assert.deepEqual(f.calls[0].args.slice(0,3),['--host','--watch-bus','clang-format']);
  assert.equal(f.calls[0].args[3],'--assume-filename=/project with spaces/main.cpp');
});
test('invalid requests never launch a tool; blank buffers stay blank',async()=>{
  const f=fakeFormatter();
  for(const params of [null,{language:'javascript',source:'x'},{language:'c',source:1},
    {language:'c',source:'x',filename:'bad\0.c'},{language:'c',source:'x',tabWidth:0},
    {language:'c',source:'x',printWidth:'80;bad'},{language:'c',source:'x'.repeat(5*1024*1024+1)}]) {
    await assert.rejects(formatNativeCode(params,f),/Invalid C\/C\+\+/);
  }
  assert.equal(await formatNativeCode({language:'c',source:' \n'},f),' \n');assert.equal(f.calls.length,0);
});
test('missing tools, timeout, invalid configuration and empty output report errors',async()=>{
  for(const [options,expected,flatpak] of [
    [{error:{code:'ENOENT'}},/Install clang-format/,null],
    [{error:{code:1},stderr:'Failed to execute child process: No such file'},/Install clang-format/,'pt.jotta.edit'],
    [{error:{killed:true}},/timed out/,null],
    [{error:{code:1},stderr:'bad .clang-format option'},/bad .clang-format option/,null],
    [{stdout:''},/empty output/,null]
  ])await assert.rejects(formatNativeCode({language:'c',source:'int x;'}, {...fakeFormatter(options),flatpak}),expected);
});
test('installed clang-format formats C/C++, honors project brace style and leaves saved source untouched',{
  skip:spawnSync('clang-format',['--version'],{stdio:'ignore'}).status!==0
},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta format $ spaces '));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'.clang-format'),'BasedOnStyle: LLVM\nBreakBeforeBraces: Allman\n');
  for(const language of ['c','cpp']) {
    const filename=path.join(root,`main.${language}`);await fs.writeFile(filename,'saved file');
    const source='int main(){int x=1;if(x){return x;}return 0;}';
    const result=await formatNativeCode({source,language,filename,tabWidth:4},{flatpak:null});
    assert.match(result,/int main\(\)\n\{/);assert.match(result,/\n {4}int x = 1;/);
    assert.equal(await fs.readFile(filename,'utf8'),'saved file');
  }
});
