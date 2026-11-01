import {readOnlyDocument} from '../shared/font-files.mjs';

const languages=['python','php','go','rust','c','cpp','ruby','lua'];
const markerOwner='jotta-language-server';
const validPosition=p=>p&&Number.isSafeInteger(p.line)&&p.line>=0&&Number.isSafeInteger(p.character)&&p.character>=0;
export function diagnosticMarkers(diagnostics,monaco){
  return diagnostics.filter(item=>typeof item.message==='string'&&validPosition(item.range?.start)&&validPosition(item.range?.end)).map(item=>({
    message:item.message.slice(0,16000),severity:({1:monaco.MarkerSeverity.Error,2:monaco.MarkerSeverity.Warning,3:monaco.MarkerSeverity.Info,4:monaco.MarkerSeverity.Hint})[item.severity]||monaco.MarkerSeverity.Error,
    startLineNumber:item.range.start.line+1,startColumn:item.range.start.character+1,
    endLineNumber:item.range.end.line+1,endColumn:item.range.end.character+1,
    source:typeof item.source==='string'?item.source:undefined,code:item.code==null?undefined:String(item.code)
  }));
}

// Validate the whole edit set before handing it to Monaco's version-checked
// bulk editor. Offsets are UTF-16, matching both Monaco and the LSP default.
export function textAfterEdits(source,edits){
  const lines=source.split('\n'),starts=[0];
  for(let i=0;i<lines.length-1;i++)starts.push(starts.at(-1)+lines[i].length+1);
  const offset=p=>{
    if(!validPosition(p)||p.line>=lines.length||p.character>lines[p.line].replace(/\r$/,'').length)throw new Error('Invalid rename range.');
    return starts[p.line]+p.character;
  };
  const replacements=edits.map((edit,index)=>{
    if(typeof edit.newText!=='string')throw new Error('Invalid rename edit.');
    const start=offset(edit.range?.start),end=offset(edit.range?.end);
    if(end<start)throw new Error('Invalid rename range.');
    return {start,end,text:edit.newText,index};
  }).sort((a,b)=>a.start-b.start||a.end-b.end||a.index-b.index);
  for(let i=1;i<replacements.length;i++)if(replacements[i].start<replacements[i-1].end)throw new Error('Overlapping rename edits.');
  let text=source;
  for(const edit of replacements.reverse())text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
  if(new TextEncoder().encode(text).length>5*1024*1024)throw new Error('Rename exceeds the 5 MB editor limit.');
  return text;
}

