// Keep the print document isolated from the editor and its application styles.
export async function printMarkdown(html,{documentRef=document}={}){
  const frame=documentRef.createElement('iframe');
  frame.title='Markdown PDF';frame.setAttribute('sandbox','allow-same-origin allow-modals');
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:900px;height:1000px;border:0';
  let cleanupTimer;
  const cleanup=()=>{clearTimeout(cleanupTimer);frame.remove();};
  try{
    await new Promise((resolve,reject)=>{
      cleanupTimer=setTimeout(()=>reject(new Error('PDF export timed out. Check image connections and try again.')),30000);
      frame.onload=resolve;frame.onerror=()=>reject(new Error('Could not open the PDF print dialog.'));
      frame.srcdoc=html;documentRef.body.appendChild(frame);
    });
    clearTimeout(cleanupTimer);
    frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});
    // Some browsers do not fire afterprint when their dialog is dismissed.
    cleanupTimer=setTimeout(cleanup,120000);
    frame.contentWindow.focus();frame.contentWindow.print();
    return {printing:true};
  }catch(error){cleanup();throw error;}
}
