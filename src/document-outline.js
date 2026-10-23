import {lexer} from 'marked';

export const OUTLINE_LANGUAGES=new Set(['markdown','javascript','typescript','css','scss','less','php','python']);
const LIMIT=1000;
const compact=text=>String(text).replace(/\s+/g,' ').trim().slice(0,240);
function headingText(tokens){return (tokens||[]).map(t=>t.type==='image'?t.text:t.tokens?headingText(t.tokens):t.type==='html'?'':t.text||t.raw||'').join('');}
export function markdownOutline(source){
  let text=source.replace(/\r\n?/g,'\n');
  // Front matter is metadata, even when it resembles a setext heading.
  text=text.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\s*(?:\n|$)/,match=>match.replace(/[^\n]/g,' '));
  let line=1;const entries=[],lineCount=text.split('\n').length;
  for(const token of lexer(text)){
    if(token.type==='heading')entries.push({name:compact(headingText(token.tokens)||token.text),kind:'Heading',depth:token.depth-1,line,column:(token.raw.match(/^ */)?.[0].length||0)+1,endLine:lineCount,endColumn:Infinity});
    if(entries.length>LIMIT)break;
    line+=(token.raw.match(/\n/g)||[]).length;
  }
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)if(entries[j].depth<=entries[i].depth){entries[i].endLine=entries[j].line-1;break;}
  return entries;
}

