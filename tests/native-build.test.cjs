'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {NativeBuildRunner,buildPlan,buildSpawnSpec,resolveBuildDiagnostic} = require('../electron/native-build.cjs');
const available = command => spawnSync(command,['--version'],{stdio:'ignore'}).status === 0;
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'jotta c++ spaces $ '));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const events = [];
  const runner = new NativeBuildRunner({flatpak:null,onEvent:event=>events.push(event)});
  t.after(()=>runner.stop());
  const run = async params => {runner.start({root,...params});return runner.current.done;};
  return {root,events,runner,run,text:()=>events.filter(event=>event.type==='output').map(event=>event.text).join('')};
}
test('argument parsing preserves quoted paths, backslashes and literal shell operators',async()=>{
  const {splitBuildArguments,sourceLanguage,compilerDiagnostic,normalizeBuildSettings} = await import('../shared/native-build.mjs');
  assert.deepEqual(splitBuildArguments('-I"include files" "" "C:\\sdk\\include" ; $(echo hi)'),['-Iinclude files','','C:\\sdk\\include',';','$(echo','hi)']);
  assert.throws(()=>splitBuildArguments('"open'),/quote/);
  assert.throws(()=>splitBuildArguments('line\nnext'),/Invalid/);
  assert.throws(()=>normalizeBuildSettings({target:'--eval=bad'}),/target/);
  assert.throws(()=>normalizeBuildSettings({testTarget:'CC=wrong'}),/target/);
  assert.equal(sourceLanguage('hello.C'),'cpp');assert.equal(sourceLanguage('hello.c'),'c');assert.equal(sourceLanguage('hello.h'),null);
  assert.deepEqual(compilerDiagnostic('C:\\my project\\hello.cpp:12:4: error: broken'),{file:'C:\\my project\\hello.cpp',line:12,column:4,severity:'error',message:'broken'});
});
test('build environments provide a TERM fallback and forward it to Flatpak host tools',()=>{
  const step={executable:'gcc',args:['main.c'],cwd:os.tmpdir()};
  for(const flatpak of [null,'pt.jotta.edit']) {
    for(const term of [undefined,'','vt100']) {
      const environment={PATH:'/toolchain',NO_COLOR:'0'};
      if(term!==undefined)environment.TERM=term;
      const original={...environment};
      const spec=buildSpawnSpec(step,flatpak,environment);
      assert.deepEqual(spec.env,{...environment,TERM:term||'xterm',NO_COLOR:'1'});
      assert.deepEqual(environment,original);
      if(flatpak) {
        assert.ok(spec.args.includes(`--env=TERM=${term||'xterm'}`));
        assert.ok(spec.args.includes('--env=NO_COLOR=1'));
      }
    }
  }
});
test('Make recipes and C/C++ programs can call clear when the app has no TERM',{
  skip:process.platform==='win32'||!available('gcc')||!available('g++')||!available('make')||spawnSync('clear',['-V'],{stdio:'ignore'}).status!==0,
  timeout:20000
},async t=>{
  const f=await fixture(t);
  const source='#include <stdio.h>\n#include <stdlib.h>\nint main(void){if(system("clear")!=0)return 1;puts("clear success");return 0;}';
  await fs.writeFile(path.join(f.root,'main.c'),source);
  await fs.writeFile(path.join(f.root,'main.cpp'),source);
  await fs.writeFile(path.join(f.root,'Makefile'),'all:\n\tclear\n\t$(CC) main.c -o hello-c\n\t$(CXX) main.cpp -o hello-cpp\n');
  f.runner.environment={...process.env};delete f.runner.environment.TERM;
  for(const executable of ['hello-c','hello-cpp']) {
    assert.equal((await f.run({action:'run',settings:{system:'make',executable}})).code,0,f.text());
  }
  assert.doesNotMatch(f.text(),/TERM environment variable not set/);
  assert.equal((f.text().match(/clear success/g)||[]).length,2);
});
test('real GCC and G++ compile and run programs in folders containing spaces and shell characters',{skip:!available('gcc')||!available('g++'),timeout:20000},async t=>{
  const f = await fixture(t);
  for (const [name,code,expected] of [['hello.c','#include <stdio.h>\nint main(void){puts("C success");return 0;}','C success'],
    ['hello.cpp','#include <iostream>\nint main(){std::cout<<"C++ success"<<std::endl;}','C++ success']]) {
    const file = path.join(f.root,name);await fs.writeFile(file,code);
    const result = await f.run({action:'run',file});assert.equal(result.code,0,f.text());assert.ok(f.text().includes(expected));
  }
  assert.match(f.events.filter(event=>event.origin==='program').map(event=>event.text).join(''),/C\+\+ success/);
  assert.ok(f.events.filter(event=>event.stream==='info').every(event=>event.origin==='editor'));
});
test('a failed rebuild never runs a previously compiled executable',{skip:!available('gcc'),timeout:20000},async t=>{
  const f = await fixture(t), file = path.join(f.root,'hello.c');
  await fs.writeFile(file,'#include <stdio.h>\nint main(void){puts("STALE_PROGRAM");return 0;}');
  assert.equal((await f.run({action:'build',file})).code,0,f.text());
  await fs.writeFile(file,'int main(void) { this is a compiler error; }');f.events.length=0;
  const result = await f.run({action:'run',file});assert.notEqual(result.code,0);assert.match(f.text(),/error:/);assert.doesNotMatch(f.text(),/STALE_PROGRAM/);
  assert.ok(f.events.some(event=>event.origin==='build'&&event.stream==='stderr'&&event.text.includes('error:')));
  assert.equal(f.events.some(event=>event.phase==='run'),false);
});
test('single-file linker flags follow source inputs and program arguments keep their boundaries',{skip:!available('gcc'),timeout:15000},async t=>{
  const f=await fixture(t),file=path.join(f.root,'math.c');
  await fs.writeFile(file,'#include <math.h>\n#include <stdlib.h>\n#include <stdio.h>\nint main(int argc,char **argv){if(argc!=3)return 1;printf("%.0f:%s",sqrt(atof(argv[1])),argv[2]);return 0;}');
  const result=await f.run({action:'run',file,settings:{compilerFlags:'-lm',runArgs:'9 "literal ; $(text)"'}});
  assert.equal(result.code,0,f.text());assert.match(f.text(),/3:literal ; \$\(text\)/);
});
test('program stdin supports lines and EOF; concurrent tasks are rejected',{skip:!available('gcc'),timeout:20000},async t=>{
  const f = await fixture(t), file = path.join(f.root,'input.c');
  await fs.writeFile(file,'#include <stdio.h>\nint main(void){char b[100];while(fgets(b,sizeof b,stdin))printf("read:%s",b);return 0;}');
  f.runner.onEvent=event=>{f.events.push(event);if(event.type==='phase'&&event.phase==='run'){f.runner.input('hello input\n');f.runner.input('',true);}};
  f.runner.start({root:f.root,file,action:'run'});
  assert.throws(()=>f.runner.start({root:f.root,action:'build'}),/already running/);
  const result=await f.runner.current.done;assert.equal(result.code,0,f.text());assert.match(f.text(),/read:hello input/);
  assert.throws(()=>f.runner.input('late'),/No program/);
});
test('Linux C and C++ prompts arrive before input without source-level flushing',{
  skip:process.platform!=='linux'||!available('gcc')||!available('g++')||!available('stdbuf'),timeout:20000
},async t=>{
  const f=await fixture(t);
  for(const extension of ['c','cpp']) {
    const file=path.join(f.root,`grades.${extension}`);
    const source='#include <stdio.h>\nint main(void){float nota;printf("BEM-VINDO!\\n");do{printf("Indique uma nota de 0 a 20: ");if(scanf("%f",&nota)!=1)return 1;}while(nota<0||nota>20);printf("Nota: %.1f\\n",nota);return 0;}';
    await fs.writeFile(file,source);
    let output='',submitted=0;
    f.runner.onEvent=event=>{
      f.events.push(event);
      if(event.type!=='output'||event.origin!=='program')return;
      output+=event.text;
      const prompts=(output.match(/Indique uma nota de 0 a 20: /g)||[]).length;
      if(prompts>submitted&&submitted<2) {
        assert.match(output,/BEM-VINDO!/);
        assert.equal(f.runner.current.phase,'run');
        submitted++;
        f.runner.input(submitted===1?'-1\n':'12\n');
      }
    };
    const result=await f.run({action:'run',file});
    assert.equal(result.code,0,f.text());assert.equal(submitted,2);assert.match(output,/Nota: 12\.0/);
    assert.equal(await fs.readFile(file,'utf8'),source);
  }
});
test('unbuffered launch preserves arguments and exit status and falls back without stdbuf',{
  skip:process.platform!=='linux',timeout:10000
},()=>{
  for(const missing of [false,true]) {
    const environment={...process.env,...(missing?{PATH:''}:{})};
    const value='literal ; $(touch should-not-exist) "quoted"';
    const step={executable:process.execPath,args:['-e','process.stdout.write(process.argv[1]);process.exitCode=7;',value],interactive:true};
    const spec=buildSpawnSpec(step,null,environment,'linux');
    const result=spawnSync(spec.executable,spec.args,{env:spec.env,encoding:'utf8'});
    assert.equal(result.status,7,result.stderr);assert.equal(result.stdout,value);
    if(missing)assert.match(result.stderr,/install coreutils \(stdbuf\)/);
  }
});
test('buffering wrapper is limited to Linux program runs and placed inside the Flatpak host bridge',()=>{
  const step={executable:'/project with spaces/program',args:['; $(literal)'],cwd:os.tmpdir(),interactive:true};
  for(const platform of ['win32','darwin']) {
    const spec=buildSpawnSpec(step,null,{},platform);
    assert.equal(spec.executable,step.executable);assert.deepEqual(spec.args,step.args);
  }
  const build=buildSpawnSpec({...step,interactive:false},null,{},'linux');
  assert.equal(build.executable,step.executable);assert.deepEqual(build.args,step.args);
  const local=buildSpawnSpec(step,null,{},'linux');
  const host=buildSpawnSpec(step,'pt.jotta.edit',{},'linux');
  assert.equal(host.executable,'flatpak-spawn');
  assert.deepEqual(host.args.slice(host.args.indexOf('jotta-build')+1),[local.executable,...local.args]);
});
test('CMake projects build and test with CTest, including failing tests',{skip:!available('cmake')||!available('ctest')||!available('gcc')||!available('make'),timeout:30000},async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.root,'main.c'),'int main(void){return 0;}');
  await fs.writeFile(path.join(f.root,'CMakeLists.txt'),'cmake_minimum_required(VERSION 3.16)\nproject(JottaTest C)\nenable_testing()\nadd_executable(hello main.c)\nadd_test(NAME hello COMMAND hello)\n');
  assert.equal((await f.run({action:'test'})).code,0,f.text());assert.match(f.text(),/100% tests passed/);
  assert.equal(f.events.find(event=>event.type==='start').system,'cmake');
  await fs.writeFile(path.join(f.root,'main.c'),'int main(void){return 7;}');f.events.length=0;
  assert.notEqual((await f.run({action:'test'})).code,0);assert.match(f.text(),/tests failed|FAILED/);
});
test('Make projects build, run a configured executable and use a custom test target',{skip:!available('make')||!available('gcc'),timeout:20000},async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.root,'main.c'),'#include <stdio.h>\nint main(void){puts("make works");return 0;}');
  await fs.writeFile(path.join(f.root,'Makefile'),'all: hello\nhello: main.c\n\t$(CC) main.c -o hello\ncheck: all\n\t./hello\n');
  assert.equal((await f.run({action:'test',settings:{testTarget:'check'}})).code,0,f.text());assert.match(f.text(),/make works/);
  assert.equal((await f.run({action:'run',settings:{executable:'hello'}})).code,0,f.text());
});
test('Stop terminates a running process and permits another build',{skip:process.platform==='win32'||!available('gcc'),timeout:15000},async t=>{
  const f=await fixture(t),file=path.join(f.root,'loop.c');
  await fs.writeFile(file,'#include <unistd.h>\nint main(void){for(;;)sleep(1);return 0;}');
  let stoppedPid;
  f.runner.onEvent=event=>{f.events.push(event);if(event.type==='phase'&&event.phase==='run'){stoppedPid=f.runner.current.child.pid;f.runner.stop();}};
  const result=await f.run({action:'run',file});assert.equal(result.stopped,true);assert.equal(f.runner.current,null);
  assert.throws(()=>process.kill(stoppedPid,0));
  assert.equal((await f.run({action:'build',file})).code,0,f.text());
});
test('Stop during planning prevents all command execution',async t=>{
  const f=await fixture(t);let spawned=false;f.runner.spawnProcess=()=>{spawned=true;throw new Error('must not spawn');};
  f.runner.start({root:f.root,action:'build'});const done=f.runner.current.done;f.runner.stop();
  assert.equal((await done).stopped,true);assert.equal(spawned,false);
});
test('missing tools produce an actionable error and bounded output does not flood IPC',async t=>{
  const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
  const f=await fixture(t),file=path.join(f.root,'hello.c');await fs.writeFile(file,'int main(void){return 0;}');
  f.runner.spawnProcess=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();queueMicrotask(()=>{child.emit('error',Object.assign(new Error('missing'),{code:'ENOENT'}));child.emit('close',-2,null);});return child;};
  assert.match((await f.run({action:'build',file})).error,/Install GCC/);
  const job={id:100,bytes:0,truncated:false};f.events.length=0;
  for(let i=0;i<100;i++)f.runner.output(job,'x'.repeat(65536));
  assert.ok(f.text().length<2*1024*1024+100);assert.equal(f.events.filter(event=>event.text.includes('Output limit')).length,1);
});
test('project and diagnostic paths reject remote roots, escapes and symlinked build directories',async t=>{
  const f=await fixture(t),file=path.join(f.root,'hello.c');await fs.writeFile(file,'int main(void){return 0;}');
  for(const buildDirectory of ['../escape',f.root,'.'])await assert.rejects(buildPlan({root:f.root,file,action:'build',settings:{buildDirectory}}),/directory/i);
  await assert.rejects(buildPlan({root:f.root,file,action:'build'},{isRemote:()=>true}),/local project/);
  await assert.rejects(buildPlan({root:f.root,action:'run',settings:{system:'make'}}),/executable path/);
  await assert.rejects(buildPlan({root:f.root,file,action:'build',settings:{system:'cmake',configureArgs:'-B elsewhere'}}),/configure options/);
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  await fs.symlink(outside,path.join(f.root,'linked'),'dir');
  await assert.rejects(buildPlan({root:f.root,file,action:'build',settings:{buildDirectory:'linked/new'}}),/outside/);
  await assert.rejects(fs.stat(path.join(outside,'new')),/ENOENT/);
  await fs.writeFile(path.join(outside,'out.c'),'');await fs.symlink(path.join(outside,'out.c'),path.join(f.root,'link.c'));
  assert.equal(await resolveBuildDiagnostic(f.root,'hello.c'),file);
  await assert.rejects(resolveBuildDiagnostic(f.root,'link.c'),/outside/);
  await assert.rejects(resolveBuildDiagnostic(f.root,path.join(outside,'out.c')),/outside/);
});
test('Windows uses G++ .exe outputs and MinGW Make; Flatpak uses a quoted host process group',async t=>{
  const f=await fixture(t),file=path.join(f.root,'hello.cpp');await fs.writeFile(file,'int main(){return 0;}');
  const plan=await buildPlan({root:f.root,file,action:'run'},{platform:'win32'});
  assert.equal(plan.steps[0].executable,'g++');assert.ok(plan.steps[1].executable.endsWith('.exe'));
  const make=await buildPlan({root:f.root,action:'build',settings:{system:'make'}},{platform:'win32'});
  assert.equal(make.steps[0].executable,'mingw32-make');
  const spec=buildSpawnSpec({executable:'g++',args:['file;$(bad).cpp','-o','out file'],cwd:f.root},'pt.jotta.edit');
  assert.equal(spec.executable,'flatpak-spawn');assert.ok(spec.args.includes('--watch-bus'));
  assert.ok(spec.args.includes('setsid'));assert.ok(spec.args.includes('--wait'));assert.equal(spec.args.at(-3),'file;$(bad).cpp');
  assert.match(spec.args.find(arg=>arg.includes('JOTTA_PID')),/exec "\$@"/);
});
test('Flatpak host tools compile, run and stop through the real host bridge',{skip:!(process.env.FLATPAK_ID||process.env.JOTTA_TEST_FLATPAK)||spawnSync('flatpak-spawn',['--help'],{stdio:'ignore'}).status!==0,timeout:20000},async t=>{
  // Flatpak's private /tmp is not shared with host tools. Use a temporary
  // directory beside the checkout, which is visible on both sides.
  const root=await fs.mkdtemp(path.join(__dirname,'..','.native-build-test '));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'main.c'),events=[];
  const environment={...process.env};delete environment.TERM;
  let output='',submitted=false;
  const runner=new NativeBuildRunner({flatpak:'pt.jotta.edit',environment,onEvent:event=>{
    events.push(event);
    if(event.type==='output'&&event.origin==='program') {
      output+=event.text;
      if(!submitted&&output.includes('host prompt: ')){submitted=true;runner.input('12\n');}
    }
  }});t.after(()=>runner.stop(true));
  await fs.writeFile(file,'#include <stdio.h>\n#include <stdlib.h>\nint main(void){if(system("clear")!=0)return 1;int value;printf("host prompt: ");if(scanf("%d",&value)!=1||value!=12)return 1;puts("host success");return 0;}');
  runner.start({root,file,action:'run'});assert.equal((await runner.current.done).code,0,events.map(event=>event.text||'').join(''));
  assert.equal(submitted,true);
  assert.match(events.filter(event=>event.origin==='program').map(event=>event.text).join(''),/host success/,JSON.stringify(events));
  assert.ok(events.every(event=>!event.text?.includes('JOTTA_PID')));
  await fs.writeFile(file,'int main(void){return 7;}');
  runner.start({root,file,action:'run'});assert.equal((await runner.current.done).code,7);
  await fs.writeFile(file,'#include <unistd.h>\nint main(void){for(;;)sleep(1);return 0;}');
  runner.onEvent=event=>{if(event.type==='phase'&&event.phase==='run')runner.stop();};
  runner.start({root,file,action:'run'});assert.equal((await runner.current.done).stopped,true);
});
