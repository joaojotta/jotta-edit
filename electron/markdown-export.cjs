'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');

async function exportMarkdown({format,name,html,protectedPaths=[]}={}, {dialog,BrowserWindow,parent}){
  if(!['html','pdf'].includes(format)||typeof name!=='string'||path.basename(name)!==name||
    typeof html!=='string'||Buffer.byteLength(html)>40*1024*1024||!Array.isArray(protectedPaths))throw new Error('Invalid Markdown export.');
  const {canceled,filePath}=await dialog.showSaveDialog(parent,{
    title:format==='html'?'Export Markdown as HTML':'Export Markdown as PDF',defaultPath:name,
    filters:[{name:format==='html'?'HTML document':'PDF document',extensions:[format]}]
  });
  if(canceled||!filePath)return {canceled:true};
  if(path.extname(filePath).toLowerCase()!=='.'+format)throw new Error('Choose a filename with the export extension.');
  // Resolve symlinks as well as names to protect documents already open in the editor.
  const identity=async file=>{try{return await fs.realpath(file);}catch{return path.resolve(file);}};
  const output=await identity(filePath);
  const fold=file=>process.platform==='win32'?file.toLowerCase():file;
  if((await Promise.all(protectedPaths.filter(file=>typeof file==='string').map(identity))).some(file=>fold(file)===fold(output)))
    throw new Error('Choose a different export destination. This file is open in the editor.');
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
module.exports={exportMarkdown};
