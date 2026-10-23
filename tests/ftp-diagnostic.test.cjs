'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {inspectFtp}=require('../scripts/diagnose-ftp.cjs');

test('FTP diagnostic exposes empty MLSD versus populated LIST without disclosing names or modifying files',
 {skip:!process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},async t=>{
  const disk=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-ftp-diagnostic-'));
  t.after(()=>fs.rm(disk,{recursive:true,force:true}));
  await fs.mkdir(path.join(disk,'public_html'));
  await fs.writeFile(path.join(disk,'public_html','private-file-name.html'),'original');
  await fs.writeFile(path.join(disk,'public_html','.htaccess'),'hidden');
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const server=spawn('python3',[path.join(__dirname,'fixtures','remote-servers.py'),'ftp-empty-mlsd',disk,String(port)],
    {env:{...process.env,PYTHONPATH:process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},stdio:['ignore','pipe','pipe']});
  t.after(()=>server.kill());
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('FTP diagnostic server did not start')),10000);
    server.once('exit',()=>{clearTimeout(timer);reject(new Error('FTP diagnostic server exited'));});
    server.stdout.on('data',chunk=>{if(String(chunk).includes('READY')){clearTimeout(timer);resolve();}});
    server.stderr.resume();
  });
  const reports=[];
  await inspectFtp({address:`ftp://127.0.0.1:${port}/public_html`,username:'test',password:'test-password',write:report=>reports.push(report)});
  const report=label=>reports.find(x=>x.probe===label);
  assert.equal(report('CWD then MLSD').entries,0);
  assert.equal(report('CWD then LIST -a').entries,2);
  assert.equal(report('CWD then NLST').entries,2);
  assert.equal(report('application filesystem').entries,0);
  assert.equal(report('Explorer default').visibleEntries,0);
  const printed=JSON.stringify(reports);
  for(const secret of ['test-password','private-file-name.html','.htaccess',disk,'127.0.0.1'])assert.equal(printed.includes(secret),false);
  assert.deepEqual((await fs.readdir(path.join(disk,'public_html'))).sort(),['.htaccess','private-file-name.html']);
  assert.equal(await fs.readFile(path.join(disk,'public_html','private-file-name.html'),'utf8'),'original');
  assert.equal(await fs.readFile(path.join(disk,'public_html','.htaccess'),'utf8'),'hidden');
});
