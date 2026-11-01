'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');

function validateName(format,name){
  if(!['html','pdf'].includes(format)||typeof name!=='string'||!name||path.basename(name)!==name)
    throw new Error('Invalid Markdown export.');
}

async function validateDestination(filePath,format,protectedPaths){
  if(typeof filePath!=='string'||!path.isAbsolute(filePath)||filePath.includes('\0'))throw new Error('Invalid Markdown export destination.');
  if(path.extname(filePath).toLowerCase()!=='.'+format)throw new Error('Choose a filename with the export extension.');
  // Resolve symlinks as well as names to protect documents already open in the editor.
  const identity=async file=>{try{return await fs.realpath(file);}catch{return path.resolve(file);}};
  const output=await identity(filePath);
  const fold=file=>process.platform==='win32'?file.toLowerCase():file;
  if((await Promise.all(protectedPaths.filter(file=>typeof file==='string').map(identity))).some(file=>fold(file)===fold(output)))
    throw new Error('Choose a different export destination. This file is open in the editor.');
}

async function chooseMarkdownExport({format,name,documentPath,protectedPaths=[]}={}, {dialog,parent,defaultDirectory,isRemote=()=>false}){
  validateName(format,name);
  if(!Array.isArray(protectedPaths))throw new Error('Invalid Markdown export.');
  const directory=typeof documentPath==='string'&&path.isAbsolute(documentPath)&&!isRemote(documentPath)?path.dirname(documentPath):defaultDirectory;
  if(parent&&!parent.isDestroyed()){
    if(parent.isMinimized())parent.restore();
    parent.focus();
  }
  const {canceled,filePath}=await dialog.showSaveDialog(parent,{
    title:format==='html'?'Export Markdown as HTML':'Export Markdown as PDF',defaultPath:directory?path.join(directory,name):name,
    filters:[{name:format==='html'?'HTML document':'PDF document',extensions:[format]}]
  });
  if(canceled||!filePath)return {canceled:true};
  await validateDestination(filePath,format,protectedPaths);
  return {canceled:false,path:filePath};
}

async function exportMarkdown({format,name,html,destination,protectedPaths=[]}={}, dependencies){
  const {BrowserWindow}=dependencies;
  validateName(format,name);
  if(typeof html!=='string'||Buffer.byteLength(html)>40*1024*1024||!Array.isArray(protectedPaths))throw new Error('Invalid Markdown export.');
  let filePath=destination;
  if(filePath===undefined){
    const selected=await chooseMarkdownExport({format,name,protectedPaths},dependencies);
    if(selected.canceled)return selected;
    filePath=selected.path;
  }
  await validateDestination(filePath,format,protectedPaths);
  let data=html;
  if(format==='pdf'){
    const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{
      nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false
    }});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    let timeout;
    try{
      data=await Promise.race([
        (async()=>{
          await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
          return window.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true});
        })(),
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('PDF export timed out. Check image connections and try again.')),30000);})
      ]);
    }finally{clearTimeout(timeout);if(!window.isDestroyed())window.destroy();}
  }
  await fs.writeFile(filePath,data);
  return {canceled:false,path:filePath};
}
module.exports={chooseMarkdownExport,exportMarkdown};