export function installLanguageTools({monaco,api,getDocuments,getRoot,loadDocument,openFile,notify=()=>{}}){
  const tracked=new Map(),subscriptions=[];
  const valid=(doc,model,path)=>getDocuments().includes(doc)&&doc.model===model&&doc.path===path&&!model.isDisposed();
  const params=(doc,position)=>({file:doc.path,root:getRoot(doc),lang:doc.model.getLanguageId(),content:doc.model.getValue(),version:doc.model.getVersionId(),
    ...(position?{line:position.lineNumber,column:position.column}:{})});
  function untrack(doc){
    const old=tracked.get(doc);if(!old)return;
    clearTimeout(old.timer);old.listeners.forEach(listener=>listener.dispose());tracked.delete(doc);
    if(!old.model.isDisposed())monaco.editor.setModelMarkers(old.model,markerOwner,[]);
    if(old.path)void api.closeLanguage?.(old.path).catch(()=>{});
  }
  function track(doc){
    untrack(doc);
    if(!api.syncLanguage)return;
    const model=doc.model,path=doc.path,entry={model,path,listeners:[],timer:null};tracked.set(doc,entry);
    const schedule=()=>{
      clearTimeout(entry.timer);monaco.editor.setModelMarkers(model,markerOwner,[]);
      entry.timer=setTimeout(()=>{
        if(!valid(doc,model,path)||!path||readOnlyDocument(doc)||!languages.includes(model.getLanguageId()))return;
        void api.syncLanguage(params(doc)).catch(()=>{});
      },350);
    };
    entry.listeners.push(model.onDidChangeContent(schedule),model.onDidChangeLanguage(()=>{
      if(path)void api.closeLanguage?.(path).catch(()=>{});schedule();
    }));schedule();
  }
  if(api.onLanguageDiagnostics)subscriptions.push({dispose:api.onLanguageDiagnostics(event=>{
    const doc=getDocuments().find(doc=>doc.path===event.file);
    if(!doc||doc.model.isDisposed()||event.lang!==doc.model.getLanguageId()||event.version!==doc.model.getVersionId()||Object.hasOwn(event,'root')&&event.root!==getRoot(doc))return;
    monaco.editor.setModelMarkers(doc.model,markerOwner,diagnosticMarkers(event.diagnostics||[],monaco));
  })});
  if(api.languageDefinition)for(const language of languages){
    subscriptions.push(monaco.languages.registerDefinitionProvider(language,{async provideDefinition(model,position,token){
      const doc=getDocuments().find(doc=>doc.model===model);if(!doc?.path)return [];
      const request=params(doc,position);
      try{
        const locations=await api.languageDefinition(request);
        if(token.isCancellationRequested||!valid(doc,model,request.file)||model.getVersionId()!==request.version)return [];
        return locations.filter(item=>validPosition(item.range?.start)&&validPosition(item.range?.end)).map(item=>({uri:monaco.Uri.file(item.file),range:new monaco.Range(item.range.start.line+1,item.range.start.character+1,item.range.end.line+1,item.range.end.character+1)}));
      }catch(error){notify(error.message);return [];}
    }}));
    subscriptions.push(monaco.languages.registerRenameProvider(language,{async provideRenameEdits(model,position,newName,token){
      const doc=getDocuments().find(doc=>doc.model===model);if(!doc?.path)return {edits:[],rejectReason:'Save the file before renaming symbols.'};
      const request=params(doc,position),before=new Map(getDocuments().map(doc=>[doc.path,{doc,model:doc.model,version:doc.model.getVersionId()}]));
      try{
        // Rename can touch other open buffers whose debounce has not fired yet.
        for(const candidate of getDocuments())if(candidate.path&&!readOnlyDocument(candidate)&&(candidate.model.getLanguageId()===request.lang||['c','cpp'].includes(request.lang)&&['c','cpp'].includes(candidate.model.getLanguageId()))&&getRoot(candidate)===request.root){
          await api.syncLanguage?.(params(candidate));
        }
        const groups=await api.languageRename({...request,newName});
        if(token.isCancellationRequested)return {edits:[]};
        if(!valid(doc,model,request.file)||getRoot(doc)!==request.root||model.getVersionId()!==request.version)throw new Error('Files changed. Run Rename Symbol again.');
        const byFile=new Map();
        for(const group of groups){
          if(!byFile.has(group.file))byFile.set(group.file,{...group,edits:[]});
          byFile.get(group.file).edits.push(...group.edits);
        }
        if(getDocuments().length+[...byFile.keys()].filter(file=>!before.has(file)).length>50)throw new Error('Rename would exceed the 50-tab limit.');
        const prepared=[];
        for(const [file,group]of byFile){
          const original=before.get(file),target=original?.doc||await loadDocument(file);
          if(readOnlyDocument(target))throw new Error('Rename cannot edit images or fonts.');
          if(original&&(!valid(target,original.model,file)||target.model.getVersionId()!==original.version)||group.version!=null&&target.model.getVersionId()!==group.version)throw new Error('Files changed. Run Rename Symbol again.');
          const version=target.model.getVersionId(),after=textAfterEdits(target.model.getValue(),group.edits);
          prepared.push({target,model:target.model,file,version,after,edits:group.edits});
        }
        if(token.isCancellationRequested)return {edits:[]};
        if(!valid(doc,model,request.file)||getRoot(doc)!==request.root||model.getVersionId()!==request.version)throw new Error('Files changed. Run Rename Symbol again.');
        for(const item of prepared)if(!valid(item.target,item.model,item.file)||item.model.getVersionId()!==item.version)throw new Error('Files changed. Run Rename Symbol again.');
        const changed=new Map(prepared.map(item=>[item.target,item.after]));
        const bytes=getDocuments().reduce((size,doc)=>size+new TextEncoder().encode(changed.get(doc)??(doc.dirty||!doc.path?doc.model.getValue():'')).length+new TextEncoder().encode(changed.has(doc)||doc.dirty?doc.savedText:'').length,0);
        if(bytes>39*1024*1024)throw new Error('Rename is too large for session recovery.');
        return {edits:prepared.flatMap(item=>item.edits.map(edit=>({resource:item.model.uri,versionId:item.version,textEdit:{range:new monaco.Range(edit.range.start.line+1,edit.range.start.character+1,edit.range.end.line+1,edit.range.end.character+1),text:edit.newText}})))};
      }catch(error){return {edits:[],rejectReason:error.message};}
    }}));
  }
  if(monaco.editor.registerEditorOpener)subscriptions.push(monaco.editor.registerEditorOpener({async openCodeEditor(_source,resource,selection){
    if(resource.scheme!=='file')return false;
    return openFile(resource.fsPath,{line:selection?.startLineNumber||selection?.lineNumber||1,column:selection?.startColumn||selection?.column||1});
  }}));
  return {track,untrack,restart(){for(const doc of getDocuments())track(doc);},dispose(){for(const doc of [...tracked.keys()])untrack(doc);subscriptions.forEach(item=>item.dispose());}};
}
