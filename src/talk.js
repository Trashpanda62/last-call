// Meetings that sound like people: 16 personalities with their own voice, moods that build over the night, alibis
// (true for the crew, made up by killers), questions, answers, contradictions, vouching, live votes that swing with
// the room, last words and reactions. No DOM: the sim calls it and puts its lines in the meeting.
import { ROOMS } from './map.js';
import { CFG } from './config.js';
import { pick, rand, shuffle, clamp } from './util.js';

// ---------- Who they are (same order as CAST) ----------
// temper: how fast they get angry; nerve: how well they hold it together; follow: how easily the room sways their vote
export const PERSONAS = [
  { key: 'noir', name: 'the detective', temper: 0.3, nerve: 0.9, follow: 0.2, pre: ['The way I see it,', 'Here\'s the thing.', 'Listen.'], post: ['Case closed.', 'Mark my words.'],
    lines: {
      saw: ['I was watching {x}. {X} {phrase}. Clear as a neon sign.', 'I saw it. {x} {phrase}. Nobody else had the angle.'],
      deny: ['Nice try. I was in {room}, minding my own business.', 'You\'re barking up the wrong fedora.'],
      ask: ['{x}. Where were you when it went down?', 'Talk, {x}. Where were you?'],
      skip: ['Not enough evidence. A good detective waits.', 'We don\'t hang a man on a hunch. Skip.'],
      nothing: ['I was at {place}. Saw nothing. Which is its own kind of clue.'],
      vote: ['My money\'s on {x}.', '{x}. Gut feeling. My gut\'s never been wrong.'],
      lastIn: ['You\'re making a mistake. The real killer\'s laughing at you right now.'],
      lastOut: ['Heh. You got me. Took you long enough, gumshoes.'],
      cheer: ['Told you. The guilty always talk too much.'], sorry: ['We hung an innocent. The killer\'s still in the room.'],
    } },
  { key: 'smug', name: 'the know-it-all', temper: 0.4, nerve: 0.7, follow: 0.1, pre: ['Obviously,', 'Let me explain this slowly.', 'Elementary.'], post: ['You\'re welcome.', 'Keep up.'],
    lines: {
      saw: ['I saw {x} {phrase}. Obviously. Was nobody else paying attention?'],
      deny: ['Me? Please. I was in {room}. I\'m far too clever to get caught, which proves I didn\'t do it.'],
      ask: ['{x}, walk us through your evening. Slowly.'],
      skip: ['There isn\'t enough data to vote. Anyone with a brain would skip.'],
      nothing: ['I was at {place}, winning. I can\'t be expected to babysit all of you.'],
      vote: ['{x}. The logic is simple.'],
      lastIn: ['You\'re all idiots. You\'ll see.'], lastOut: ['Fine. I outsmarted you for HOURS. Remember that.'],
      cheer: ['As I predicted.'], sorry: ['Well. I would have voted differently. Had anyone asked.'],
    } },
  { key: 'cowboy', name: 'the cowboy', temper: 0.5, nerve: 0.8, follow: 0.4, pre: ['Now hold your horses.', 'Well, partner,', 'I reckon'], post: ['That\'s a fact.', 'Yeehaw, I guess.'],
    lines: {
      saw: ['I saw {x} {phrase}, plain as day. That varmint\'s our killer.', 'Saw it with my own two eyes: {x} {phrase}.'],
      deny: ['Whoa there. I was in {room}, partner. Ain\'t never killed nothin\' but a steak.'],
      ask: ['{x}, partner. Where were you at?'],
      skip: ['I ain\'t stringin\' up nobody without proof. Skip.'],
      nothing: ['I was over at {place}. Didn\'t see a lick of trouble.'],
      vote: ['I\'m puttin\' my hat on {x}.'],
      lastIn: ['You\'re hangin\' the wrong cowpoke!'], lastOut: ['Heh. Fastest knife in the west. Y\'all were slow.'],
      cheer: ['Got the varmint!'], sorry: ['Aw, hell. That one\'s on us.'],
    } },
  { key: 'gossip', name: 'the gossip', temper: 0.4, nerve: 0.5, follow: 0.7, pre: ['Okay so,', 'Not to be dramatic, but', 'Babe.'], post: ['Just saying.', 'I\'m just telling you what I saw.'],
    lines: {
      saw: ['Okay, I SAW {x} {phrase}. I literally screamed inside.', 'You will not BELIEVE what I saw. {x} {phrase}.'],
      deny: ['Excuse me? I was in {room} talking to literally everyone. Ask around.'],
      ask: ['{x}, sweetie, where were you? Because nobody saw you.'],
      skip: ['I need more tea before I vote. Skip.'],
      nothing: ['I was at {place}. I heard things, but nothing I can prove. Yet.'],
      vote: ['Everyone knows it\'s {x}. Everyone.'],
      lastIn: ['You\'re all going to feel SO stupid.'], lastOut: ['Okay fine, it was me. Wasn\'t it juicy?'],
      cheer: ['I KNEW it. I knew it from the start.'], sorry: ['Oh no. Oh, that\'s bad. We\'re never living that down.'],
    } },
  { key: 'lawyer', name: 'the wannabe lawyer', temper: 0.5, nerve: 0.6, follow: 0.3, pre: ['For the record,', 'Let the record show:', 'Objection!'], post: ['I rest my case.', 'The defense rests.'],
    lines: {
      saw: ['Let the record show I personally witnessed {x} {phrase}.'],
      deny: ['Objection! Hearsay! I was in {room} and I have witnesses. Probably.'],
      ask: ['{x}, where were you at the time of the incident? Answer the question.'],
      skip: ['There is reasonable doubt. I move that we skip.'],
      nothing: ['My client, me, was at {place}. My client saw nothing.'],
      vote: ['The evidence points to {x}. Guilty.'],
      lastIn: ['This is a miscarriage of justice! I\'ll appeal!'], lastOut: ['I plead guilty. Off the record, it was fun.'],
      cheer: ['Justice is served.'], sorry: ['That was a wrongful conviction, and you all signed it.'],
    } },
  { key: 'roller', name: 'the high roller', temper: 0.4, nerve: 0.8, follow: 0.5, pre: ['Odds are,', 'I\'d bet the house on this:', 'Look,'], post: ['Bet on it.', 'That\'s a sure thing.'],
    lines: {
      saw: ['I saw {x} {phrase}. I\'d bet my whole stack on it.'],
      deny: ['Me? I was in {room} making this crew money. Check the bank.'],
      ask: ['{x}. Where were you? The odds don\'t look good for you.'],
      skip: ['I don\'t bet on a long shot. Skip.'],
      nothing: ['I was at {place}, on a hot streak. Didn\'t look up once.'],
      vote: ['All in on {x}.'],
      lastIn: ['You just bet on the wrong horse.'], lastOut: ['House always wins. Well. Almost.'],
      cheer: ['Paid out!'], sorry: ['Bad beat. Real bad beat.'],
    } },
  { key: 'grandma', name: 'the grandma', temper: 0.3, nerve: 0.6, follow: 0.4, pre: ['Oh, dearie.', 'Lord have mercy.', 'In my day,'], post: ['Bless your heart.', 'Now eat something.'],
    lines: {
      saw: ['I may be old, but I saw {x} {phrase}. Shame on you, {x}.'],
      deny: ['Me? I\'m eighty-three, dear. I was in {room} with my slot machine.'],
      ask: ['{x}, honey, where were you? Grandma wants to know.'],
      skip: ['I won\'t send anybody out without proof. Skip, dears.'],
      nothing: ['I was at {place}. My eyes aren\'t what they used to be.'],
      vote: ['I\'m sorry, {x}, but grandma votes you.'],
      lastIn: ['I\'m going to tell all your mothers.'], lastOut: ['Oh, fine. Grandma did it. Nobody suspects grandma.'],
      cheer: ['Good riddance, I always said.'], sorry: ['Oh no. That poor dear.'],
    } },
  { key: 'hothead', name: 'the hothead', temper: 1, nerve: 0.5, follow: 0.3, pre: ['Are you KIDDING me?', 'Oh, come ON.', 'Listen to me!'], post: ['Damn it!', 'I\'m done being nice!'],
    lines: {
      saw: ['I SAW {x} {phrase}! Throw {x} OUT!', '{X} {phrase}, I SAW IT! What are we even talking about?!'],
      deny: ['ME?! I was in {room}! Say that again, I dare you!', 'Are you out of your damn mind? I was in {room}!'],
      ask: ['{x}! Where the hell were you?'],
      skip: ['Fine! Skip! But when the next body drops, that\'s on you!'],
      nothing: ['I was at {place}, losing my shirt! I didn\'t see a damn thing!'],
      vote: ['{X}. Done. Next.', 'I\'m voting {x} and I don\'t care what anyone says!'],
      lastIn: ['You\'re ALL going to regret this!'], lastOut: ['Yeah, it was me! And I\'d do it again!'],
      cheer: ['YES! I TOLD you! I TOLD ALL OF YOU!'], sorry: ['Great. Just great. Who pushed for that? WHO?'],
    } },
  { key: 'rookie', name: 'the rookie', temper: 0.3, nerve: 0.3, follow: 0.8, pre: ['Uh,', 'Is this normal?', 'Sorry, first time here,'], post: ['I think?', 'Is that how this works?'],
    lines: {
      saw: ['Okay, I think I saw {x} {phrase}? Like, I definitely did. I think.'],
      deny: ['What? No! I was in {room}! I don\'t even know how to kill someone!'],
      ask: ['Um, {x}? Where were you? Sorry. Just asking.'],
      skip: ['I don\'t know enough. Can I skip? I\'m skipping.'],
      nothing: ['I was at {place}, trying to figure out the rules. I didn\'t see anything.'],
      vote: ['Everyone seems to think {x}, so... {x}?'],
      lastIn: ['But I didn\'t do anything! This is my first night!'], lastOut: ['Beginner\'s luck, I guess. Hehe.'],
      cheer: ['Wait, we got it? We got it!'], sorry: ['Oh no. Was that my fault? It was my fault.'],
    } },
  { key: 'drunk', name: 'the drunk', temper: 0.5, nerve: 0.6, follow: 0.6, pre: ['*hic*', 'Okay, okay, okay.', 'Lissen.'], post: ['Who\'s buying the next round?', '*hic*'],
    lines: {
      saw: ['I saw {x} {phrase}. There was only one of {x}. I counted.'],
      deny: ['Me? I was in {room}. Or the bar. The bar\'s in {room}, right?'],
      ask: ['{x}! Where were... where were you? You know what I mean.'],
      skip: ['Skip. Skip skip skip. Let\'s get another drink.'],
      nothing: ['I was at {place}. I think. Everything\'s a little spinny.'],
      vote: ['{x}. Or the one next to {x}. No, {x}.'],
      lastIn: ['Fine! I\'m going to the bar! A different bar!'], lastOut: ['It was me. *hic* Sorry. Not sorry.'],
      cheer: ['Drinks are on {x}! Oh wait.'], sorry: ['Wait, that was the wrong one? Oops.'],
    } },
  { key: 'nut', name: 'the conspiracy nut', temper: 0.6, nerve: 0.4, follow: 0.2, pre: ['Wake up, people.', 'It\'s all connected.', 'Follow the money.'], post: ['The house is in on it.', 'Do your own research.'],
    lines: {
      saw: ['I saw {x} {phrase}. And that\'s just what they WANTED me to see.'],
      deny: ['Of course they\'d frame me. I was in {room}. I know too much.'],
      ask: ['{x}. Where were you? And who are you REALLY working for?'],
      skip: ['Voting is exactly what they want. Skip.'],
      nothing: ['I was at {place}, watching the cameras watch us.'],
      vote: ['{x}. It all leads back to {x}.'],
      lastIn: ['This is a cover-up! Look into the pretzels!'], lastOut: ['You think I worked alone? Ha.'],
      cheer: ['One down. The real ones are still out there.'], sorry: ['You see? They played us. Again.'],
    } },
  { key: 'sweet', name: 'the sweetheart', temper: 0.2, nerve: 0.5, follow: 0.6, pre: ['Oh, sweetie.', 'Guys, please.', 'I hate this.'], post: ['Let\'s be kind about it.', 'I\'m so sorry.'],
    lines: {
      saw: ['I hate saying this, but I saw {x} {phrase}. I\'m so sorry, {x}.'],
      deny: ['Me? I was in {room}! I could never hurt anybody!'],
      ask: ['{x}, honey, where were you? Just so we can clear you.'],
      skip: ['I don\'t want to throw out someone innocent. Can we skip?'],
      nothing: ['I was at {place}. I didn\'t see anything. I wish I had.'],
      vote: ['I\'m so sorry, {x}. I have to.'],
      lastIn: ['I forgive you. But you\'re wrong.'], lastOut: ['Surprise. Sweet ones bite.'],
      cheer: ['Oh, thank goodness.'], sorry: ['Oh no. Oh, they were so nice.'],
    } },
  { key: 'nervous', name: 'the nervous wreck', temper: 0.3, nerve: 0.1, follow: 0.7, pre: ['I-I', 'Oh no oh no.', 'Okay, breathe.'], post: ['Can we go home now?', 'I need to sit down.'],
    lines: {
      saw: ['I s-saw {x} {phrase}! I\'m not crazy! I saw it!'],
      deny: ['N-no! I was in {room}! I can\'t even hold a fork right!'],
      ask: ['{x}? W-where were you? Please have an answer.'],
      skip: ['I can\'t. I can\'t pick. Skip. I\'m sorry.'],
      nothing: ['I was at {place}, hiding. I didn\'t see anything. I didn\'t WANT to.'],
      vote: ['{x}. I-I think. Yes. {x}.'],
      lastIn: ['No no no, please, I didn\'t do it!'], lastOut: ['All that shaking? Acting. Mostly.'],
      cheer: ['Oh thank god. Thank god.'], sorry: ['We\'re all going to die in here.'],
    } },
  { key: 'chef', name: 'the chef', temper: 0.6, nerve: 0.7, follow: 0.4, pre: ['Something smells off.', 'Chef\'s opinion:', 'Mamma mia.'], post: ['That story\'s half-baked.', 'Chef\'s kiss.'],
    lines: {
      saw: ['I saw {x} {phrase}. Cold. Like a soup that sat out all night.'],
      deny: ['Me? I was in {room}. My hands are for cooking, not killing.'],
      ask: ['{x}. Where were you? Your story needs more seasoning.'],
      skip: ['This case is undercooked. Skip.'],
      nothing: ['I was at {place}. Didn\'t see a thing. Didn\'t taste one either.'],
      vote: ['{x}. That alibi was raw.'],
      lastIn: ['You\'re all overcooked! I\'m innocent!'], lastOut: ['Revenge is a dish best served on the house.'],
      cheer: ['Order up!'], sorry: ['We burned that one.'],
    } },
  { key: 'dj', name: 'the DJ', temper: 0.2, nerve: 0.8, follow: 0.5, pre: ['Bro.', 'Okay, real talk.', 'Not gonna lie,'], post: ['Not the vibe.', 'Bad energy.'],
    lines: {
      saw: ['Bro, I saw {x} {phrase}. Totally killed the vibe.'],
      deny: ['Nah, I was in {room}, vibing. Headphones on. Wasn\'t me.'],
      ask: ['{x}, where were you at, bro?'],
      skip: ['No proof, no drop. Skip.'],
      nothing: ['I was at {place}. Had my headphones on. Missed it.'],
      vote: ['{x}. The energy\'s off.'],
      lastIn: ['Wrong track, guys. Wrong track.'], lastOut: ['Yeah. That was my set. Mic drop.'],
      cheer: ['Let\'s GO!'], sorry: ['Oof. Not the vibe at all.'],
    } },
  { key: 'comic', name: 'the comedian', temper: 0.3, nerve: 0.6, follow: 0.5, pre: ['Tough crowd.', 'So a killer walks into a casino...', 'Okay, okay.'], post: ['I\'m here all week. Hopefully.', 'At least the drinks are free.'],
    lines: {
      saw: ['I saw {x} {phrase}. And not in a funny way.', 'True story: {x} {phrase}. I wish I was joking.'],
      deny: ['Me? I was in {room}. The only thing I kill is the room.'],
      ask: ['{x}, where were you? And make it funny, it\'s been a rough night.'],
      skip: ['If we vote now, the killer gets the last laugh. Skip.'],
      nothing: ['I was at {place}, losing money. Which is the real crime here.'],
      vote: ['{x}. No offense. A little offense.'],
      lastIn: ['Wow. Tough crowd. Tough, wrong crowd.'], lastOut: ['Thank you, thank you, I\'ll be here all... oh.'],
      cheer: ['And THAT\'S the punchline!'], sorry: ['Well, that joke didn\'t land.'],
    } },
];

