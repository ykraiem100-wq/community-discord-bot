'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const C = { bg:'#080D14', panel:'#121B27', panel2:'#192636', border:'#455A70', white:'#F1F5F9', muted:'#9BAABD', cyan:'#36D9FF', silver:'#C7D1DC', gold:'#D9B75B' };
const FONT = 'DOSArabic, Arial, sans-serif';
const root = path.resolve(__dirname, '..');
function loadFonts() {
  const dir = path.join(root, 'node_modules', '@fontsource', 'noto-sans-arabic', 'files');
  try {
    for (const name of fs.readdirSync(dir).filter((n) => /arabic.*400.*\.(ttf|otf|woff)$/i.test(n))) {
      GlobalFonts.registerFromPath(path.join(dir, name), 'DOSArabic');
    }
  } catch (error) { console.warn('[PNG] Arabic font package files unavailable:', error.message); }
}
loadFonts();
function card(ctx,x,y,w,h,r=20,fill=C.panel) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=fill; ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle=C.border; ctx.stroke();
}
function text(ctx,value,x,y,size=22,color=C.white,weight=600,align='right',max=1100) {
  ctx.save(); ctx.font=weight+' '+size+'px '+FONT; ctx.fillStyle=color; ctx.textAlign=align;
  ctx.textBaseline='middle'; ctx.direction=/[\u0600-\u06ff]/.test(String(value))?'rtl':'ltr';
  ctx.fillText(String(value ?? ''),x,y,max); ctx.restore();
}
function base(ctx,w,h,title,subtitle) {
  const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,C.bg); g.addColorStop(.55,'#111C29'); g.addColorStop(1,C.bg);
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h); card(ctx,20,20,w-40,h-40,28,'#0D1520');
  ctx.fillStyle=C.cyan; ctx.fillRect(20,20,8,h-40);
  text(ctx,title,w-66,78,38,C.white,800);
  text(ctx,subtitle,w-70,124,16,C.cyan,700);
}
async function safeImage(src) {
  if (!src) return null;
  try {
    if (/^https?:\/\//i.test(String(src))) return await loadImage(String(src));
    const full = path.isAbsolute(String(src)) ? String(src) : path.resolve(root,String(src));
    if (fs.existsSync(full)) return await loadImage(full);
  } catch (error) { console.warn('[PNG] Optional image skipped:',error.message); }
  return null;
}
function avatar(ctx,img,x,y,size) {
  if (!img) return;
  ctx.save(); ctx.beginPath(); ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2); ctx.clip();
  ctx.drawImage(img,x,y,size,size); ctx.restore();
  ctx.beginPath(); ctx.arc(x+size/2,y+size/2,size/2-2,0,Math.PI*2); ctx.strokeStyle=C.cyan; ctx.lineWidth=5; ctx.stroke();
}
function bar(ctx,x,y,w,p,color) {
  card(ctx,x,y,w,14,7,'#09111B'); ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect(x,y,Math.max(0,w*Math.min(1,Math.max(0,Number(p)||0))),14,7); ctx.fill();
}
async function renderWallet({user,profile,textProgress,voiceProgress,textPosition=0,voicePosition=0,guild=null}) {
  const w=1500,h=500,canvas=createCanvas(w,h),ctx=canvas.getContext('2d'); base(ctx,w,h,'DOS WALLET','DOS COMMUNITY • SILVER × CYAN');
  avatar(ctx,await safeImage(user.displayAvatarURL({extension:'png',size:512})),62,160,210);
  const logo=await safeImage(guild && guild.iconURL ? guild.iconURL({extension:'png',size:128}) : null); avatar(ctx,logo,1370,48,66);
  text(ctx,user.displayName||user.username,1320,165,36,C.white,800);
  text(ctx,Number(profile.coins||0).toLocaleString('en-US')+' DOS Coin',1320,222,29,C.cyan,800);
  text(ctx,'Total XP '+Number(profile.total_xp||0).toLocaleString('en-US')+'   •   Messages '+Number(profile.messages||0).toLocaleString('en-US'),1320,272,19,C.muted,600);
  const seconds=Number(profile.voice_seconds||0), hours=Math.floor(seconds/3600), minutes=Math.floor(seconds%3600/60);
  text(ctx,'Voice time '+hours+'h '+minutes+'m',1320,306,18,C.silver,600);
  for (const t of [{x:360,title:'المستوى الكتابي',p:textProgress,pos:textPosition,color:C.cyan},{x:920,title:'المستوى الصوتي',p:voiceProgress,pos:voicePosition,color:C.silver}]) {
    const p=t.p||{level:0,xp:0,needed:1,percent:0}; card(ctx,t.x,330,520,125,18,C.panel2);
    text(ctx,t.title,t.x+490,355,23,t.color,800);
    text(ctx,'Level '+p.level+'   •   Rank #'+(t.pos||'—'),t.x+490,390,18,C.white,700);
    text(ctx,Number(p.xp||0)+' / '+Number(p.needed||1)+' XP',t.x+490,422,16,C.muted,600);
    bar(ctx,t.x+28,438,464,(Number(p.percent)||0)/100,t.color);
  }
  return canvas.toBuffer('image/png');
}
async function renderTopLeaderboard({guild,entries=[],period='all',metric='all'}) {
  const w=1500,h=760,canvas=createCanvas(w,h),ctx=canvas.getContext('2d'); base(ctx,w,h,'DOS COMMUNITY • TOP','TOP LEADERBOARD');
  const labels={all:'XP الكلي',text:'XP كتابي',voice:'XP صوتي',coins:'DOS Coin'};
  const times={all:'منذ البداية',daily:'يومي',weekly:'أسبوعي',monthly:'شهري'};
  text(ctx,(labels[metric]||labels.all)+'  •  '+(times[period]||times.all),1400,190,26,C.silver,700);
  const list=entries.slice(0,10);
  if (!list.length) text(ctx,'لا توجد بيانات لهذه الفترة حتى الآن',1350,390,28,C.muted,600);
  list.forEach((e,i)=>{ const y=250+i*43; card(ctx,110,y-18,1280,38,11,i<3?C.panel2:C.panel);
    text(ctx,String(i+1).padStart(2,'0'),160,y,20,i<3?C.cyan:C.muted,800,'left',60);
    text(ctx,e.name||'عضو DOS',290,y,21,C.white,700,'left',900);
    text(ctx,Number(e.score||0).toLocaleString('en-US'),1340,y,22,C.silver,700);
  });
  return canvas.toBuffer('image/png');
}
async function renderShopGrid(items=[],title='DOS SHOP') {
  const list=items.slice(0,9),cols=3,rows=Math.max(1,Math.ceil(list.length/cols)),w=1200,h=150+rows*300+40,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');
  base(ctx,w,h,title,'اختر المنتج المناسب • صور وأسعار DOS SHOP');
  if (!list.length) text(ctx,'لا توجد منتجات متاحة حالياً',w/2,330,28,C.muted,700,'center');
  for (let i=0;i<list.length;i++) {
    const item=list[i],col=i%cols,row=Math.floor(i/cols),x=34+col*378,y=165+row*300;
    card(ctx,x,y,350,270,20,C.panel2);
    const img=await safeImage(item.image_url);
    if (img) {
      const bx=x+24,by=y+18,bw=302,bh=152,scale=Math.min(bw/img.width,bh/img.height),dw=img.width*scale,dh=img.height*scale;
      ctx.save(); ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,14); ctx.clip(); ctx.drawImage(img,bx+(bw-dw)/2,by+(bh-dh)/2,dw,dh); ctx.restore();
    } else { card(ctx,x+24,y+18,302,152,14,'#153C4A'); text(ctx,'DOS',x+175,y+94,52,C.cyan,800,'center',200); }
    text(ctx,item.name||'منتج DOS',x+175,y+200,21,C.white,800,'center',300);
    text(ctx,item.display_price||String(item.price||0)+' DOS Coin',x+175,y+238,20,C.cyan,800,'center',300);
  }
  return canvas.toBuffer('image/png');
}
async function renderPanelPage({guild=null,title='DOS COMMUNITY',body='',sections=[],subtitle='DOS COMMUNITY • SILVER × CYAN'}) {
  const w=1500,h=sections.length?650:590,canvas=createCanvas(w,h),ctx=canvas.getContext('2d'); base(ctx,w,h,title,subtitle);
  const logo=await safeImage(guild&&guild.iconURL?guild.iconURL({extension:'png',size:128}):null); avatar(ctx,logo,72,165,76);
  const lines=String(body||'').split(/\r?\n/); let y=220; const max=1220,right=1388;
  for (const raw of lines) {
    if (!raw.trim()) { y+=14; continue; }
    const words=raw.split(/\s+/); let line='';
    for (const word of words) { const next=line?line+' '+word:word; ctx.font='600 23px '+FONT;
      if (line&&ctx.measureText(next).width>max) { text(ctx,line,right,y,23,C.silver,600); line=word; } else line=next; }
    if (line) text(ctx,line,right,y,23,C.silver,600); y+=38; if(y>(sections.length?440:520)) break;
  }
  if (sections.length) {
    const gap=14,x0=72,available=w-144,cell=(available-gap*(sections.length-1))/sections.length;
    sections.forEach((s,i)=>{ const x=x0+i*(cell+gap); card(ctx,x,500,cell,86,16,C.panel2); text(ctx,s,x+cell/2,544,19,C.cyan,800,'center',cell-18); });
  }
  text(ctx,subtitle,w-70,h-66,14,C.muted,700);
  return canvas.toBuffer('image/png');
}
module.exports={renderWallet,renderTopLeaderboard,renderShopGrid,renderPanelPage};
