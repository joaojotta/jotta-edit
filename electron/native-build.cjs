'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawn} = require('node:child_process');
const {StringDecoder} = require('node:string_decoder');

function inside(root, file) {
  const relative = path.relative(root, file);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function localPath(value) {
  if (typeof value !== 'string' || !value || value.length > 8192 || /[\0\r\n]/.test(value) || !path.isAbsolute(value)) throw new Error('Choose a saved local file or project folder.');
  return path.resolve(value);
}
async function exists(file) { try { return (await fs.stat(file)).isFile(); } catch { return false; } }
async function buildDirectory(root, value) {
  if (!value || path.isAbsolute(value)) throw new Error('Build directory must be relative to the project folder.');
  const directory = path.resolve(root, value);
  if (directory === root || !inside(root, directory)) throw new Error('Build directory must be inside the project folder.');
  // Check existing ancestors before creating anything through a symlink.
  let parent = directory;
  while (true) {
    try {
      if (!inside(root, await fs.realpath(parent))) throw new Error('Build directory points outside the project folder.');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      parent = path.dirname(parent);
    }
  }
  await fs.mkdir(directory, {recursive:true});
  if (!inside(root, await fs.realpath(directory))) throw new Error('Build directory points outside the project folder.');
  return directory;
}

async function buildPlan(params, {platform = process.platform, isRemote = () => false} = {}) {
  const {normalizeBuildSettings, splitBuildArguments, sourceLanguage} = await import('../shared/native-build.mjs');
  if (!params || !['build','run','test'].includes(params.action)) throw new Error('Invalid build action.');
  const settings = normalizeBuildSettings(params.settings);
  const source = params.file ? localPath(params.file) : null;
  const requestedRoot = params.root ? localPath(params.root) : source && path.dirname(source);
  if (!requestedRoot || isRemote(requestedRoot) || source && isRemote(source)) throw new Error('Builds require a local project. Copy remote files to a local folder first.');
  const root = await fs.realpath(requestedRoot);
  if (isRemote(root)) throw new Error('Builds require a local project. Copy remote files to a local folder first.');
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Project folder is unavailable.');
  if (source && !inside(root, await fs.realpath(source))) throw new Error('Source file must be inside the project folder.');
  let system = settings.system;
  if (system === 'auto') system = await exists(path.join(root,'CMakeLists.txt')) ? 'cmake'
    : await Promise.all(['GNUmakefile','makefile','Makefile'].map(name => exists(path.join(root,name)))).then(files => files.some(Boolean)) ? 'make' : 'single';
  if (system === 'single' && !sourceLanguage(source || '')) throw new Error('Open a saved .c or .cpp file, or a CMake/Make project.');
  if (params.action === 'run' && system !== 'single' && !settings.executable.trim()) throw new Error('Set the executable path in Build settings before running a CMake or Make project.');
  const steps = [], command = (executable, args, cwd = root, interactive = false) => ({executable,args,cwd,interactive});
  const directory = system === 'make' ? null : await buildDirectory(root, settings.buildDirectory);
  let executable;
  if (system === 'single') {
    const language = sourceLanguage(source);
    const compiler = settings.compiler === 'clang' ? language === 'c' ? 'clang' : 'clang++' : language === 'c' ? 'gcc' : 'g++';
    const hash = createHash('sha256').update(source).digest('hex').slice(0,10);
    executable = path.join(directory,`${path.basename(source,path.extname(source))}-${hash}${platform === 'win32' ? '.exe' : ''}`);
    try { if (!(await fs.lstat(executable)).isFile()) throw new Error('Build output must be a regular file.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    steps.push(command(compiler, ['-g', '-Wall', '-Wextra', `-std=${language === 'c' ? 'c17' : 'c++17'}`, '-fdiagnostics-color=never', source, ...splitBuildArguments(settings.compilerFlags), '-o', executable]));
  } else if (system === 'cmake') {
    const extra = splitBuildArguments(settings.configureArgs);
    // Keep configure/build/test in the same tree even when options are edited.
    if (extra.some(arg => /^(?:-S|-B|-H|--build|--install|--preset|--workflow|--fresh|-P|-E|--$)/.test(arg))) throw new Error('Use CMake configure options such as -D or -G; source and build paths are managed by Jotta Edit.');
    const compilers = settings.compiler === 'clang' ? ['clang','clang++'] : ['gcc','g++'];
    steps.push(command('cmake', ['-S', root, '-B', directory, '-DCMAKE_BUILD_TYPE=Debug', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON', `-DCMAKE_C_COMPILER=${compilers[0]}`, `-DCMAKE_CXX_COMPILER=${compilers[1]}`, ...extra]));
    steps.push(command('cmake', ['--build', directory, '--config', 'Debug', ...(settings.target ? ['--target',settings.target] : [])]));
  } else {
    const compilers = settings.compiler === 'clang' ? ['clang','clang++'] : ['gcc','g++'];
    steps.push(command(platform === 'win32' ? 'mingw32-make' : 'make', [`CC=${compilers[0]}`,`CXX=${compilers[1]}`,...(settings.target ? [settings.target] : [])]));
  }
  if (params.action === 'test' && system === 'cmake') {
    steps.push(command('ctest',['--test-dir', directory, '--build-config', 'Debug', '--output-on-failure', '--no-tests=error']));
  } else if (params.action === 'test' && system === 'make') {
    const compilers = settings.compiler === 'clang' ? ['clang','clang++'] : ['gcc','g++'];
    steps.push(command(platform === 'win32' ? 'mingw32-make' : 'make', [`CC=${compilers[0]}`,`CXX=${compilers[1]}`,settings.testTarget || 'test']));
  } else if (params.action === 'run' || params.action === 'test') {
    if (system !== 'single') {
      if (path.isAbsolute(settings.executable)) throw new Error('Executable path must be relative to the project folder.');
      executable = path.resolve(root,settings.executable);
      if (!inside(root,executable) || executable === root) throw new Error('Executable must be inside the project folder.');
    }
    steps.push({...command(executable, splitBuildArguments(settings.runArgs),root,true),checkExecutable:true});
  }
  return {root, system, steps};
}

function buildSpawnSpec(step, flatpak = process.env.FLATPAK_ID) {
  if (!flatpak) return {executable:step.executable,args:step.args,host:false};
  // All user-controlled values are positional arguments. The fixed shell wrapper
  // reports the host process group so Stop also reaches compiler/test children.
  return {executable:'flatpak-spawn',host:true,args:['--host','--watch-bus',`--directory=${step.cwd}`,
    'setsid','sh','-c','printf "\\036JOTTA_PID:%s\\037\\n" "$$"; exec "$@"','jotta-build',step.executable,...step.args]};
}

async function resolveBuildDiagnostic(root, file, {isRemote = () => false} = {}) {
  root = await fs.realpath(localPath(root));
  if (typeof file !== 'string' || !file || file.length > 8192 || /[\0\r\n]/.test(file) || isRemote(root)) throw new Error('Invalid compiler diagnostic path.');
  const resolved = await fs.realpath(path.resolve(root,file));
  if (!inside(root,resolved) || isRemote(resolved) || !(await fs.stat(resolved)).isFile()) throw new Error('Diagnostic file is outside this project.');
  return resolved;
}

class NativeBuildRunner {
  constructor({onEvent = () => {}, isRemote = () => false, platform = process.platform, flatpak = process.env.FLATPAK_ID, spawnProcess = spawn} = {}) {
    Object.assign(this,{onEvent,isRemote,platform,flatpak,spawnProcess});
    this.current = null; this.sequence = 0; this.pendingKills = new Map();
  }
  start(params) {
    if (this.current) throw new Error('A build or program is already running. Stop it first.');
    const job = {id:++this.sequence,stopped:false,child:null,phase:null,bytes:0,truncated:false};
    this.current = job;
    job.done = this.execute(job,params);
    return {id:job.id};
  }
  emit(job, event) { this.onEvent({id:job.id,...event}); }
  output(job, text, stream = 'stdout', origin = 'editor') {
    const limit = 2 * 1024 * 1024;
    if (job.bytes >= limit) {
      if (!job.truncated) { job.truncated = true; this.emit(job,{type:'output',text:'\n[Output limit reached. Further output is omitted.]\n',stream:'info',origin:'editor'}); }
      return;
    }
    const remaining = limit-job.bytes;
    job.bytes += Buffer.byteLength(text);
    this.emit(job,{type:'output',text:text.slice(0,remaining),stream,origin});
  }
  async execute(job, params) {
    let result = {code:null,signal:null};
    try {
      const plan = await buildPlan(params,this);
      this.emit(job,{type:'start',root:plan.root,system:plan.system,action:params.action});
      for (const step of plan.steps) {
        if (job.stopped) break;
        if (step.checkExecutable) {
          const real = await fs.realpath(step.executable);
          if (!inside(plan.root,real) || !(await fs.stat(real)).isFile()) throw new Error('Executable must be a file inside the project folder.');
        }
        if (job.stopped) break;
        this.output(job,`\n> ${[step.executable,...step.args].map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')}\n`,'info');
        result = await this.runStep(job,step);
        if (job.stopped || result.code !== 0) break;
      }
    } catch (error) {
      result = {code:null,signal:null,error:error.message};
      this.output(job,`\n${error.message}\n`,'stderr');
    } finally {
      this.current = null;
      this.emit(job,{type:'done',...result,stopped:job.stopped});
    }
    return {...result,stopped:job.stopped};
  }
  runStep(job, step) {
    return new Promise((resolve,reject) => {
      const spec = buildSpawnSpec(step,this.flatpak);
      const child = this.spawnProcess(spec.executable,spec.args,{cwd:step.cwd,windowsHide:true,
        detached:this.platform !== 'win32',shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
      job.child = child; job.phase = step.interactive ? 'run' : 'build'; job.host = spec.host; job.hostPid = null;
      this.emit(job,{type:'phase',phase:job.phase});
      const stdout = new StringDecoder('utf8'), stderr = new StringDecoder('utf8');
      const origin = step.interactive ? 'program' : 'build';
      let hostHeader = '', headerRead = !spec.host;
      const out = text => {
        if (!headerRead) {
          hostHeader += text;
          const end = hostHeader.indexOf('\n');
          if (end < 0 && hostHeader.length < 100) return;
          const match = /^\x1eJOTTA_PID:(\d+)\x1f\r?\n/.exec(hostHeader);
          if (match) { job.hostPid = Number(match[1]); hostHeader = hostHeader.slice(match[0].length); if(job.stopped)this.terminate(job,job.forceStop); }
          headerRead = true; text = hostHeader; hostHeader = '';
        }
        if(text)this.output(job,text,'stdout',origin);
      };
      child.stdout.on('data',chunk => out(stdout.write(chunk)));
      child.stderr.on('data',chunk => this.output(job,stderr.write(chunk),'stderr',origin));
      child.stdin.on('error',() => {}); // EPIPE is normal when a program exits before reading input.
      if (!step.interactive) child.stdin.end();
      child.once('error',error => {
        const message = error.code === 'ENOENT' ? `Cannot find ${spec.executable}. Install GCC/G++, CMake/Make or Clang and add the tools to PATH, then restart Jotta Edit.` : error.message;
        reject(new Error(message));
      });
      child.once('close',(code,signal) => {
        out(stdout.end()); if(hostHeader)this.output(job,hostHeader,'stdout',origin);
        const tail = stderr.end(); if(tail)this.output(job,tail,'stderr',origin);
        if (job.child === child) { job.child = null; job.phase = null; }
        resolve({code,signal});
      });
    });
  }
  input(value, eof = false) {
    const job = this.current;
    if (!job || job.stopped || job.phase !== 'run' || !job.child || job.child.stdin.destroyed || job.child.stdin.writableEnded) throw new Error('No program is waiting for input.');
    if (typeof value !== 'string' || Buffer.byteLength(value) > 65536) throw new Error('Program input is too large.');
    if (eof) job.child.stdin.end(value); else job.child.stdin.write(value);
    return true;
  }
  terminate(job, force = false) {
    const child = job.child;
    if (!child) return;
    const pid = job.host ? job.hostPid : child.pid;
    if (job.host && !pid) return; // The host PID header will call terminate.
    const kill = signal => {
      if (job.host) {
        const helper = this.spawnProcess('flatpak-spawn',['--host','kill',`-${signal}`,'--',`-${pid}`],{windowsHide:true,stdio:'ignore',shell:false});
        helper.on('error',() => {});
      } else if (this.platform === 'win32') {
        const helper = this.spawnProcess('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});
        helper.on('error',() => {try{child.kill();}catch{}});
      } else { try { process.kill(-pid,signal); } catch { try { child.kill(signal); } catch {} } }
    };
    kill(force ? 'SIGKILL' : 'SIGTERM');
    if (!force && this.platform !== 'win32') {
      const forceKill = () => kill('SIGKILL');
      const timer = setTimeout(() => {this.pendingKills.delete(forceKill);forceKill();},1000);
      timer.unref?.(); this.pendingKills.set(forceKill,timer);
    }
  }
  stop(force = false) {
    if (force) {
      for (const [kill,timer] of this.pendingKills) {clearTimeout(timer);kill();}
      this.pendingKills.clear();
    }
    if (!this.current) return false;
    if (!this.current.stopped || force) { this.current.stopped = true; this.current.forceStop = force; this.terminate(this.current,force); }
    return true;
  }
}
module.exports = {NativeBuildRunner,buildPlan,buildSpawnSpec,resolveBuildDiagnostic};
