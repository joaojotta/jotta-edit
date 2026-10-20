import {tr} from './i18n.js';
export function installRecentWorkspaces({preferences, open, show, close}) {
  const $ = id => document.getElementById(id);
  let busy = false;
  function render() {
    for (const [id, limit] of [['recent-workspaces-list',20],['welcome-recents-list',4]]) {
      const list = $(id); list.replaceChildren();
      for (const path of preferences.recents().slice(0,limit)) {
        const row = document.createElement('div'); row.className = 'recent-workspace';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'recent-open';
        const name = document.createElement('strong'); name.textContent = path.replace(/\\/g,'/').split('/').filter(Boolean).pop() || path;
        const location = document.createElement('span'); location.textContent = path;
        button.append(name,location); button.title = path;
        button.onclick = async () => {
          if (busy) return; busy = true;
          try {
            $('recent-workspaces-status').textContent = '';
            if (await open(path)) close();
            else $('recent-workspaces-status').textContent = tr('Could not open this workspace. It may have moved or require folder access.');
          } finally { busy = false; render(); }
        };
        row.appendChild(button);
        if (limit === 20) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
          remove.setAttribute('aria-label', `${tr('Remove from recent workspaces')}: ${path}`);
          remove.onclick = () => { preferences.remove(path); render(); };
          row.appendChild(remove);
        }
        list.appendChild(row);
      }
    }
    $('welcome-recents').hidden = preferences.recents().length === 0;
    $('recent-workspaces-empty').hidden = preferences.recents().length !== 0;
  }
  $('recent-workspaces-close').onclick = close;
  $('recent-workspaces-clear').onclick = () => { preferences.clear(); render(); };
  render();
  return {render, open() { $('recent-workspaces-status').textContent = ''; render(); show('recent-workspaces-overlay'); $('recent-workspaces-close').focus(); }};
}
