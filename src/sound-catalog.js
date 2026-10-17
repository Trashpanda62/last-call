// Stable file IDs: one decision per recording, even when several rooms share it.
const TITLES = {
  'house-after-hours': 'After Hours', 'house-empty-chairs': 'Empty Chairs', 'house-last-wager': 'The Last Wager',
  'menu-1': 'Bar jukebox', 'casino-eerie': 'Eerie casino', 'floor-mixed-tables': 'Mixed tables',
  'floor-card-room': 'Cards and chips', 'floor-roulette-room': 'Roulette pit',
  'backroom-hum': 'Backrooms fluorescent hum', 'eating-crunch': 'Eating crunch',
};
export const SOUND_CATEGORIES = { music: 'Music', amb: 'Room ambience', cues: 'Creepy cues & potatoes', sfx: 'Game effects', death: 'Death sounds', monster: 'Monster', generated: 'Synthesized effects' };
const words = s => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase());
export function soundCatalog(library) {
  const files = new Map();
  for (const category of Object.keys(SOUND_CATEGORIES)) {
    for (const [kind, values] of Object.entries(library?.[category] || {})) {
      for (const file of Array.isArray(values) ? values : [values]) {
        if (files.has(file)) { files.get(file).uses.push(words(kind)); continue; }
        const stem = file.split('/').at(-1).replace(/\.mp3$/, '');
        files.set(file, { file, category, kind, title: TITLES[stem] || words(stem), uses: [words(kind)] });
      }
    }
  }
  for (const [file, kind] of [['generated/backroom-hum', 'hum'], ['generated/eating-crunch', 'crunch']]) {
    files.set(file, {file, category: 'generated', kind, title: TITLES[file.split('/').at(-1)], uses: []});
  }
  return [...files.values()];
}
