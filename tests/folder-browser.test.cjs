'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {FolderBrowser}=require('../electron/folder-browser.cjs');
test('in-app browsing lists only folders, filters hidden entries and accepts typed paths',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-picker-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 for(const folder of ['folder10','folder2','.hidden'])await fs.mkdir(path.join(home,folder));await fs.writeFile(path.join(home,'file.txt'),'file');
 const browser=new FolderBrowser(home);const listing=await browser.list();assert.deepEqual(listing.folders.map(x=>x.name),['folder2','folder10']);assert.equal(listing.home,home);
 assert.equal((await browser.list('~',{showHidden:true})).folders.length,3);assert.equal(await browser.select('~/folder2'),path.join(home,'folder2'));
 await assert.rejects(browser.select(path.join(home,'file.txt')),/Not a folder/);await assert.rejects(browser.list('relative'),/absolute/);await assert.rejects(browser.list('/tmp/\0'),/absolute/);
});
test('a stalled filesystem never blocks cancelling or browsing another folder',async()=>{
 const browser=new FolderBrowser('/home/test',{timeout:25,io:{readdir:target=>target==='/stalled'?new Promise(()=>{}):Promise.resolve([])}});
 const stalled=browser.list('/stalled');assert.deepEqual((await browser.list()).folders,[]);await assert.rejects(stalled,/timed out/);
});
function dom(ids){const elements={};for(const id of ids)elements[id]={value:'',textContent:'',disabled:false,hidden:false,checked:false,children:[],setAttribute(){},focus(){},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},querySelectorAll(){return [];},addEventListener(event,handler){this[event]=handler;}};return {elements,documentRef:{getElementById:id=>elements[id],createElement:()=>({setAttribute(){},append(){}})}};}
test('folder picker discards late navigation and cancellation, and validates an edited destination',async()=>{
 const {elements,documentRef}=dom(['folder-picker-status','folder-picker-open','folder-picker-list','folder-picker-up','folder-picker-location','folder-picker-hidden','folder-picker-form','folder-picker-home','folder-picker-cancel','folder-picker-close','folder-picker-overlay']);
 const {installFolderPicker}=await import('../src/folder-picker.js');let finish,selected=[];
 const picker=installFolderPicker({api:{browseFolders:()=>new Promise(resolve=>{finish=resolve;}),selectFolder:async value=>{selected.push(value);return value;}},show(){picker.hide();},close(){picker.hide();},documentRef});
 const cancelled=picker.choose();picker.hide();finish({path:'/late',parent:'/',folders:[]});assert.equal(await cancelled,null);await new Promise(resolve=>setImmediate(resolve));assert.equal(elements['folder-picker-location'].value,'');
 const opened=picker.choose();finish({path:'/home/test',parent:'/home',folders:[]});await new Promise(resolve=>setImmediate(resolve));elements['folder-picker-location'].value='/typed';await elements['folder-picker-open'].onclick();assert.equal(await opened,'/typed');assert.deepEqual(selected,['/typed']);
});
test('remote dialog clears passwords, handles in-app trust and discards cancelled results',async t=>{
 const {elements,documentRef}=dom(['remote-form','remote-connect','remote-location','remote-username','remote-password','remote-status','remote-close','remote-cancel','remote-trust','remote-host-key','remote-save-favourite','remote-save-credentials','remote-saved-credentials','remote-storage-help']);const previous=global.document;global.document=documentRef;t.after(()=>{global.document=previous;});
 const {installRemoteFolders}=await import('../src/remote-folders.js');let finish,challenge,answers=[],opened=[],cancelled=0;
 const panel=installRemoteFolders({api:{connectRemoteFolder:()=>new Promise(resolve=>{finish=resolve;}),cancelRemoteConnection:async()=>{cancelled++;},onRemoteHostKey:fn=>{challenge=fn;},answerRemoteHostKey:async(...answer)=>answers.push(answer)},show(){},close(){panel.hide();},open:async root=>{opened.push(root);return true;}});
 elements['remote-password'].value='secret';const pending=elements['remote-form'].submit({preventDefault(){}});assert.equal(elements['remote-password'].value,'');assert.equal(elements['remote-username'].disabled,true);
 challenge({id:1,server:'host:22',fingerprint:'SHA256:abc'});assert.equal(elements['remote-trust'].hidden,false);assert.match(elements['remote-host-key'].textContent,/SHA256:abc/);elements['remote-trust'].onclick();assert.deepEqual(answers,[[1,true]]);
 panel.hide();finish({root:'/late'});await pending;assert.deepEqual(opened,[]);assert.equal(cancelled,1);assert.equal(elements['remote-trust'].hidden,true);
 const second=elements['remote-form'].submit({preventDefault(){}});finish({root:'/direct'});await second;assert.deepEqual(opened,['/direct']);assert.equal(elements['remote-password'].value,'');
});
test('remote favourites use saved credentials without exposing passwords, and editing the server drops credential reuse',async()=>{
 const ids=['remote-form','remote-connect','remote-location','remote-username','remote-password','remote-status','remote-close','remote-cancel','remote-trust','remote-host-key','remote-save-favourite','remote-save-credentials','remote-saved-credentials','remote-storage-help'];
 const {elements,documentRef}=dom(ids),{installRemoteFolders}=await import('../src/remote-folders.js');
 const calls=[],entry={id:'saved',location:'sftp://alice@host/path',hasCredentials:true};let closed=0;
 const panel=installRemoteFolders({documentRef,api:{listFavourites:async()=>({credentialsAvailable:true}),connectRemoteFolder:async(...args)=>{calls.push(args);return {root:'/remote'};}},show(){panel.hide();},close(){closed++;panel.hide();},open:async()=>true});
 await panel.open(entry);assert.equal(elements['remote-password'].value,'');assert.equal(elements['remote-username'].value,'alice');assert.equal(elements['remote-save-favourite'].checked,true);assert.equal(elements['remote-save-credentials'].checked,false);assert.equal(elements['remote-save-credentials'].disabled,false);
 await elements['remote-form'].submit({preventDefault(){}});assert.equal(calls[0][2].favouriteId,'saved');assert.equal(calls[0][1].password,'');assert.equal(closed,1);
 await panel.open(entry);elements['remote-location'].value='sftp://other/path';elements['remote-location'].input();elements['remote-password'].value='new-password';elements['remote-save-credentials'].checked=true;
 await elements['remote-form'].submit({preventDefault(){}});assert.equal(calls[1][2].favouriteId,undefined);assert.equal(calls[1][2].saveCredentials,true);assert.equal(calls[1][1].password,'new-password');assert.equal(elements['remote-password'].value,'');
});
test('credential-store persistence warnings do not prevent opening a connected remote folder',async()=>{
 const {elements,documentRef}=dom(['remote-form','remote-connect','remote-location','remote-username','remote-password','remote-status','remote-close','remote-cancel','remote-trust','remote-host-key','remote-save-favourite','remote-save-credentials','remote-saved-credentials','remote-storage-help']);
 const {installRemoteFolders}=await import('../src/remote-folders.js');let opened=false,warning;
 installRemoteFolders({documentRef,api:{connectRemoteFolder:async()=>({root:'/remote',warning:'Could not save credentials.'})},show(){},close(){},open:async()=>{opened=true;return true;},report:message=>{warning=message;}});
 await elements['remote-form'].submit({preventDefault(){}});assert.equal(opened,true);assert.equal(warning,'Could not save credentials.');
});
