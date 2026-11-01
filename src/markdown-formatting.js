const inline={bold:['**','**'],italic:['*','*'],strike:['~~','~~'],underline:['<u>','</u>'],subscript:['<sub>','</sub>'],superscript:['<sup>','</sup>']};
const list=/^(?:[-+*]\s+\[[ xX]\]\s+|[-+*]\s+|\d+[.)]\s+)/;
function result(start,end,text,selectionStart=0,selectionEnd=text.length){return {start,end,text,selectionStart:start+selectionStart,selectionEnd:start+selectionEnd};}
function wrap(source,start,end,left,right,placeholder='text'){
  const selected=source.slice(start,end);
  const selectedMarker=left!=='*'||((selected.match(/^\*+/)?.[0].length||0)%2===1&&(selected.match(/\*+$/)?.[0].length||0)%2===1);
  if(selectedMarker&&selected.startsWith(left)&&selected.endsWith(right)&&selected.length>=left.length+right.length){const text=selected.slice(left.length,-right.length);return result(start,end,text);}
  const adjacentMarker=left!=='*'||((source.slice(0,start).match(/\*+$/)?.[0].length||0)%2===1&&(source.slice(end).match(/^\*+/)?.[0].length||0)%2===1);
  if(adjacentMarker&&start>=left.length&&source.slice(start-left.length,start)===left&&source.slice(end,end+right.length)===right)return result(start-left.length,end+right.length,selected);
  const value=selected||placeholder;return result(start,end,left+value+right,left.length,left.length+value.length);
}
export function markdownEdit(source,start,end,action){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>source.length)throw new Error('Invalid Markdown selection.');
  const selected=source.slice(start,end),eol=source.includes('\r\n')?'\r\n':'\n';
  if(inline[action])return wrap(source,start,end,...inline[action]);
  if(action==='code'){
    const ticks='`'.repeat(Math.max(1,...[...(selected||'').matchAll(/`+/g)].map(match=>match[0].length+1)));
    const padding=/^`|`$/.test(selected)?' ':'';
    return wrap(source,start,end,ticks+padding,padding+ticks,'code');
  }
  if(action==='link'||action==='image'){
    const label=(selected||(action==='image'?'alt text':'link text')).replace(/[\\\[\]]/g,'\\$&');
    const prefix=(action==='image'?'!':'')+'['+label+'](',url=action==='image'?'path/to/image.png':'https://example.com';
    return result(start,end,prefix+url+')',prefix.length,prefix.length+url.length);
  }
  if(action==='code-block'||action==='rule'||action==='table'){
    const before=start>0&&source[start-1]!=='\n'?eol+eol:'',after=end<source.length&&source[end]!=='\r'&&source[end]!=='\n'?eol+eol:'';
    let text,at,length;
    if(action==='code-block'){
      const fence='`'.repeat(Math.max(3,...[...selected.matchAll(/`+/g)].map(match=>match[0].length+1))),value=selected||'code';
      text=fence+eol+value+eol+fence;at=fence.length+eol.length;length=value.length;
    }else if(action==='rule'){text='---'+eol+eol;at=text.length;length=0;}
    else {text=['| Column 1 | Column 2 |','| --- | --- |','| Text | Text |'].join(eol)+eol;at=2;length=8;}
    return result(start,end,before+text+after,before.length+at,before.length+at+length);
  }
  const heading=/^heading-([1-6])$/.exec(action);
  if(!heading&&!['quote','unordered','ordered','checklist'].includes(action))throw new Error('Unknown Markdown action.');
  const first=start===0?0:source.lastIndexOf('\n',start-1)+1;
  let last=source.indexOf('\n',end);
  if(end>start&&source[end-1]==='\n')last=end-1;
  if(last<0)last=source.length;
  if(source[last-1]==='\r')last--;
  const lines=source.slice(first,last).split(/\r?\n/),nonempty=lines.filter(line=>line.trim());
  const marker=heading?'#'.repeat(Number(heading[1]))+' ':action==='quote'?'> ':action==='unordered'?'- ':action==='ordered'?'1. ':'- [ ] ';
  const matches=line=>{
    const value=line.trimStart();
    return heading?value.startsWith(marker):action==='quote'?/^>\s?/.test(value):action==='unordered'?/^[-+*]\s+(?!\[[ xX]\]\s)/.test(value):action==='ordered'?/^\d+[.)]\s+/.test(value):/^[-+*]\s+\[[ xX]\]\s+/.test(value);
  };
  const remove=nonempty.length>0&&nonempty.every(matches);let number=0,firstDelta=0;
  const text=lines.map((line,index)=>{
    if(!line.trim()&&lines.length>1)return line;
    const indent=line.match(/^\s*/)[0];let body=line.slice(indent.length),prefix=marker;
    if(remove){body=body.replace(heading?new RegExp('^#{'+heading[1]+'} '):action==='quote'?/^>\s?/:list,'');prefix='';}
    else {
      if(heading)body=body.replace(/^#{1,6}\s+/,'');
      else if(action==='quote'){}else body=body.replace(list,'');
      if(action==='ordered')prefix=String(++number)+'. ';
    }
    const value=indent+prefix+body;if(index===0)firstDelta=value.length-line.length;return value;
  }).join(eol);
  if(start===end){const cursor=Math.max(0,Math.min(text.length,start-first+firstDelta));return result(first,last,text,cursor,cursor);}
  return result(first,last,text);
}

export function markdownEdits(source,selections,action){
  const edits=selections.map(({start,end})=>markdownEdit(source,start,end,action)).sort((a,b)=>a.start-b.start||a.end-b.end);
  const result=[];
  for(const edit of edits){const previous=result.at(-1);if(previous&&edit.start===previous.start&&edit.end===previous.end)continue;
    if(previous&&edit.start<previous.end)throw new Error('Use separate selections or lines for this Markdown action.');result.push(edit);}
  return result;
}
