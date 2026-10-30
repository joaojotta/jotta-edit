import { documentOutline } from './document-outline.js';

export function fuzzyScore(text, query) {
  if (!query) return 0;
  text = text.toLocaleLowerCase(); query = query.toLocaleLowerCase();
  const direct = text.indexOf(query);
  if (direct !== -1) return 2000 - direct * 3 - text.length * 0.1;
  let score = 0, at = 0, prev = -2;
  for (const char of query) {
    const i = text.indexOf(char, at);
    if (i === -1) return -Infinity;
    score += i === prev + 1 ? 18 : 5;
    if (i === 0 || '/._-'.includes(text[i - 1])) score += 25;
    at = i + 1; prev = i;
  }
  return score - text.length * .12;
}
export function parseAnythingQuery(value) {
  const query=String(value).trim();
  if(query.startsWith('@'))return {mode:'symbols',query:query.slice(1).trim()};
  if(query.startsWith(':')){
    const match=/^:([1-9]\d*)(?::([1-9]\d*))?$/.exec(query);
    return match&&[match[1],match[2]||'1'].every(value=>Number.isSafeInteger(Number(value)))
      ? {mode:'line',line:Number(match[1]),column:Number(match[2]||1)} : {mode:'line',line:null,column:1};
  }
  const suffix=/^(.*?):([1-9]\d*)(?::([1-9]\d*))?$/.exec(query);
  if(suffix&&[suffix[2],suffix[3]||'1'].every(value=>Number.isSafeInteger(Number(value))))return {mode:'files',query:suffix[1],line:Number(suffix[2]),column:Number(suffix[3]||1)};
  return {mode:'files',query,line:null,column:1};
}
export async function anythingResults(value, {files, documents, model, monaco, relative, open, select, reveal, tr = value=>value, loadOutline = documentOutline}) {
  const parsed=parseAnythingQuery(value);
  if(parsed.mode==='line'){
    if(!model||!parsed.line)return [];
    const line=Math.min(parsed.line,model.getLineCount());
    return [{title:`${tr('Line')} ${line}`,subtitle:'',action:()=>reveal(model,line,parsed.column)}];
  }
  if(parsed.mode==='symbols'){
    if(!model)return [];
    let outline;
    try{outline=await loadOutline(model,monaco);}catch{return [];}
    return outline.entries.map(entry=>({entry,score:fuzzyScore(entry.name,parsed.query)}))
      .filter(item=>item.score!==-Infinity).sort((a,b)=>b.score-a.score).slice(0,100)
      .map(({entry})=>({title:entry.name,subtitle:`${tr(entry.kind)} · ${tr('Line')} ${entry.line}`,
        action:()=>reveal(model,entry.line,entry.column)}));
  }
  const records=new Map();
  for(const doc of documents)records.set(doc.path||doc.id,{path:doc.path,doc,name:doc.name});
  for(const file of files)if(!records.has(file))records.set(file,{path:file,name:file.replace(/\\/g,'/').split('/').pop()});
  return [...records.values()].map(item=>({...item,score:fuzzyScore(`${item.name} ${item.path?relative(item.path):item.name}`,parsed.query)}))
    .filter(item=>item.score!==-Infinity).sort((a,b)=>b.score-a.score).slice(0,100)
    .map(item=>({title:item.name,subtitle:(item.path?relative(item.path):tr('Unsaved draft'))+(parsed.line?` · ${tr('Line')} ${parsed.line}`:''),
      action:()=>{
        if(item.path)return open(item.path,parsed.line?{line:parsed.line,column:parsed.column}:{});
        select(item.doc.id);if(parsed.line)reveal(item.doc.model,parsed.line,parsed.column);
      }}));
}