// Lines everyone can say (persona lines win when they have one).
const SHARED = {
  saw: ['I SAW {x} {phrase}!', 'It\'s {x}. I watched {x} {phrase}.'],
  sawFake: ['I saw {x} {phrase}... but {x} was already dead. Someone is wearing their face.', 'This is going to sound crazy. I saw {x} {phrase}. A dead {x}. Somebody\'s in disguise.'],
  sent: ['{x} sent {v} a drink right before. That drink was poisoned.', '{x} bought {v} that drink. I saw it at the bar.'],
  scream: ['I heard a scream from {room}.', 'There was a scream. It came from {room}.'],
  screamNear: ['{x} was in there just before.', 'And guess who was in {room} right then? {x}.'],
  lastNear: ['Last I saw {v}, {x} was right next to them in {room}.', '{x} was with {v} in {room}, right before.'],
  bowl: ['{x} was at that snack bowl.', '{x} was hanging around the pretzels.'],
  distrust: ['I still don\'t trust {x}.', 'Something about {x} isn\'t right.', '{x} has been acting weird all night.'],
  nothing: ['I was at {place}. Didn\'t see anything.', 'I was busy losing money at {place}, sorry.', 'No idea. Somebody start talking.'],
  alibi: ['I was at {place}, in {room}.', '{room}. At {place}. The whole time.'],
  alibiWith: ['I was in {room}. {y} was there too. Ask {y}.', '{room}, with {y}. {y} can tell you.'],
  ask: ['{x}, where were you?', '{x}, you\'ve been quiet. Where were you when it happened?'],
  contra: ['That\'s a lie, {x}. You said {room}, but I saw you in {room2}.', 'Wait. {x}, I saw you in {room2}, not {room}. Why are you lying?'],
  passing: ['I was passing through! I went to {room} after.', 'I moved around, okay? I was in {room2} for a second, then {room}.'],
  vouch: ['That\'s true. {x} was in {room} with me.', '{x}\'s telling the truth. I saw them in {room}.'],
  falseVouch: ['{x} was with me. It\'s not {x}.', 'Leave {x} alone, they were in {room} with me.'],
  defend: ['It wasn\'t me! I was in {room}.', 'Why would I do that? I was in {room}!'],
  counter: ['That\'s a lie. {x} is trying to pin this on me.', 'Funny, {x}. You\'re pointing fingers awfully fast.', 'Says the one who can\'t account for their night. Right, {x}?'],
  frame: ['{x} was alone with {v} right before. Just saying.', 'I saw {x} sneaking around {room}.', '{x} was in {room} when it happened. I saw them.'],
  frameMachine: ['{x} was messing with machines all night.', 'I saw {x} fiddling with the tables in {room}.'],
  frameBar: ['{x} was at the bar sending drinks around.', 'I saw {x} hand something to the bartender.'],
  bandwagon: ['I\'m with {y}. It\'s {x}.', 'Yeah. {x}. I\'ve been thinking it too.', '{y}\'s right about {x}.'],
  grief: ['Poor {v}. {v} didn\'t deserve that.', '{v} was my friend. Whoever did this, I\'m coming for you.', 'I just talked to {v}. I can\'t believe it.'],
  fakeGrief: ['Poor {v}. I can\'t believe it.', 'Not {v}. Who would do this?'],
  fear: ['We\'re dropping like flies.', 'I don\'t want to be next.', 'I\'m not going anywhere alone again.'],
  vote: ['I\'m voting {x}.', '{x}. Sorry.'],
  skip: ['We have no proof. Skip.', 'Skip. I don\'t want to throw out an innocent.'],
  switch: ['Fine. Everyone\'s on {x}. So am I.', 'Okay, you\'ve convinced me. {x}.', 'Changing my vote. {x}.'],
  lastIn: ['You\'re making a mistake! I\'m innocent!', 'Remember this when the next body drops.'],
  lastOut: ['Heh. Took you long enough.', 'You got me. Watch your drinks.'],
  lastDeny: ['I\'m innocent, I swear!', 'You\'ll regret this.'],
  cheer: ['I TOLD you!', 'Got them!'],
  sorry: ['Oh no. They were innocent.', 'That\'s on all of us.'],
  shock: ['I can\'t believe it was {x}.', '{x}? Really? Wow.'],
  smugQuiet: ['Well. We tried.', 'Tough break, everyone.'],
  meQ: ['Me? What about me?', 'Why are you looking at me?', 'Hey, leave me out of this.'],
  thanks: ['Thank you, {x}.', 'See? {x} gets it.'],
  agreeHuman: ['{x} has a point.', 'Listen to {x}.'],
  doubtHuman: ['How do we know {x} isn\'t the killer?', 'Convenient, {x}.'],
};

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// "in the casino floor" -> "on the casino floor", and so on
const tidy = t => t.replace(/([.?!]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/\b(in|at) the casino floor\b/g, 'on the casino floor').replace(/\bin the duck pond\b/g, 'at the duck pond').replace(/\bat the back alley\b/g, 'in the back alley');
const ROOM_WORDS = { bar: /\bbar\b|drink/, rest: /rest ?room|bathroom|toilet|loo|sink/, floor: /floor|roulette|blackjack|\bbj\b|pit\b|bell/, arcade: /arcade|plinko|crash|mines|tower/,
  race: /pond|duck/, slots: /slot|jackpot/, alley: /alley|dice|wheel|coin/, vip: /\bvip\b|lounge/ };
const SURVIVOR = ['Somebody poisoned my {kind}! I almost DIED!', 'My {kind} was poisoned. I made it to the antidote with seconds to spare.', 'Someone tried to kill me. With a {kind}. On the house, they said.'];
// smelled it and never drank it: no antidote, no near death
const SNIFFED = ['Somebody sent me a poisoned {kind}! I smelled it just in time.', 'Bitter almonds in my {kind}. Somebody wants me dead.', 'Someone tried to kill me. With a {kind}. On the house, they said.'];
const SAME = ['Same. Nothing.', 'Nothing from me.', 'I got nothing.', 'Didn\'t see it. Sorry.'];
function fill(t, v) {
  return t.replace(/\{(x|X|v|y|room|room2|phrase|place|kind)\}/g, (_, k) => k === 'X' ? cap(v.x || '') : (v[k] ?? ''));
}

export function makeTalk(G, h) {
  const { byId, trust, humans, sfxTo, GAME_NAMES } = h;
  const P = c => PERSONAS[c.id % PERSONAS.length];
  const rn = r => (ROOMS[r] ? ROOMS[r].name : 'somewhere');
  const placeOf = r => ({ bar: 'the bar', rest: 'the sinks', floor: pick(['the roulette table', 'blackjack', 'roulette']), arcade: pick(['Plinko', 'Crash', 'Mines']), race: 'the duck race', slots: 'the slots', alley: pick(['the dice game', 'the prize wheel']), vip: 'the VIP lounge' })[r] || 'the tables';

  // ---------- Moods ----------
  const mood = c => c.mood || (c.mood = { fear: 0.15, anger: 0.1, grief: 0, smug: c.isKiller ? 0.3 : 0 });
  function feel(c, k, d) { const m = mood(c); m[k] = clamp(m[k] + d, 0, 1); }
  function emo(c) {
    const m = mood(c); let best = 'calm', v = 0.42;
    for (const k of ['anger', 'fear', 'grief', 'smug']) if (m[k] > v) { v = m[k]; best = k; }
    return best;
  }
  // how a line comes out depends on who says it and how they feel
  const PRE = new Set(['saw', 'deny', 'ask', 'skip', 'vote', 'distrust', 'frame', 'frameBar', 'frameMachine', 'counter', 'bandwagon', 'alibi', 'scream', 'nothing']);
  const POST = new Set(['saw', 'deny', 'skip', 'distrust', 'frame', 'frameBar', 'frameMachine', 'counter', 'vote']);
  const NAMES = () => new Set(G.chars.map(o => o.name));
  function lower(t) {
    const w = t.split(/[\s,.!?']/)[0];
    return w === 'I' || /^[A-Z]{2}/.test(t) || NAMES().has(w) || /^(The|VIP|Plinko|Crash|Mines)\b/.test(w) ? t : t.charAt(0).toLowerCase() + t.slice(1);
  }
  function voice(c, key, vars) {
    const p = P(c), own = p.lines[key];
    let t = own && (Math.random() < 0.75 || !SHARED[key]) ? pick(own) : pick(SHARED[key] || own || ['...']);
    t = cap(fill(t, vars || {}));
    if (PRE.has(key) && Math.random() < 0.3) { const pre = pick(p.pre); t = pre + ' ' + (/[.!?]$/.test(pre) ? t : lower(t)); }
    else if (POST.has(key) && Math.random() < 0.2) t = t + ' ' + pick(p.post);
    const e = emo(c);
    if (e === 'anger' && mood(c).anger > 0.7) t = t.replace(/\.$/, '!');
    if (e === 'fear' && mood(c).fear > 0.8 && Math.random() < 0.25 && !p.pre.some(x => t.startsWith(x))) t = pick(['Oh god. ', 'Okay. Okay. ', 'Please. ']) + t;
    return t;
  }

  // ---------- Memory: where everyone was ----------
  // c.trail: { t, room } every couple of seconds; v.seenLog[id]: where v saw id, and when
  function roomAt(c, t) {
    const tr = c.trail || []; let r = null;
    for (const e of tr) { if (e.t > t) break; r = e.room; }
    return r || (tr[0] && tr[0].room) || 'floor';
  }
  function sawAt(v, id, t, win) { return (v.seenLog && v.seenLog[id] || []).filter(e => Math.abs(e.t - t) < win); }

  // ---------- Opening statements (the evidence) ----------
  function opener(b, ctx, out) {
    const acc = {}; const parts = [];
    const add = (id, n) => { acc[id] = (acc[id] || 0) + n; };
    const { victims, poisoned, rigged, T } = ctx;
    const vName = victims.length ? byId(victims[0].id).name : '';
    if (b.isKiller) {
      const others = G.chars.filter(c => c.alive && c !== b && !c.isKiller && c.id !== ctx.survivor && c.id !== ctx.caller);
      const accusedMe = out.find(l => l.acc[b.id] > 0);
      if (victims.length && Math.random() < 0.25) parts.push(voice(b, 'fakeGrief', { v: vName }));
      if (accusedMe && Math.random() < 0.7) { const liar = byId(accusedMe.who); add(liar.id, 40); parts.push(voice(b, 'counter', { x: liar.name })); }
      else if (Math.random() < 0.6 && others.length) {
        // frame someone who really was around, if possible
        const near = others.filter(o => victims.some(v => roomAt(o, T) === roomAt(byId(v.id), T)));
        const x = near.length && Math.random() < 0.7 ? pick(near) : pick(others);
        const key = poisoned.length ? 'frameBar' : rigged ? 'frameMachine' : 'frame';
        add(x.id, key === 'frame' ? 25 : 35); parts.push(voice(b, key, { x: x.name, v: vName, room: rn(roomAt(x, T)) }));
      } else parts.push(voice(b, 'nothing', { place: placeOf(lieRoom(b, ctx)) }));
      return { who: b.id, text: parts.join(' '), acc, emo: emo(b) };
    }
    if (b.id === ctx.survivor) { feel(b, 'fear', 0.6); feel(b, 'anger', 0.4); parts.push(fill(pick(ctx.sniffed ? SNIFFED : SURVIVOR), { kind: ctx.kind || 'drink' })); }
    if (victims.some(v => b.friend === v.id)) { feel(b, 'grief', 0.6); parts.push(voice(b, 'grief', { v: byId(b.friend).name })); }
    for (const w of b.witnessed.filter(w => !w.used && w.hard)) {
      w.used = true;
      if (w.fake) parts.push(voice(b, 'sawFake', { x: byId(w.who).name, phrase: w.phrase }));
      else { add(w.who, w.what === 'rig' || w.what === 'chandelier' ? 80 : 120); parts.push(voice(b, 'saw', { x: byId(w.who).name, phrase: w.phrase })); feel(b, 'anger', 0.2); }
    }
    for (const w of b.witnessed.filter(w => !w.used && !w.hard && w.what === 'send' && poisoned.includes(w.victim))) {
      w.used = true;
      if (!w.fake && byId(w.who).alive) { add(w.who, 60); parts.push(voice(b, 'sent', { x: byId(w.who).name, v: byId(w.victim).name })); }
    }
    for (const v of victims.filter(v => v.cause === 'poison' && String(v.drinkId).startsWith('bowl'))) {
      const sus = [...(b.touches[v.drinkId] || [])].filter(id => id !== b.id && id !== v.id && byId(id).alive);
      if (sus.length) { const x = byId(pick(sus)); add(x.id, 35); parts.push(voice(b, 'bowl', { x: x.name })); }
    }
    for (const hd of b.heard.filter(hd => !hd.used)) {
      hd.used = true;
      parts.push(voice(b, 'scream', { room: rn(hd.room) }));
      const near = Object.entries(b.lastSeen).filter(([id, s]) => +id !== hd.victim && s.room === hd.room && hd.t - s.t < 25 && s.t <= hd.t + 1 && byId(id).alive);
      if (near.length) { const x = byId(pick(near)[0]); add(x.id, 30); parts.push(voice(b, 'screamNear', { x: x.name, room: rn(hd.room) })); }
    }
    if (!Object.keys(acc).length) for (const v of victims.filter(v => v.cause !== 'poison')) {
      const ls = b.lastSeen[v.id];
      if (ls && ls.with.length && G.t - ls.t < 60) { const x = byId(pick(ls.with)); if (x !== b && x.alive) { add(x.id, 25); parts.push(voice(b, 'lastNear', { x: x.name, v: byId(v.id).name, room: rn(ls.room) })); } }
    }
    if (!Object.keys(acc).length) {
      const top = Object.entries(b.sus).filter(([id]) => +id !== b.id && byId(id).alive).sort((x, y) => y[1] - x[1])[0];
      if (top && top[1] > 20) { acc[top[0]] = 15; parts.push(voice(b, 'distrust', { x: byId(top[0]).name })); }
      else if (!parts.length) {
        if (b.id !== ctx.caller && Math.random() < 0.45) return null; // nothing to add: stays quiet
        parts.push(mood(b).fear > 0.5 && Math.random() < 0.5 ? voice(b, 'fear', {}) : Math.random() < 0.3 ? pick(SAME) : voice(b, 'nothing', { place: b.seat ? GAME_NAMES[b.seat.game] : placeOf(roomAt(b, T)) }));
      }
    }
    return { who: b.id, text: parts.join(' '), acc, emo: emo(b) };
  }
  // A killer's alibi: the truth if the truth is safe, otherwise a busy room they weren't in.
  function lieRoom(k, ctx) {
    const truth = roomAt(k, ctx.T);
    const hot = new Set(ctx.victims.map(v => roomAt(byId(v.id), ctx.T)));
    if (!hot.has(truth)) return truth;
    const busy = {}; for (const c of G.chars) if (c.alive && c !== k) { const r = roomAt(c, ctx.T); busy[r] = (busy[r] || 0) + 1; }
    const opts = Object.keys(ROOMS).filter(r => !hot.has(r) && r !== 'rest');
    return opts.sort((a, b) => (busy[b] || 0) - (busy[a] || 0))[Math.random() < 0.6 ? 0 : 1] || 'bar';
  }

  // ---------- The meeting ----------
  function open(m, victims, spiked, caller) {
    const T = victims.length ? Math.min(...victims.map(v => v.t)) : G.t - 15;
    const poisoned = victims.filter(v => v.cause === 'poison').map(v => v.id);
    if (spiked && spiked.owner !== undefined) poisoned.push(spiked.owner);
    const ctx = { victims, poisoned, rigged: victims.some(v => v.cause === 'trap') || !!(spiked && spiked.trap), T,
      survivor: spiked && spiked.owner !== undefined && byId(spiked.owner).alive ? spiked.owner : null, kind: spiked && spiked.kind, sniffed: !!(spiked && spiked.sniffed), caller: caller ? caller.id : null };
    for (const c of G.chars) if (c.alive) { if (c.isKiller) feel(c, 'smug', 0.12); else feel(c, 'fear', 0.18 * victims.length + 0.08); }
    const order = shuffle(G.chars.filter(c => c.alive && !c.isHuman));
    if (caller && !caller.isHuman && order.includes(caller)) { order.splice(order.indexOf(caller), 1); order.unshift(caller); }
    const openers = [];
    for (const b of order) { const o = opener(b, ctx, openers); if (o) openers.push(o); }
    const alive = G.chars.filter(c => c.alive).length;
    m.talk = { ctx, openers, replies: [], claims: {}, asked: new Set(), askedOf: new Set(), defended: {}, said: 0, budget: Math.min(26, openers.length + Math.ceil(alive * 0.7) + 2), lastLine: null };
  }
  // the next line of the meeting, or null when everyone has had their say
  function next(m, repliesOnly) {
    const k = m.talk; if (!k) return null;
    if (!repliesOnly && k.said >= k.budget + 12) return null; // enough talk
    let l = k.replies.shift();
    if (!l && !repliesOnly && k.openers.length) l = k.openers.shift();
    if (!l && !repliesOnly && k.said < k.budget) l = spontaneous(m);
    if (!l) return null;
    const sp = byId(l.who);
    if (!sp || (!sp.alive && !l.last)) return next(m, repliesOnly);
    if (l.build) { const built = l.build(); if (!built) return next(m); Object.assign(l, built); }
    l.text = tidy(l.text);
    k.said++; k.lastLine = l;
    if (m.phase === 'talk') react(m, l);
    return { who: l.who, text: l.text, acc: l.acc || {}, emo: l.emo || emo(sp) };
  }
  // what a line sets off: the accused answers, people back each other up or pile on
  function react(m, l) {
    const k = m.talk, sp = byId(l.who);
    for (const id in l.acc || {}) {
      const x = byId(id), n = l.acc[id];
      if (!x || !x.alive || n <= 0) continue;
      feel(x, 'anger', 0.35 * P(x).temper + 0.1); feel(x, 'fear', 0.3 * (1 - P(x).nerve)); feel(sp, 'anger', 0.1 * P(sp).temper);
      if (x.isHuman || k.replies.some(r => r.who === x.id)) continue;
      if (n >= 25 && Math.random() < 0.85 && (k.defended[x.id] || 0) < 2) { k.defended[x.id] = (k.defended[x.id] || 0) + 1; k.replies.push({ who: x.id, build: () => defend(x, sp) }); }
      // someone who already suspects x piles on
      const pile = G.chars.filter(o => o.alive && !o.isHuman && o !== sp && o !== x && (o.sus[x.id] > 40 || (o.isKiller && !x.isKiller && Math.random() < 0.4)));
      if (pile.length && Math.random() < 0.45) { const o = pick(pile); k.replies.push({ who: o.id, acc: { [x.id]: 15 }, build: () => ({ text: voice(o, 'bandwagon', { x: x.name, y: sp.name }) }) }); }
    }
  }
  // accused: answer with where you were (a lie if you're a killer and the truth would hurt), or hit back
  function defend(x, accuser) {
    const k = G.meeting.talk;
    if (k.claims[x.id] !== undefined) { // already said where they were
      const again = cap(fill(pick(['I already told you. I was in {room}.', 'How many times? {room}!', 'I said {room}. Are you even listening?']), { room: rn(k.claims[x.id]) }));
      return x.isKiller && accuser && Math.random() < 0.5 ? { text: voice(x, 'counter', { x: accuser.name }), acc: { [accuser.id]: 25 } } : { text: again, acc: {} };
    }
    const room = x.isKiller ? lieRoom(x, k.ctx) : roomAt(x, k.ctx.T);
    k.claims[x.id] = room;
    let text, acc = {};
    if (x.isKiller && accuser && Math.random() < 0.45) { text = voice(x, 'counter', { x: accuser.name }); acc[accuser.id] = 30; }
    else {
      const with_ = G.chars.filter(o => o.alive && o !== x && roomAt(o, k.ctx.T) === room && (!x.isKiller || o.isKiller));
      text = voice(x, 'deny', { room: rn(room), place: placeOf(room) });
      if (with_.length && Math.random() < 0.5) text += ' ' + fill(pick(['Ask {y}, {y} was there.', '{y} saw me there.']), { y: pick(with_).name });
    }
    queueChecks(x, room);
    return { text, acc };
  }
  // after a claim, whoever saw otherwise says so; whoever saw the same backs it up
  function queueChecks(x, room) {
    const k = G.meeting.talk, T = k.ctx.T;
    for (const o of shuffle(G.chars.filter(o => o.alive && !o.isHuman && o !== x))) {
      if (o.isKiller) {
        if (x.isKiller && Math.random() < 0.35) { k.replies.push({ who: o.id, acc: { [x.id]: -20 }, build: () => ({ text: voice(o, 'falseVouch', { x: x.name, room: rn(room) }) }) }); return; }
        continue;
      }
      const seen = sawAt(o, x.id, T, 6);
      if (!seen.length) continue;
      const other = seen.find(e => e.room !== room);
      if (other) {
        k.replies.push({ who: o.id, acc: { [x.id]: 50 }, build: () => { feel(x, 'fear', 0.3); feel(o, 'anger', 0.2); return { text: voice(o, 'contra', { x: x.name, room: rn(room), room2: rn(other.room) }) }; } });
        if (!x.isHuman) k.replies.push({ who: x.id, build: () => x.isKiller && Math.random() < 0.5 ? { text: voice(x, 'counter', { x: o.name }), acc: { [o.id]: 25 } } : { text: voice(x, 'passing', { room: rn(room), room2: rn(other.room) }), acc: {} } });
      } else k.replies.push({ who: o.id, acc: { [x.id]: -30 }, build: () => ({ text: voice(o, 'vouch', { x: x.name, room: rn(room) }) }) });
      return;
    }
  }
  // someone with a suspicion asks a question
  function spontaneous(m) {
    const k = m.talk;
    const askers = shuffle(G.chars.filter(c => c.alive && !c.isHuman && !k.asked.has(c.id)));
    for (const a of askers) {
      const top = Object.entries(a.sus).filter(([id]) => +id !== a.id && byId(id).alive && k.claims[id] === undefined && !k.askedOf.has(+id) && !(a.isKiller && byId(id).isKiller)).sort((x, y) => y[1] - x[1])[0];
      const x = top && (top[1] > 10 || Math.random() < 0.3) ? byId(top[0]) : null;
      if (!x) continue;
      k.asked.add(a.id); k.askedOf.add(x.id);
      if (!x.isHuman) k.replies.push({ who: x.id, build: () => answer(x) });
      else h.tell(x, `${a.name} asked where you were. Answer in the chat (say a room).`);
      return { who: a.id, text: voice(a, 'ask', { x: x.name }), acc: { [x.id]: 5 } };
    }
    return null;
  }
  function answer(x) {
    const k = G.meeting.talk;
    const room = x.isKiller ? lieRoom(x, k.ctx) : roomAt(x, k.ctx.T);
    k.claims[x.id] = room;
    const with_ = G.chars.filter(o => o.alive && o !== x && roomAt(o, k.ctx.T) === room && (!x.isKiller || o.isKiller));
    const text = with_.length && Math.random() < 0.5 ? voice(x, 'alibiWith', { room: rn(room), y: pick(with_).name }) : room === 'bar' || room === 'vip' ? cap(fill('I was in {room}.', { room: rn(room) })) : voice(x, 'alibi', { room: rn(room), place: placeOf(room) });
    queueChecks(x, room);
    return { text, acc: {} };
  }

  // ---------- Players talking ----------
  function hear(m, c, text) {
    const k = m.talk; if (!k) return;
    const low = text.toLowerCase();
    const named = G.chars.filter(o => o.alive && o !== c && low.includes(o.name.toLowerCase()));
    const claim = /\bi was\b|\bi'?m\b|\bme\b|^at |^in |^on /.test(low) && Object.entries(ROOM_WORDS).find(([, re]) => re.test(low));
    if (claim && k.claims[c.id] === undefined && m.phase !== 'result') { k.claims[c.id] = claim[0]; queueChecks(c, claim[0]); }
    if (!named.length) return;
    const x = named[0];
    if (/where (were|was)|alibi|where.*you/.test(low)) { if (!x.isHuman) k.replies.unshift({ who: x.id, build: () => answer(x) }); return; }
    if (/(not|isn'?t|wasn'?t|innocent|trust|with me|clear)/.test(low) && !/(don'?t trust|killer)/.test(low)) {
      m.extra.push({ who: c.id, acc: { [x.id]: -25 } });
      if (!x.isHuman) k.replies.unshift({ who: x.id, build: () => ({ text: voice(x, 'thanks', { x: c.name }) }) });
      return;
    }
    if (/(saw|it'?s|it was|killer|did it|sus|vote|liar|lying|guilty|murder)/.test(low)) {
      m.extra.push({ who: c.id, acc: { [x.id]: 35 } });
      if (!x.isHuman) k.replies.unshift({ who: x.id, build: () => defend(x, c) });
      // the room weighs in: someone who agrees, or someone who doubts the accuser
      const o = pick(G.chars.filter(o => o.alive && !o.isHuman && o !== x));
      if (o) {
        const agrees = o.sus[x.id] > o.sus[c.id] + 10 || (o.isKiller && !x.isKiller);
        k.replies.push({ who: o.id, acc: agrees ? { [x.id]: 10 } : { [c.id]: 10 }, build: () => ({ text: voice(o, agrees ? 'agreeHuman' : 'doubtHuman', { x: c.name }) }) });
      }
      return;
    }
    if (!x.isHuman) k.replies.unshift({ who: x.id, build: () => ({ text: voice(x, 'meQ', {}) }) });
  }

  // ---------- Votes: bots make up their minds one by one, and the room can swing them ----------
  function startVote(m) {
    for (const c of G.chars) if (c.alive && !c.isHuman) {
      const p = P(c), mo = mood(c);
      c.voteAt = rand(1.5, CFG.voteTime * 0.55) * (1 - 0.4 * Math.max(mo.anger, mo.fear)) * (c.isKiller ? 1.1 : 1);
      c.voted = null; c.switched = false;
    }
  }
  function tally() { const t = {}; for (const c of G.chars) if (c.alive && c.voted !== null && c.voted >= 0) t[c.voted] = (t[c.voted] || 0) + 1; return t; }
  function decide(b) {
    const alive = G.chars.filter(c => c.alive), t = tally(), p = P(b);
    const score = {};
    for (const c of alive) score[c.id] = c === b || (b.isKiller && c.isKiller) ? -999 : b.sus[c.id];
    for (const st of G.meeting.extra) {
      const sp = byId(st.who); const tr = trust(b, sp);
      for (const id in st.acc) {
        if (+id === b.id && !b.isKiller) { if (st.acc[id] > 0) b.sus[sp.id] += 45; continue; } // they know that's a lie
        if (score[id] !== undefined && score[id] > -999) score[id] += st.acc[id] * tr;
      }
    }
    for (const id in score) score[id] += rand(-8, 8) + (t[id] || 0) * 4 * p.follow;
    const best = Object.entries(score).sort((x, y) => y[1] - x[1])[0];
    const need = CFG.voteThreshold + Math.max(0, alive.length - 7) * CFG.voteThresholdPer;
    return best && best[1] >= need ? +best[0] : -1;
  }
  // bots make up their minds; anything they say joins the reply queue
  function voteTick(m, dt) { const l = voteStep(m, dt); if (l) m.talk.replies.push(l); }
  function voteStep(m, dt) {
    const alive = G.chars.filter(c => c.alive);
    for (const b of alive) {
      if (b.isHuman || b.voted !== null) continue;
      b.voteAt -= dt;
      if (b.voteAt > 0) continue;
      b.voted = decide(b);
      const sayIt = Math.random() < 0.35 + 0.4 * mood(b).anger;
      if (sayIt) return { who: b.id, text: b.voted >= 0 ? voice(b, 'vote', { x: byId(b.voted).name }) : voice(b, 'skip', {}), acc: {}, emo: emo(b) };
    }
    // when the room lines up behind someone, the easily swayed follow
    const t = tally(), top = Object.entries(t).sort((x, y) => y[1] - x[1])[0];
    if (top && top[1] >= Math.max(2, alive.length * 0.35)) {
      const lead = +top[0];
      for (const b of shuffle(alive)) {
        if (b.isHuman || b.voted === null || b.voted === lead || b.switched || b.id === lead) continue;
        if (b.isKiller && byId(lead).isKiller) continue;
        if (b.voted >= 0 && b.sus[b.voted] > 40) continue; // sure of their own pick
        if (Math.random() < P(b).follow * dt * 0.12) { b.switched = true; b.voted = lead; return { who: b.id, text: voice(b, 'switch', { x: byId(lead).name }), acc: {}, emo: emo(b) }; }
      }
    }
    return null;
  }
  const allVoted = () => G.chars.every(c => !c.alive || c.voted !== null);

  // ---------- After the vote ----------
  function after(m, ej) {
    const k = m.talk || (m.talk = { replies: [] });
    k.replies = [];
    const out = [];
    if (ej && !ej.isHuman) {
      const key = ej.isKiller ? (Math.random() < 0.55 ? 'lastOut' : 'lastDeny') : 'lastIn';
      out.push({ who: ej.id, text: voice(ej, key, {}), emo: ej.isKiller ? 'smug' : 'anger', last: true });
    }
    const alive = shuffle(G.chars.filter(c => c.alive && !c.isHuman));
    let n = 0;
    for (const c of alive) {
      if (n >= 3) break;
      if (!ej) { if (Math.random() < 0.25) { out.push({ who: c.id, text: voice(c, c.isKiller ? 'smugQuiet' : 'fear', {}) }); n++; } continue; }
      const votedRight = c.voted === ej.id;
      if (ej.isKiller) {
        if (c.isKiller) { if (Math.random() < 0.5) { out.push({ who: c.id, text: voice(c, 'shock', { x: ej.name }) }); n++; } }
        else if (votedRight && Math.random() < 0.6) { out.push({ who: c.id, text: voice(c, 'cheer', { x: ej.name }), emo: 'smug' }); feel(c, 'smug', 0.3); n++; }
      } else if (c.isKiller) { if (Math.random() < 0.3) { out.push({ who: c.id, text: voice(c, 'smugQuiet', {}) }); n++; } }
      else if (Math.random() < 0.5) { out.push({ who: c.id, text: voice(c, 'sorry', {}), emo: 'grief' }); feel(c, 'grief', 0.2); n++; }
    }
    k.replies = out;
    // moods cool down between meetings
    for (const c of G.chars) if (c.mood) for (const key in c.mood) c.mood[key] *= 0.75;
  }

  return { open, next, hear, startVote, voteTick, allVoted, tally, after, feel, decide, PERSONAS };
}
