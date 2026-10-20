/** Tabbed Preferences dialog and bounded pointer dragging. */
export function installSettingsTabs(dialog, tabs, { initial = 'editor', onChange = () => {} } = {}) {
  const buttons = [...tabs.querySelectorAll('[data-settings-tab]')];
  const select = (name, focus = false) => {
    const selected = buttons.find(b => b.dataset.settingsTab === name) || buttons[0];
    if (!selected) return;
    for (const button of buttons) {
      const active = button === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      const panel = dialog.querySelector('#' + button.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    }
    if (focus) selected.focus();
    onChange(selected.dataset.settingsTab);
  };
  tabs.addEventListener('click', e => {
    const button = e.target.closest('[data-settings-tab]');
    if (button && tabs.contains(button)) select(button.dataset.settingsTab);
  });
  tabs.addEventListener('keydown', e => {
    const active = e.target.closest('[data-settings-tab]');
    if (!active || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const index = buttons.indexOf(active);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
      : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    select(buttons[next].dataset.settingsTab, true);
  });
  select(initial);
  return { select };
}

export function installSettingsDragging(dialog, handle) {
  let drag = null;
  let displacement = { x: 0, y: 0 };
  const reset = () => {
    displacement = { x: 0, y: 0 };
    dialog.style.transform = '';
  };
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, input, select, textarea, a, [data-no-drag]')) return;
    const rect = dialog.getBoundingClientRect();
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, base: { ...displacement }, rect };
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const rect = drag.rect;
    const dx = Math.max(8 - rect.left, Math.min(innerWidth - 8 - rect.right, e.clientX - drag.startX));
    const dy = Math.max(8 - rect.top, Math.min(innerHeight - 8 - rect.bottom, e.clientY - drag.startY));
    displacement = { x: drag.base.x + dx, y: drag.base.y + dy };
    dialog.style.transform = `translate3d(${displacement.x}px, ${displacement.y}px, 0)`;
  });
  const finish = () => { drag = null; };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  return { reset };
}
