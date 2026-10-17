// Startup and level briefing UI. All text stays in the DOM, separate from generated artwork.
const $ = id => document.getElementById(id);
const ROWS = [
  ['Move / look', 'W A S D / Mouse', 'Left stick / Right stick'],
  ['Interact / place chips', 'Left click', 'A / RT at a table'],
  ['Start a game', 'Click it: Hit, lever, wheel, dice, chute', 'A on it'],
  ['Skee-ball: aim / power', 'Mouse aim / hold, release Space', 'Right stick / hold, release A'],
  ['Arm House Insurance', 'I before starting a round', 'Right stick click at a table'],
  ['Blackjack: hit / stand / double', 'H / J / K', 'X / Y / B'],
  ['Murder / disguise', 'Left click / Disguise icon', 'RT / LT'],
  ['Other killer moves', 'Right click, choose an icon', 'D-pad ← / → choose, ↓ use'],
  ['Transform / selected ability', 'Click icon (hold Peek)', 'Y / RB (hold for peek)'],
  ['Sprint / monster leap', 'Shift', 'Left stick click / LB'],
  ['Drink / safety / phone', 'LMB sip · RMB sniff / check · Tab', 'X / D-pad up / View'],
  ['Ghost cameras / haunt / pause', 'C / H / Escape', 'D-pad down / X / Menu'],
];
// Vector diagrams keep every key label sharp at any resolution and add no asset downloads.
function keyboardDiagram() {
  const key = (label, x, y, width = 34, type = '', arrow = '') => `<g class="diagram-key ${type}" data-key="${label}"><rect x="${x}" y="${y + 3}" width="${width}" height="30" rx="4" class="key-base"/><rect x="${x}" y="${y}" width="${width}" height="29" rx="4"/><text x="${x + width / 2}" y="${y + (arrow ? 13 : 19)}" class="key-label">${label}</text>${arrow ? `<text x="${x + width / 2}" y="${y + 24}" class="key-arrow">${arrow}</text>` : ''}</g>`;
  let keys = key('Esc', 18, 36, 44);
  ['1', '2', '3', '4', '5', '6'].forEach((k, i) => keys += key(k, 68 + i * 40, 36));
  keys += key('Tab', 18, 75, 46);
  ['Q', 'W', 'E', 'R', 'T', 'Y'].forEach((k, i) => keys += key(k, 70 + i * 40, 75, 34, k === 'W' ? 'movement-key' : ['Q', 'E'].includes(k) ? 'action-key' : '', k === 'W' ? '↑' : ''));
  keys += key('Caps', 18, 114, 56);
  ['A', 'S', 'D', 'F', 'G', 'H'].forEach((k, i) => keys += key(k, 80 + i * 40, 114, 34, 'ASD'.includes(k) ? 'movement-key' : '', ({ A: '←', S: '↓', D: '→' })[k]));
  keys += key('Shift', 18, 153, 76, 'action-key');
  ['Z', 'X', 'C', 'V', 'B', 'N'].forEach((k, i) => keys += key(k, 100 + i * 40, 153));
  keys += key('Ctrl', 18, 192, 46) + key('Alt', 70, 192, 46) + key('Space', 122, 192, 212, 'action-key');
  return `<svg class="control-diagram keyboard-diagram" viewBox="0 0 540 244" role="img" aria-labelledby="keyboardDiagramTitle keyboardDiagramDesc"><title id="keyboardDiagramTitle">Left side of a keyboard and mouse</title><desc id="keyboardDiagramDesc">W above A, S and D are highlighted for movement. Q transforms, E interacts or uses your selected ability, Shift sprints or leaps, and Space starts the table game. Left mouse button murders or places chips; right mouse button opens action icons or takes chips back from a betting spot.</desc>
    <text x="18" y="14" class="diagram-caption">WASD MOVEMENT</text><rect x="8" y="26" width="340" height="207" rx="10" class="device-shell"/>${keys}
    <text x="452" y="30" class="diagram-caption" text-anchor="middle">MOUSE</text><path d="M452 49 C422 49 409 69 409 97 V146 C409 176 425 191 452 191 C479 191 495 176 495 146 V97 C495 69 482 49 452 49Z" class="device-shell"/>
    <path d="M452 50 V112 M410 112 H494" class="device-line"/><rect x="446" y="91" width="12" height="28" rx="6" class="mouse-wheel"/>
    <text x="430" y="82" class="mouse-label">LMB</text><text x="474" y="82" class="mouse-label">RMB</text><path d="M436 139 L452 128 L468 139 M452 130 V168" class="mouse-look"/>
    <text x="452" y="215" class="diagram-caption" text-anchor="middle">LOOK / SCROLL CHIPS</text></svg>`;
}
function controllerDiagram() {
  // Shell adapted from Kenney Input Prompts 1.5A (CC0); original proportions, source and license in design/controls/.
  const shell = 'M23.6 38.65 Q22.1 38.65 20.9 39.6 20.15 40.15 19.5 41.1 L17.45 43.75 Q14.65 47.25 12.7 48 9.55 47.55 8.25 43.95 7.95 42.5 8 40.75 8.1 38 9.1 34.5 L9.35 33.55 Q10.2 30.3 11.35 27 L12.1 25 13.35 21.9 14.35 19.6 15.3 18.6 15.45 18.35 15.85 17.65 Q17.55 15.4 21.55 15 L23.5 15 24.25 15.85 39.7 15.85 40.5 15 42.45 15 Q46.45 15.4 48.1 17.65 L48.55 18.35 48.65 18.6 49.65 19.6 50.65 21.9 51.95 25 52.65 27 54.65 33.55 54.9 34.5 Q55.9 38 56 40.75 56.05 42.5 55.75 43.95 54.45 47.55 51.25 48 49.35 47.25 46.5 43.75 L44.5 41.1 43.1 39.6 Q41.9 38.65 40.4 38.65 L23.6 38.65Z';
  const button = (label, x, y, type) => `<g class="pad-button ${type}" data-pad="${label}"><circle cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y + 5}">${label}</text></g>`;
  const stick = (label, x, y) => `<g class="pad-stick" data-pad="${label}"><circle cx="${x}" cy="${y}" r="26"/><circle cx="${x}" cy="${y}" r="19"/><text x="${x}" y="${y + 5}">${label}</text></g>`;
  return `<svg class="control-diagram controller-diagram" viewBox="0 0 540 244" role="img" aria-labelledby="controllerDiagramTitle controllerDiagramDesc"><title id="controllerDiagramTitle">Xbox controller button layout</title><desc id="controllerDiagramDesc">A front view with the rounded grips and body proportions of an Xbox Series controller. Left stick at upper left, D-pad below it, right stick at lower right. Y above X, B and A at upper right. LT and LB on the left shoulder; RT and RB on the right. View and Menu in the centre.</desc>
    <defs><linearGradient id="controllerShell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#49434a"/><stop offset=".45" stop-color="#302b32"/><stop offset="1" stop-color="#19151c"/></linearGradient><radialGradient id="controllerStick"><stop offset="0" stop-color="#343039"/><stop offset=".78" stop-color="#27232b"/><stop offset="1" stop-color="#48404a"/></radialGradient></defs>
    <g class="pad-trigger" data-pad="LT"><path d="M176 39 V25 Q176 15 186 15 H203 Q213 15 213 25 V38Z"/><path class="shoulder-leader" d="M175 22 H130"/><text x="123" y="26" text-anchor="end">LT</text></g>
    <g class="pad-trigger" data-pad="RT"><path d="M327 39 V25 Q327 15 337 15 H354 Q364 15 364 25 V38Z"/><path class="shoulder-leader" d="M365 22 H410"/><text x="417" y="26">RT</text></g>
    <g class="pad-bumper" data-pad="LB"><path d="M159 53 Q165 32 183 31 L217 31 L226 44Z"/><path class="shoulder-leader" d="M163 40 L147 48 H130"/><text x="123" y="52" text-anchor="end">LB</text></g>
    <g class="pad-bumper" data-pad="RB"><path d="M381 53 Q375 32 357 31 L323 31 L314 44Z"/><path class="shoulder-leader" d="M377 40 L393 48 H410"/><text x="417" y="52">RB</text></g>
    <path d="${shell}" transform="translate(71.6 -59) scale(6.2)" class="controller-shell"/>
    <path d="M174 58 Q165 71 158 92 M366 58 Q375 71 382 92 M208 41 Q270 53 332 41" class="shell-seam"/>
    <path d="M150 123 Q135 160 133 199 Q133 216 145 224 M390 123 Q405 160 407 199 Q407 216 395 224" class="grip-line"/>
    <g class="pad-home" aria-hidden="true"><circle cx="270" cy="65" r="11"/><path d="M264 60 Q270 63 276 71 M276 60 Q270 63 264 71"/></g>
    ${stick('LS', 199, 87)}${stick('RS', 295, 143)}
    <g data-pad="D-pad"><path d="M220 119 L240 119 L253 132 V152 L240 165 H220 L207 152 V132Z" class="pad-dpad"/><path d="M224 123 H236 V136 H249 V148 H236 V161 H224 V148 H211 V136 H224Z" class="pad-dpad-face"/><path d="M227 128 L230 125 L233 128 M227 156 L230 159 L233 156 M216 139 L213 142 L216 145 M244 139 L247 142 L244 145" class="dpad-arrows"/></g>
    ${button('Y', 338, 72, 'pad-y')}${button('X', 313, 97, 'pad-x')}${button('B', 363, 97, 'pad-b')}${button('A', 338, 122, 'pad-a')}
    <g class="pad-small" data-pad="View"><circle cx="248" cy="102" r="10"/><rect x="243" y="99" width="7" height="6" rx="1"/><path d="M247 99 V96 H254 V102 H251"/></g>
    <g class="pad-small" data-pad="Menu"><circle cx="289" cy="102" r="10"/><path d="M284 98 H294 M284 102 H294 M284 106 H294"/></g>
    <g class="pad-share" aria-hidden="true"><rect x="263" y="125" width="14" height="16" rx="5"/><path d="M270 136 V129 M267 131 L270 128 L273 131"/></g>
    <path d="M180 105 L153 115 H103 M312 162 L343 186 H432" class="callout-line"/><text x="96" y="119" class="diagram-caption" text-anchor="end">MOVE</text><text x="439" y="190" class="diagram-caption">LOOK</text>
    <path d="M248 91 V94 M289 91 V94" class="callout-line"/><text x="248" y="87" class="pad-small-label" text-anchor="middle">VIEW</text><text x="289" y="87" class="pad-small-label" text-anchor="middle">MENU</text>
    </svg>`;
}
export function initLoading() {
  $('keyboardDiagram').innerHTML = keyboardDiagram();
  $('controllerDiagram').innerHTML = controllerDiagram();
  $('controlsRows').innerHTML = ROWS.map(([a, k, p]) => `<div class="control-row"><span>${a}</span><kbd>${k}</kbd><kbd>${p}</kbd></div>`).join('');
  $('controlsToggle').addEventListener('click', () => {
    const open = $('controlsToggle').getAttribute('aria-expanded') !== 'true';
    $('controlsToggle').setAttribute('aria-expanded', String(open));
    $('controlsToggle').innerHTML = `${open ? 'Hide full controls' : 'All controls'} <span aria-hidden="true">${open ? '−' : '+'}</span>`;
    $('allControls').classList.toggle('hidden', !open);
    if (open) $('controlsToggle').scrollIntoView({ block: 'start' });
  });
}
export function loadingProgress(value, text, level = false) {
  $(level ? 'levelStatus' : 'bootStatus').textContent = text;
  $(level ? 'levelFill' : 'bootFill').style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
  $(level ? 'levelProgress' : 'bootProgress').setAttribute('aria-valuenow', Math.round(value * 100));
}
export function showBriefing() {
  $('allControls').classList.add('hidden'); $('controlsToggle').setAttribute('aria-expanded', 'false');
  $('controlsToggle').innerHTML = 'All controls <span aria-hidden="true">+</span>';
  document.querySelector('.briefing-content').scrollTop = 0;
  $('levelLoading').classList.remove('hidden'); $('levelBack').classList.add('hidden'); $('levelContinue').disabled = true;
  loadingProgress(0, 'Preparing your table…', true);
}
export function briefingReady() {
  loadingProgress(1, 'Ready when you are. Read the controls, then continue.', true);
  $('levelContinue').disabled = false;
}
export async function preloadInterface() {
  // World art is loaded by textures.js. Each interface image is fetched once,
  // then CSS uses its retained blob URL even on a no-store preview server.
  const files = ['menu-mystery-v2', 'menu-escape-v2', 'loading-arrival-v1', 'loading-controls-v1', 'ability-icons-v1'];
  await Promise.all(files.map(async file => {
    const response = await fetch(`assets/art2/${file}.webp`); if (!response.ok) throw new Error('Image failed: ' + file);
    const url = URL.createObjectURL(await response.blob()), image = new Image(); image.src = url; await image.decode();
    document.documentElement.style.setProperty('--art-' + file, `url("${url}")`);
  }));
  await Promise.all([document.fonts.load('700 24px Cinzel'), document.fonts.load('600 16px Manrope')]);
}