// Preserve offsets while excluding declarations inside comments and strings.
export function maskOutlineCode(text,language){
  let out='',i=0;
  const blank=value=>value.replace(/[^\r\n]/g,' ');
  while(i<text.length){
    const start=i,c=text[i],pair=text.slice(i,i+2),triple=text.slice(i,i+3);
    const heredoc=language==='php'&&triple==='<<<'?/^<<<[ \t]*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|([A-Za-z_]\w*))[ \t]*\r?\n/.exec(text.slice(i)):null;
    if(heredoc){const body=i+heredoc[0].length,tag=heredoc[1]||heredoc[2]||heredoc[3],end=new RegExp('^[ \\t]*'+tag+'\\b','m').exec(text.slice(body));i=end?body+end.index+end[0].length:text.length;}
    else if(pair==='/*'){const end=text.indexOf('*/',i+2);i=end<0?text.length:end+2;}
    else if(pair==='//'&&language!=='python'||c==='#'&&['python','php'].includes(language)){const end=text.indexOf('\n',i);i=end<0?text.length:end;}
    else if(language==='python'&&(triple==='"""'||triple==="'''")){const end=text.indexOf(triple,i+3);i=end<0?text.length:end+3;}
    else if(c==='"'||c==="'"||c==='`'){
      i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]===c)break;}
    }else{out+=c;i++;continue;}
    out+=blank(text.slice(start,i));
  }
  return out;
}
export function declarationOutline(source,language){
  const masked=maskOutlineCode(source,language),lines=masked.split('\n'),entries=[];let braces=0;
  for(let i=0;i<lines.length;i++){
    if(entries.length>LIMIT)break;
    const line=lines[i];let match;
    if(language==='python')match=/^(\s*)(?:async\s+)?(def|class)\s+([\p{L}_][\p{L}\p{N}_]*)/u.exec(line);
    else match=/(?:^|[;{}])\s*(?:(?:export|default|declare|public|private|protected|static|abstract|final|async)\s+)*(function|class|interface|enum)\s+\*?\s*&?\s*([\p{L}_$][\p{L}\p{N}_$]*)/u.exec(line);
    if(match){const name=match[3]||match[2],kind=(language==='python'?match[2]:match[1])==='class'?'Class':'Function';entries.push({name,kind,depth:language==='python'?Math.floor(match[1].replace(/\t/g,'    ').length/4):braces,line:i+1,column:line.indexOf(name,match.index)+1,endLine:lines.length,endColumn:Infinity});}
    braces=Math.max(0,braces+(line.match(/\{/g)||[]).length-(line.match(/\}/g)||[]).length);
  }
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)if(entries[j].depth<=entries[i].depth){entries[i].endLine=entries[j].line-1;break;}
  return entries;
}
export function navigationOutline(tree,model){
  const entries=[];
  const walk=(items,depth)=>{for(const item of [...(items||[])].sort((a,b)=>(a.spans?.[0]?.start||0)-(b.spans?.[0]?.start||0))){
    if(entries.length>LIMIT)return;
    const span=item.spans?.[0];if(!span)continue;
    const start=model.getPositionAt(span.start),end=model.getPositionAt(span.start+span.length),name=compact(item.text);
    if(name&&item.kind!=='alias')entries.push({name,kind:['function','local function','method','constructor'].includes(item.kind)?'Function':['class','interface'].includes(item.kind)?'Class':'Symbol',depth,line:start.lineNumber,column:start.column,endLine:end.lineNumber,endColumn:end.column});
    walk(item.childItems,depth+1);
  }};
  walk(tree?.childItems,0);return entries;
}
export function cssOutline(symbols){
  const entries=[];
  const walk=(items,depth)=>{for(const item of items||[]){
    if(entries.length>LIMIT)return;
    const range=item.range||item.location?.range;if(!range)continue;
    entries.push({name:compact(item.name),kind:'Selector',depth,line:range.start.line+1,column:range.start.character+1,endLine:range.end.line+1,endColumn:range.end.character+1});
    walk(item.children,depth+1);
  }};walk(symbols,0);
  // CSS workers return SymbolInformation without a children hierarchy.
  if(!symbols.some(item=>item.children)){
    entries.sort((a,b)=>a.line-b.line||a.column-b.column||b.endLine-a.endLine);
    const parents=[];for(const item of entries){while(parents.length&&(item.endLine===parents.at(-1).endLine&&item.endColumn===parents.at(-1).endColumn||item.line>parents.at(-1).endLine||item.line===parents.at(-1).endLine&&item.column>=parents.at(-1).endColumn))parents.pop();item.depth=parents.length;parents.push(item);}
  }
  return entries;
}
export async function documentOutline(model,monaco){
  const language=model.getLanguageId();if(!OUTLINE_LANGUAGES.has(language))return {entries:[],supported:false};
  if(model.getValueLength()>2*1024*1024)return {entries:[],supported:true,tooLarge:true};
  let entries;
  if(language==='markdown')entries=markdownOutline(model.getValue());
  else if(['css','scss','less'].includes(language)){
    // Monaco's pinned CSS service is also usable directly. Its CSS contribution
    // does not export the worker accessor supplied by the TypeScript service.
    const [{getCSSLanguageService,getSCSSLanguageService,getLESSLanguageService},{TextDocument}]=await Promise.all([
      import('../node_modules/monaco-editor/esm/external/vscode-css-languageservice/lib/esm/cssLanguageService.js'),
      import('../node_modules/monaco-editor/esm/external/vscode-languageserver-textdocument/lib/esm/main.js')
    ]);
    const service=(language==='scss'?getSCSSLanguageService:language==='less'?getLESSLanguageService:getCSSLanguageService)();
    const document=TextDocument.create(model.uri.toString(),language,model.getVersionId(),model.getValue());
    entries=cssOutline(service.findDocumentSymbols(document,service.parseStylesheet(document)));
  }else if(['javascript','typescript'].includes(language)){
    const api=monaco.languages.typescript,worker=await api[language==='typescript'?'getTypeScriptWorker':'getJavaScriptWorker']();
    entries=navigationOutline(await (await worker(model.uri)).getNavigationTree(model.uri.toString()),model);
  }else entries=declarationOutline(model.getValue(),language);
  return {entries:entries.slice(0,LIMIT),supported:true,limited:entries.length>LIMIT};
}
