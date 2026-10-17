import { SOUND_CATEGORIES } from './sound-catalog.js';

const el = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
export function buildSoundBrowser(audio, parent) {
  const section = el('section', '', 'sound-browser'); section.setAttribute('aria-label', 'Sound library');
  section.append(el('h3', 'Sound library'), el('p', 'Preview any sound. Keep or mute it in your game; choices save automatically.'));
  const tools = el('div', '', 'sound-tools'), search = el('input'), category = el('select');
  search.type = 'search'; search.placeholder = 'Search sounds'; search.setAttribute('aria-label', 'Search sounds');
  category.setAttribute('aria-label', 'Sound category');
  for (const [key, title] of [['all', 'All sounds'], ...Object.entries(SOUND_CATEGORIES)]) { const option = el('option', title); option.value = key; category.append(option); }
  const mutedLabel = el('label', '', 'sound-muted-filter'), muted = el('input'); muted.type = 'checkbox'; mutedLabel.append(muted, document.createTextNode('Muted only'));
  tools.append(search, category, mutedLabel);
  const actions = el('div', '', 'sound-actions'), stop = el('button', 'Stop preview'), restore = el('button', 'Keep all'), copy = el('button', 'Copy muted list');
  actions.append(stop, restore, copy);
  const status = el('p', '', 'sound-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const list = el('div', '', 'sound-list');
  section.append(tools, actions, status, list); parent.append(section);
  let rows = [], extra = '', state = audio.soundPreviewState();
  function update() {
    const sounds = audio.soundList(), byFile = new Map(sounds.map(s => [s.file, s]));
    const count = sounds.filter(s => !s.kept).length;
    status.textContent = state.error || extra || (state.file ? `${state.loading ? 'Loading' : 'Playing'}: ${byFile.get(state.file)?.title || ''}${audio.volumes().master === 0 ? ' · Master volume is zero' : ''}` : `${sounds.length} sounds · ${count} muted`);
    stop.disabled = !state.file; restore.disabled = count === 0; copy.disabled = count === 0;
    for (const row of rows) {
      const s = byFile.get(row.file), playing = state.file === row.file;
      row.node.classList.toggle('muted', !s.kept); row.node.classList.toggle('playing', playing);
      row.play.textContent = playing ? state.loading ? 'Loading…' : 'Stop' : 'Play'; row.play.setAttribute('aria-pressed', String(playing));
      row.keep.textContent = s.kept ? 'Keep ✓' : 'Muted'; row.keep.setAttribute('aria-pressed', String(s.kept));
    }
  }
  function render() {
    list.replaceChildren(); rows = [];
    const query = search.value.toLowerCase().trim();
    for (const s of audio.soundList()) {
      if (category.value !== 'all' && s.category !== category.value || muted.checked && s.kept) continue;
      if (query && ![s.title, s.file, ...s.uses].join(' ').toLowerCase().includes(query)) continue;
      const node = el('div', '', 'sound-row'); node.dataset.sound = s.file;
      const info = el('div', '', 'sound-name'); info.append(el('strong', s.title), el('small', `${SOUND_CATEGORIES[s.category]} · ${s.uses.join(', ') || 'Procedural sound'}`));
      const play = el('button', 'Play'), keep = el('button', 'Keep ✓', 'sound-keep');
      play.setAttribute('aria-label', `Preview ${s.title}`); keep.setAttribute('aria-label', `Keep ${s.title} in game`);
      play.onclick = () => { extra = ''; if (audio.soundPreviewState().file === s.file) audio.stopSoundPreview(); else audio.previewSound(s.file); };
      keep.onclick = () => { const enabled = !audio.soundList().find(f => f.file === s.file).kept; audio.setSoundKept(s.file, enabled); extra = `${s.title}: ${enabled ? 'kept' : 'muted'} · saved`; update(); };
      node.append(info, play, keep); list.append(node); rows.push({file: s.file, node, play, keep});
    }
    if (!rows.length) list.append(el('p', 'No sounds match your filters.'));
    update();
  }
  search.oninput = category.onchange = muted.onchange = () => { extra = ''; render(); };
  stop.onclick = () => audio.stopSoundPreview();
  restore.onclick = () => { audio.restoreSounds(); extra = 'All sounds kept · saved'; render(); };
  copy.onclick = async () => {
    const sounds = audio.soundList().filter(s => !s.kept);
    try { await navigator.clipboard.writeText('Last Call — muted sounds\n' + sounds.map(s => `${s.title}: ${s.file}`).join('\n')); extra = 'Muted list copied'; }
    catch { extra = 'Clipboard unavailable. Your choices are still saved.'; }
    update();
  };
  const unsubscribe = audio.onSoundPreview(v => { state = v; update(); });
  render();
  return () => { unsubscribe(); audio.stopSoundPreview(); section.remove(); };
}
