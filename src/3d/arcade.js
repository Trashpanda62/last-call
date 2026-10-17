import * as THREE from 'three';
import { FLAPPY } from '../flappy.js';
import { ARCADE } from '../arcade.js';
import { ARCADE_CABS } from '../map.js';
import { MAT, v3, box, rbox, cyl, sph, basicGlow } from './world.js';
import * as T from './textures.js';

export function buildArcade(ctx, seats, screen, updaters, betSocket, actionButton, focusAt) {
  const { group, lightSpots } = ctx, batch = ctx.B;
  const wood = new THREE.MeshStandardMaterial({ map: T.wood('#67452c', '#302116'), roughness: .5 });
  const bed = new THREE.MeshStandardMaterial({ color: 0x173d32, roughness: .75 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa7d8d0, transparent: true, opacity: .07, roughness: .2, depthWrite: false, side: THREE.DoubleSide });
  const coinGeo = cyl(.052, .052, .015, 20), prizeGeo = sph(.085, 14);
  for (const c of ARCADE_CABS) {
    const seat = seats.find(s => s.game === c.game), root = new THREE.Group(); root.name = 'arcade-' + c.game;
    const yaw=-Math.PI/2, axis=v3(0,1,0), origin=v3(c.x/60,0,c.y/60);
    root.position.copy(origin);root.rotation.y=yaw;group.add(root);
    const B={add:(g,m,p)=>batch.add(g,m,p,yaw)};
    const pos = (x,y,z) => v3(x,y,z).applyAxisAngle(axis,yaw).add(origin);
    const add = (geo,mat,x,y,z,name) => { const m = new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(name)m.name=name;root.add(m);return m; };
    if(c.game==='flappy') {
      root.rotation.y=Math.PI; // South-wall cabinet faces north; leave the doorway/promenade clear.
      const fp=(x,y,z)=>v3(c.x/60-x,y,c.y/60-z);
      const cabinet=(g,m,x,y,z)=>batch.add(g,m,fp(x,y,z),Math.PI);
      cabinet(rbox(1.18,.90,.85,.045),MAT.blackGloss,0,.45,0);
      cabinet(rbox(1.18,1.26,.25,.04),MAT.darkWood,0,1.53,-.25);
      for(const x of[-.6,.6])cabinet(box(.035,2.2,.9),MAT.gold,x,1.1,0);
      cabinet(rbox(1.2,.12,.96,.025),MAT.blackGloss,0,2.23,0);
      cabinet(rbox(1.2,.08,.42,.025),MAT.darkWood,0,.94,.30);
      betSocket(seat,'main',fp(-.33,.985,.32),'BET',.105);
      actionButton(seat,'btn:start','START',fp(.04,.985,.32),'#278459',.075);
      actionButton(seat,'btn:drop','FLAP',fp(.34,.985,.32),'#a0672c',.10);
      const face=screen({w:1.05,h:1.10,cw:630,ch:660,pos:fp(0,1.59,-.105),yaw:Math.PI,seat:seat.id,every:1/60,far:18,
        key:(t,r)=>r?.phase==='fly'?t:r?[r.id,r.phase,r.score].join(':'):'idle',
        paint:(g,w,h,t,r)=>{
          g.fillStyle='#130b12';g.fillRect(0,0,w,h);g.strokeStyle='#ba9454';g.lineWidth=6;g.strokeRect(3,3,w-6,h-6);
          const top=100,bottom=h-92,ph=bottom-top;
          g.fillStyle='#221522';g.fillRect(9,top,w-18,ph);
          const sky=T.art2('flying-pigs-sky');if(sky){g.drawImage(sky,9,top,w-18,ph);g.fillStyle='#10081344';g.fillRect(9,top,w-18,ph);}
          for(let i=0;i<25;i++){g.fillStyle='#a88d64';g.fillRect((i*137)%w,top+(i*83)%ph,2,2);}
          const pipes=r?.pipes||[{x:.8,y:.5}];
          for(const p of pipes){const x=p.x*w,bw=FLAPPY.width*w,y=bottom-p.y*ph,gap=(p.gap??FLAPPY.gap)*ph;
            g.fillStyle='#763535';g.fillRect(x-bw/2,top,bw,y-gap/2-top);g.fillRect(x-bw/2,y+gap/2,bw,bottom-y-gap/2);
            g.fillStyle='#d3b273';g.fillRect(x-bw/2-5,y-gap/2-12,bw+10,12);g.fillRect(x-bw/2-5,y+gap/2,bw+10,12);
          }
          const x=FLAPPY.x*w,y=bottom-(r?.y??.5)*ph;
          g.save();g.translate(x,y);g.rotate(-Math.max(-.6,Math.min(.8,(r?.vy||0)*-.8)));
          const pig=T.art2('flying-pigs-atlas'),frame=r?.phase==='fly'?Math.floor(t*10)%4:1;
          if(pig)g.drawImage(pig,(frame%2)*512,Math.floor(frame/2)*512,512,512,-32,-(frame<2?43:40),64,64);
          else {g.fillStyle='#e7a5a4';g.beginPath();g.ellipse(0,0,19,14,0,0,7);g.fill();}
          g.restore();
          g.textAlign='center';g.textBaseline='middle';g.font='bold 45px Georgia';g.fillStyle='#e5c27e';g.fillText('FLYING PIGS',w/2,43);
          g.font='bold 24px Arial';g.fillText(r?.phase==='done'?'PAID '+(r.bet*r.mult).toFixed(0)+' / '+r.score+' PIPES':r?.phase==='fly'?r.score+' PIPES':r?'SPACE OR FLAP TO FLY':'PLACE CHIPS / START',w/2,81);
          g.font='bold 19px Arial';g.fillText('3 PIPES 1x / 6 1.5x / 10 2x / 15 3x',w/2,h-62);g.fillText('SPACE / CLICK FLAP',w/2,h-28);
        },arg:st=>st.pub?.arcade?.flappy||null});
      face.name='flappy-screen';focusAt(seat.id,'core',face);
      lightSpots.push({p:fp(0,2.65,.6),color:0xffdca0,power:2,range:3});continue;
    }
    B.add(rbox(1.64,.82,1.48,.045),wood,pos(0,.41,0));
    B.add(rbox(1.55,.04,1.37,.018),bed,pos(0,.84,0));
    B.add(rbox(1.68,.06,.37,.025),wood,pos(0,.87,.64));
    B.add(box(1.68,.02,.025),MAT.brass,pos(0,.91,.82));
    B.add(rbox(1.62,.14,1.44,.025),wood,pos(0,1.98,0));
    for (const x of [-.78,.78]) for (const z of [-.66,.47]) B.add(box(.04,1.12,.04),MAT.brass,pos(x,1.40,z));
    for (const x of [-.76,.76]) add(box(.008,1.0,1.12),glass,x,1.40,-.10);
    add(box(1.48,1.0,.008),glass,0,1.40,-.65);
    betSocket(seat,'main',pos(-.57,.916,.67),'BET',.105);
    actionButton(seat,'btn:start','START',pos(.59,.916,.67),'#278459',.075);
    actionButton(seat,'btn:drop','DROP',pos(.36,.916,.67),'#a0672c',.085);
    actionButton(seat,'btn:left','LEFT',pos(-.27,.916,.67),'#355e76',.065);
    actionButton(seat,'btn:right','RIGHT',pos(-.06,.916,.67),'#355e76',.065);
    if (c.game === 'claw') {
      actionButton(seat,'btn:back','BACK',pos(-.27,.916,.47),'#355e76',.065);
      actionButton(seat,'btn:forward','NEAR',pos(-.06,.916,.47),'#355e76',.065);
    }
    // Payout chute faces the player; it is separate from the glass playfield.
    B.add(rbox(.55,.23,.06,.025),MAT.brass,pos(0,.46,.755));
    B.add(box(.49,.16,.025),MAT.black,pos(0,.46,.795));
    B.add(rbox(.55,.035,.20,.012),wood,pos(0,.355,.83));
    const title = c.game === 'pusher' ? 'MIDNIGHT MINT' : 'NIGHT SHIFT CLAW';
    const sign = screen({w:1.48,h:.28,cw:1024,ch:192,pos:pos(0,1.99,.735),yaw,seat:seat.id,every:.1,far:18,
      key:(_t,r)=>r?[r.id,r.used,r.score,r.phase,r.assist].join(':'):'idle',
      paint:(g,w,h,_t,r)=>{g.fillStyle='#102c27';g.fillRect(0,0,w,h);g.strokeStyle='#c59d55';g.lineWidth=7;g.strokeRect(4,4,w-8,h-8);
        g.textAlign='center';g.textBaseline='middle';g.fillStyle='#edcc84';g.font='bold 58px Georgia';g.fillText(title,w/2,54);
        g.fillStyle='#fff1d8';g.font='bold 37px Arial';g.fillText(r?(r.phase==='done'?'PAID $'+Math.round(r.bet*r.mult).toLocaleString('en-US')+' / '+r.mult.toFixed(2)+'x':r.score+' POINTS / '+((c.game==='claw'?ARCADE.clawTries:ARCADE.pusherTokens)-r.used)+' LEFT'+(r.assist?' / GOLD ASSIST':'')):(c.game==='claw'?'ONE GRAB / TAGS PAY 1x, 2x OR 3x':'ONE TOKEN / TIME THE PUSHING SHELF'),w/2,137);
        if(c.game==='pusher'){g.font='bold 24px Arial';g.fillStyle='#edcc84';g.fillText('FALLEN COINS: 1 = 1x / 2 = 2x / 3+ = 3x',w/2,175);}
      },arg:st=>st.pub?.arcade?.[c.game]||null});
    sign.name='arcade-score-'+c.game;focusAt(seat.id,'core',sign);
    if (c.game === 'pusher') {
      const pile = new THREE.InstancedMesh(coinGeo,MAT.gold,40);pile.name='pusher-coins';pile.count=35;root.add(pile);
      const shelf = add(box(1.14,.04,.32),MAT.brass,0,.876,-.42,'pusher-shelf');
      const aim = add(cyl(.04,.05,.12,16),MAT.brass,0,1.68,-.31,'pusher-chute');
      const mtx = new THREE.Matrix4(), idleCoins=Array.from({length:35},(_,i)=>({x:(i%7-3)*.115+(Math.floor(i/7)%2)*.025,z:-.14+Math.floor(i/7)*.115,y:.86}));
      updaters.push((t,dt,st)=>{const r=st.pub?.arcade?.pusher;
        const coins=r?.coins||idleCoins;
        pile.count=coins.length;coins.forEach((p,i)=>pile.setMatrixAt(i,mtx.makeTranslation(p.x,p.y,p.z)));pile.instanceMatrix.needsUpdate=true;
        shelf.position.z=r?.shelf??-.42+(1-Math.cos(t*Math.PI))*.115;aim.position.x=r?.x||0;
      });
    } else {
      const tags=[1,2,3].map(n=>basicGlow(T.plaque(String(n)+'x',{w:64,h:64,bg:'#19362c',ink:'#fff2d1',font:'bold 36px Arial',border:false}),1));
      const prizes=Array.from({length:9},(_,i)=>{const g=new THREE.Group();g.name='claw-prize-'+i;
        const mat=new THREE.MeshStandardMaterial({color:[0x7bbca2,0xdf9c56,0x9e81bb][i%3],roughness:.8});
        const body=new THREE.Mesh(prizeGeo,mat);body.scale.set(1,1.2,1);g.add(body);
        for(const side of[-1,1]){const ear=new THREE.Mesh(sph(.035,10),mat);ear.position.set(side*.06,.09,0);g.add(ear);const eye=new THREE.Mesh(sph(.009,8),MAT.black);eye.position.set(side*.027,.03,.075);g.add(eye);}
        const tag=new THREE.Mesh(new THREE.PlaneGeometry(.07,.06),tags[i%3]);tag.position.set(0,-.035,.083);g.add(tag);g.userData.tag=tag;root.add(g);return g;
      });
      for(const x of[-.58,.58]) add(box(.025,.025,1.08),MAT.chrome,x,1.84,0);
      const bridge=add(box(1.20,.035,.04),MAT.brass,0,1.84,0,'claw-bridge');
      const claw=new THREE.Group();claw.name='claw-carriage';root.add(claw);
      const cable=new THREE.Mesh(cyl(.008,.008,1,8),MAT.black);root.add(cable);
      const palm=new THREE.Mesh(cyl(.055,.065,.06,20),MAT.chrome);claw.add(palm);
      const fingers=[];for(let i=0;i<3;i++){const finger=new THREE.Mesh(box(.018,.14,.025),MAT.brass);const a=i/3*Math.PI*2;finger.position.set(Math.cos(a)*.07,-.07,Math.sin(a)*.07);claw.add(finger);fingers.push(finger);}
      updaters.push((t,dt,st)=>{const r=st.pub?.arcade?.claw,x=r?.x||0,z=r?.z||0,age=r?.phase==='drop'?r.timer:0;
        const y=age<1?1.65-age*.65:age<2?1+(age-1)*.65:1.65;
        const carry=Math.max(0,Math.min(1,(age-2)/.8));claw.position.set(x*(1-carry),y,z*(1-carry)+.90*carry);bridge.position.z=claw.position.z;
        const len=1.84-y;cable.scale.y=Math.max(.01,len);cable.position.set(claw.position.x,(1.84+y)/2,claw.position.z);
        fingers.forEach((f,i)=>{const a=i/3*Math.PI*2,k=age>=1&&age<2.8?.04:.07;f.position.x=Math.cos(a)*k;f.position.z=Math.sin(a)*k;});
        prizes.forEach((g,i)=>{const p=r?.prizes[i]||{x:(i%3-1)*.29,z:(Math.floor(i/3)-1)*.26,value:i%3+1,taken:false};g.visible=true;g.userData.tag.material=tags[p.value-1];
          if(r?.grabbed===i){const release=Math.max(0,Math.min(1,(age-2.8)/.4));g.position.copy(claw.position).setY(claw.position.y-.13-1.05*release);}else if(p.taken){const index=r.prizes.filter(q=>q.taken&&q.id<i).length;g.position.set((index-1)*.15,.47,.86);}else g.position.set(p.x,.97,p.z);
        });
      });
    }
    lightSpots.push({p:pos(0,2.45,.5),color:0xffdca0,power:3,range:4});
  }
}
