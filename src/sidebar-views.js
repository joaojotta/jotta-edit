export function installSidebarViews({documentRef=document,reveal=()=>{}}={}) {
  const views={explorer:['explorer-view','btn-explorer'],search:['project-search','btn-project-search'],outline:['document-outline','btn-outline'],connections:['remote-connections','btn-connections'],problems:['problems-panel','btn-problems'],git:['git-panel','btn-git']};
  const listeners=new Map();let current='explorer';
  return {
    show(name){
      if(!views[name])return;
      current=name;reveal();
      for(const [view,[panel,button]] of Object.entries(views)){
        const element=documentRef.getElementById(panel),trigger=documentRef.getElementById(button);
        if(element)element.hidden=view!==name;
        trigger?.setAttribute('aria-pressed',String(view===name));
      }
      listeners.get(name)?.();
    },
    onShow(name,fn){listeners.set(name,fn);},
    get current(){return current;}
  };
}
