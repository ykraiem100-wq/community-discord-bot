'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const C = {
  bg: '#050A12', bg2: '#0A1421', panel: '#0B1725', panel2: '#102438',
  border: '#899FB3', silver: '#D9E3ED', white: '#F7FAFD', muted: '#AFC0D0',
  cyan: '#46DFFF', cyan2: '#00A7D8', cyanDark: '#07506C',
  gold: '#F5CF65', green: '#63D9C0'
};
const FONT = 'DOSArabic, Arial, sans-serif';
const root = path.resolve(__dirname, '..');

function loadFonts() {
  const dir = path.join(root, 'node_modules', '@fontsource', 'noto-sans-arabic', 'files');
  try {
    for (const name of fs.readdirSync(dir).filter((n) => /arabic.*400.*\.(ttf|otf|woff)$/i.test(n))) {
      GlobalFonts.registerFromPath(path.join(dir, name), 'DOSArabic');
    }
  } catch (error) {
    console.warn('[PNG] Arabic font package files unavailable:', error.message);
  }
}
loadFonts();

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function panel(ctx, x, y, w, h, r = 22, fill = C.panel2, accent = C.cyan) {
  ctx.save();
  rounded(ctx, x, y, w, h, r);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, C.silver);
  g.addColorStop(0.18, accent);
  g.addColorStop(0.52, '#55748D');
  g.addColorStop(0.82, accent);
  g.addColorStop(1, C.silver);
  ctx.lineWidth = 3;
  ctx.strokeStyle = g;
  ctx.stroke();
  rounded(ctx, x + 7, y + 7, w - 14, h - 14, Math.max(8, r - 6));
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(218,239,255,0.30)';
  ctx.stroke();
  ctx.restore();
}
function text(ctx, value, x, y, size = 22, color = C.white, weight = 700, align = 'right', max = 1200) {
  ctx.save();
  ctx.font = weight + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.direction = /[\u0600-\u06ff]/.test(String(value)) ? 'rtl' : 'ltr';
  ctx.shadowColor = color === C.cyan ? 'rgba(70,223,255,0.45)' : 'transparent';
  ctx.shadowBlur = color === C.cyan ? 8 : 0;
  ctx.fillText(String(value ?? ''), x, y, max);
  ctx.restore();
}
function crown(ctx, cx, cy, scale = 1, color = C.silver) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-30, 13); ctx.lineTo(-36, -13); ctx.lineTo(-15, 0);
  ctx.lineTo(0, -25); ctx.lineTo(15, 0); ctx.lineTo(36, -13);
  ctx.lineTo(30, 13); ctx.closePath();
  const g = ctx.createLinearGradient(0, -25, 0, 16);
  g.addColorStop(0, C.white); g.addColorStop(0.55, color); g.addColorStop(1, '#71869B');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C.cyan; ctx.stroke();
  ctx.fillStyle = C.gold;
  for (const x of [-36, 0, 36]) { ctx.beginPath(); ctx.arc(x, x === 0 ? -25 : -13, 3.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function backdrop(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#030710'); g.addColorStop(0.45, '#0B1B2B'); g.addColorStop(1, '#030811');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.12, 12, w * 0.5, h * 0.12, w * 0.7);
  glow.addColorStop(0, 'rgba(0,186,235,0.22)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = i % 2 ? C.silver : C.cyan;
    ctx.lineWidth = i % 2 ? 2 : 4;
    ctx.beginPath();
    ctx.moveTo(-40, 90 + i * 56);
    ctx.lineTo(190 + i * 36, -30);
    ctx.lineTo(360 + i * 36, -30);
    ctx.stroke();
    ctx.restore();
  }
  panel(ctx, 18, 18, w - 36, h - 36, 28, 'rgba(4,12,22,0.92)', C.cyan);
}
function header(ctx, w, title, subtitle) {
  crown(ctx, w / 2, 52, 0.85, C.silver);
  text(ctx, 'DOS COMMUNITY', w / 2, 94, 40, C.silver, 900, 'center', w - 100);
  text(ctx, title, w / 2, 150, 31, C.white, 900, 'center', w - 120);
  if (subtitle) text(ctx, subtitle, w / 2, 190, 17, C.cyan, 700, 'center', w - 130);
  ctx.save();
  const g = ctx.createLinearGradient(100, 0, w - 100, 0);
  g.addColorStop(0, 'rgba(70,223,255,0)');
  g.addColorStop(0.5, 'rgba(70,223,255,0.85)');
  g.addColorStop(1, 'rgba(70,223,255,0)');
  ctx.fillStyle = g; ctx.fillRect(100, 214, w - 200, 2);
  ctx.restore();
}
function footer(ctx, w, h, label = 'DOS COMMUNITY • SILVER × CYAN') {
  text(ctx, label, w / 2, h - 36, 14, C.muted, 700, 'center', w - 100);
}
async function safeImage(src) {
  if (!src) return null;
  try {
    if (/^https?:\/\//i.test(String(src))) return await loadImage(String(src));
    const full = path.isAbsolute(String(src)) ? String(src) : path.resolve(root, String(src));
    if (fs.existsSync(full)) return await loadImage(full);
  } catch (error) {
    console.warn('[PNG] Optional image skipped:', error.message);
  }
  return null;
}
function avatar(ctx, img, x, y, size) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 + 8, 0, Math.PI * 2);
  ctx.strokeStyle = C.silver; ctx.lineWidth = 5; ctx.shadowColor = C.cyan; ctx.shadowBlur = 20; ctx.stroke();
  ctx.shadowBlur = 0;
  if (img) {
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, x, y, size, size);
  } else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#164C68'); g.addColorStop(1, '#07101A');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'DOS', x + size / 2, y + size / 2, size * 0.22, C.silver, 900, 'center', size * 0.8);
  }
  ctx.restore();
}
function progressBar(ctx, x, y, w, h, pct, accent = C.cyan) {
  ctx.save();
  rounded(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#030A12'; ctx.fill();
  ctx.strokeStyle = '#7994A9'; ctx.lineWidth = 1.5; ctx.stroke();
  const amount = Math.max(0, Math.min(1, Number(pct) || 0));
  if (amount > 0) {
    rounded(ctx, x + 3, y + 3, Math.max(h - 6, (w - 6) * amount), h - 6, (h - 6) / 2);
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, accent); g.addColorStop(1, '#08759F');
    ctx.fillStyle = g; ctx.shadowColor = accent; ctx.shadowBlur = 12; ctx.fill();
  }
  ctx.restore();
}
function wrapText(ctx, value, x, y, maxWidth, lineHeight, size = 22, color = C.silver) {
  const paragraphs = String(value || '').split(/\r?\n/);
  let cursor = y;
  ctx.font = '600 ' + size + 'px ' + FONT;
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) { cursor += lineHeight * 0.55; continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        text(ctx, line, x, cursor, size, color, 600, 'right', maxWidth);
        cursor += lineHeight; line = word;
      } else line = next;
    }
    if (line) { text(ctx, line, x, cursor, size, color, 600, 'right', maxWidth); cursor += lineHeight; }
  }
  return cursor;
}

async function renderWallet({ user, profile, textProgress, voiceProgress, textPosition = 0, voicePosition = 0, guild = null }) {
  profile = profile || {};
  textProgress = textProgress || {};
  voiceProgress = voiceProgress || {};
  const w = 1500, h = 690, canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  backdrop(ctx, w, h);
  header(ctx, w, 'محفظتي', 'بطاقة العضو • DOS WALLET');
  const logo = await safeImage(guild && guild.iconURL ? guild.iconURL({ extension: 'png', size: 128 }) : null);
  avatar(ctx, logo, w - 178, 42, 64);
  avatar(ctx, await safeImage(user.displayAvatarURL({ extension: 'png', size: 512 })), 78, 260, 214);
  panel(ctx, 335, 242, 1085, 155, 24, '#0C1D2D', C.cyan);
  text(ctx, user.displayName || user.username, 1370, 284, 36, C.white, 900);
  text(ctx, 'المستوى الكتابي ' + (textProgress.level || 0) + '  •  المستوى الصوتي ' + (voiceProgress.level || 0), 1370, 337, 23, C.cyan, 800);
  text(ctx, 'XP الكتابة ' + Number(profile.text_xp || 0).toLocaleString('en-US') + '  |  XP الصوت ' + Number(profile.voice_xp || 0).toLocaleString('en-US'), 1370, 372, 17, C.muted, 600);
  const metrics = [
    { title: 'الرصيد', value: Number(profile.coins || 0).toLocaleString('en-US'), unit: 'DOS Coin', icon: 'D', accent: C.gold },
    { title: 'إجمالي XP', value: Number(profile.total_xp || 0).toLocaleString('en-US'), unit: 'XP', icon: '✦', accent: C.cyan },
    { title: 'الرسائل', value: Number(profile.messages || 0).toLocaleString('en-US'), unit: 'رسالة', icon: '✉', accent: C.silver },
    { title: 'دقائق الصوت', value: Math.floor(Number(profile.voice_seconds || 0) / 60).toLocaleString('en-US'), unit: 'دقيقة', icon: '♪', accent: C.cyan }
  ];
  const gap = 18, startX = 62, cardW = (w - 124 - gap * 3) / 4;
  metrics.forEach((m, i) => {
    const x = startX + i * (cardW + gap);
    panel(ctx, x, 420, cardW, 112, 18, '#0D1D2B', m.accent);
    text(ctx, m.title, x + cardW / 2, 451, 20, m.accent, 800, 'center', cardW - 30);
    text(ctx, m.value, x + cardW / 2, 490, 29, C.white, 900, 'center', cardW - 24);
    text(ctx, m.unit, x + cardW / 2, 516, 14, C.muted, 700, 'center', cardW - 24);
  });
  const progress = [
    { x: 62, title: 'تقدم المستوى الكتابي', p: textProgress || {}, position: textPosition },
    { x: 765, title: 'تقدم المستوى الصوتي', p: voiceProgress || {}, position: voicePosition }
  ];
  for (const item of progress) {
    panel(ctx, item.x, 550, 673, 92, 17, '#0D1D2B', C.cyan);
    text(ctx, item.title, item.x + 640, 574, 18, C.cyan, 800);
    const p = item.p;
    text(ctx, 'Lv.' + (p.level || 0) + '  •  ' + Number(p.xp || 0).toLocaleString('en-US') + ' / ' + Number(p.needed || 1).toLocaleString('en-US') + ' XP', item.x + 640, 607, 15, C.silver, 700);
    progressBar(ctx, item.x + 24, 623, 625, 10, (Number(p.percent) || 0) / 100);
  }
  footer(ctx, w, h, 'DOS COMMUNITY • YOUR PROGRESS');
  return canvas.toBuffer('image/png');
}

async function renderTopLeaderboard({ guild, entries = [], period = 'all', metric = 'all' }) {
  const w = 1500, h = 900, canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  backdrop(ctx, w, h);
  header(ctx, w, 'المتصدرون', 'TOP LEADERBOARD • DOS COMMUNITY');
  const labels = { all: 'XP الكلي', text: 'XP كتابي', voice: 'XP صوتي', coins: 'DOS Coin' };
  const times = { all: 'منذ البداية', daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري' };
  panel(ctx, 470, 224, 560, 54, 20, '#10283A', C.cyan);
  text(ctx, (labels[metric] || labels.all) + '  •  ' + (times[period] || times.all), 750, 251, 22, C.white, 800, 'center', 520);
  const list = entries.slice(0, 10);
  if (!list.length) text(ctx, 'لا توجد بيانات لهذه الفترة حتى الآن', 750, 500, 28, C.muted, 700, 'center', 1000);
  const topCards = [
    { index: 1, x: 100, width: 400, accent: C.silver },
    { index: 0, x: 550, width: 400, accent: C.gold },
    { index: 2, x: 1000, width: 400, accent: '#C58F62' }
  ];
  for (const slot of topCards) {
    const entry = list[slot.index];
    if (!entry) continue;
    panel(ctx, slot.x, 305, slot.width, 190, 22, '#102235', slot.accent);
    crown(ctx, slot.x + slot.width / 2, 342, slot.index === 0 ? 0.7 : 0.52, slot.accent);
    text(ctx, '#' + (slot.index + 1), slot.x + slot.width / 2, 385, 24, slot.accent, 900, 'center');
    text(ctx, entry.name || 'عضو DOS', slot.x + slot.width / 2, 427, 22, C.white, 800, 'center', slot.width - 36);
    text(ctx, Number(entry.score || 0).toLocaleString('en-US') + ' ' + (metric === 'coins' ? 'Coin' : 'XP'), slot.x + slot.width / 2, 465, 19, slot.accent, 800, 'center', slot.width - 36);
  }
  const rows = list.slice(3, 10);
  rows.forEach((entry, i) => {
    const y = 545 + i * 43;
    panel(ctx, 85, y - 17, 1330, 38, 12, '#0B1A29', i % 2 ? C.border : C.cyanDark);
    text(ctx, '#' + (i + 4), 140, y, 19, C.cyan, 800, 'left', 70);
    text(ctx, entry.name || 'عضو DOS', 235, y, 20, C.white, 700, 'left', 950);
    text(ctx, Number(entry.score || 0).toLocaleString('en-US'), 1360, y, 20, C.silver, 800, 'right', 250);
  });
  footer(ctx, w, h, 'DOS COMMUNITY • TOP MEMBERS');
  return canvas.toBuffer('image/png');
}

async function renderShopGrid(items = [], title = 'DOS SHOP') {
  const list = items.slice(0, 9), cols = 3, rows = Math.max(1, Math.ceil(list.length / cols));
  const w = 1320, h = 250 + rows * 300, canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  backdrop(ctx, w, h);
  header(ctx, w, title, 'اختر المنتج المناسب • DOS COMMUNITY STORE');
  if (!list.length) text(ctx, 'لا توجد منتجات متاحة حالياً', w / 2, 430, 30, C.muted, 700, 'center');
  for (let i = 0; i < list.length; i++) {
    const item = list[i], col = i % cols, row = Math.floor(i / cols);
    const cardW = 390, x = 52 + col * 425, y = 240 + row * 300;
    panel(ctx, x, y, cardW, 270, 22, '#0B1C2D', C.cyan);
    const img = await safeImage(item.image_url);
    if (img) {
      const bx = x + 26, by = y + 20, bw = cardW - 52, bh = 138;
      const scale = Math.min(bw / img.width, bh / img.height), dw = img.width * scale, dh = img.height * scale;
      ctx.save(); rounded(ctx, bx, by, bw, bh, 14); ctx.clip();
      ctx.drawImage(img, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh); ctx.restore();
    } else {
      panel(ctx, x + 26, y + 20, cardW - 52, 138, 15, '#102B42', C.silver);
      crown(ctx, x + cardW / 2, y + 94, 0.9, C.silver);
      text(ctx, 'DOS', x + cardW / 2, y + 128, 25, C.cyan, 900, 'center');
    }
    text(ctx, item.name || 'منتج DOS', x + cardW / 2, y + 188, 22, C.white, 900, 'center', cardW - 36);
    text(ctx, item.display_price || String(item.price || 0) + ' DOS Coin', x + cardW / 2, y + 235, 21, C.cyan, 900, 'center', cardW - 36);
  }
  footer(ctx, w, h, 'DOS SHOP • PRODUCTS');
  return canvas.toBuffer('image/png');
}

async function renderPanelPage({ guild = null, title = 'DOS COMMUNITY', body = '', sections = [], subtitle = 'DOS COMMUNITY • SILVER × CYAN' }) {
  const isMain = sections.length > 0;
  const w = 1500, h = isMain ? 790 : 720, canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  backdrop(ctx, w, h);
  header(ctx, w, title, subtitle);
  const logo = await safeImage(guild && guild.iconURL ? guild.iconURL({ extension: 'png', size: 128 }) : null);
  avatar(ctx, logo, 76, 236, 82);
  const bodyY = 290;
  if (isMain) {
    wrapText(ctx, body, 1350, bodyY, 1180, 34, 21, C.silver);
    const positions = [
      { x: 90, y: 405, w: 640, h: 112 },
      { x: 770, y: 405, w: 640, h: 112 },
      { x: 90, y: 535, w: 640, h: 112 },
      { x: 770, y: 535, w: 640, h: 112 },
      { x: 425, y: 665, w: 650, h: 64 }
    ];
    sections.slice(0, 5).forEach((label, i) => {
      const p = positions[i];
      panel(ctx, p.x, p.y, p.w, p.h, 18, '#0D2234', i === 4 ? C.gold : C.cyan);
      const iconMap = ['▤', 'i', '◈', '⚙', '✦'];
      text(ctx, iconMap[i], p.x + p.w - 45, p.y + p.h / 2, 28, C.cyan, 900, 'center', 50);
      text(ctx, label, p.x + p.w / 2, p.y + p.h / 2, 24, C.white, 900, 'center', p.w - 120);
    });
  } else {
    panel(ctx, 80, 255, 1340, 390, 24, '#0D1D2D', C.cyan);
    wrapText(ctx, body, 1360, 310, 1220, 40, 24, C.silver);
  }
  footer(ctx, w, h, 'DOS COMMUNITY • SILVER × CYAN');
  return canvas.toBuffer('image/png');
}

async function renderLevelSystemPage({ guild = null, messageXp = 7, voiceXp = 9, xpPerCoin = 250 }) {
  const w = 1500, h = 850, canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  backdrop(ctx, w, h);
  header(ctx, w, 'نظام المستويات', 'مراحل تطور المستويات وصعوبة الترقّي');
  const tiers = [
    { y: 255, title: 'المستويات 1–50', level: 'المرحلة الأولى', desc: 'من سهل إلى متوسط', accent: C.silver, detail: 'تدرّج مناسب لبداية التفاعل' },
    { y: 390, title: 'المستويات 51–100', level: 'المرحلة الثانية', desc: 'من متوسط إلى صعب', accent: C.cyan, detail: 'تحدٍ أكبر مع استمرار النشاط' },
    { y: 525, title: 'المستوى 101 فأعلى', level: 'المرحلة الثالثة', desc: 'صعب', accent: C.gold, detail: 'مخصص للأعضاء الأكثر نشاطاً وتفاعلاً' }
  ];
  tiers.forEach((t) => {
    panel(ctx, 90, t.y, 1320, 112, 20, '#0B1D2D', t.accent);
    crown(ctx, 1270, t.y + 53, 0.75, t.accent);
    text(ctx, t.level, 1185, t.y + 31, 19, t.accent, 800);
    text(ctx, t.title, 1185, t.y + 75, 27, C.white, 900);
    text(ctx, t.desc, 720, t.y + 39, 25, C.white, 900, 'center', 660);
    text(ctx, t.detail, 720, t.y + 77, 17, C.muted, 600, 'center', 660);
  });
  panel(ctx, 90, 680, 1320, 112, 20, '#0B1D2D', C.cyan);
  text(ctx, 'طرق الحصول على الخبرة', 1345, 710, 22, C.cyan, 900);
  text(ctx, 'الرسائل: ' + Number(messageXp) + ' XP لكل رسالة', 1345, 750, 21, C.white, 700);
  text(ctx, 'الصوت: ' + Number(voiceXp) + ' XP لكل دقيقة مؤهلة', 740, 750, 21, C.white, 700);
  text(ctx, 'معدل التحويل: كل ' + Number(xpPerCoin) + ' XP = 1 DOS Coin', 250, 750, 21, C.gold, 800);
  footer(ctx, w, h, 'DOS COMMUNITY • LEVELS');
  return canvas.toBuffer('image/png');
}

async function renderAdminDashboard() {
  const w = 1500, h = 920, canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  backdrop(ctx, w, h);
  header(ctx, w, 'لوحة الإدارة الشاملة', 'إدارة وتحكم في أنظمة DOS COMMUNITY من مكان واحد');
  panel(ctx, 70, 245, 270, 570, 22, '#0B1B2A', C.silver);
  crown(ctx, 205, 300, 1.2, C.silver);
  text(ctx, 'DOS ADMIN', 205, 365, 25, C.white, 900, 'center');
  const nav = ['الرئيسية', 'إدارة المتجر', 'الغرف الخاصة', 'اللوحات والرسائل', 'إدارة الأنظمة', 'العملات والمستويات', 'رتب التفاعل', 'رتب المستويات'];
  nav.forEach((label, i) => {
    panel(ctx, 90, 410 + i * 48, 230, 40, 10, i === 0 ? '#10405A' : '#101F30', i === 0 ? C.cyan : C.border);
    text(ctx, label, 295, 430 + i * 48, 17, C.white, 700);
  });
  const modules = ['العملات والمحفظة', 'المستويات (XP)', 'DOS SHOP', 'TOP والمتصدرون', 'اللوحة الرئيسية', 'رتب التفاعل', 'الفعاليات', 'الغرف الخاصة'];
  modules.forEach((label, i) => {
    const col = i % 4, row = Math.floor(i / 4), x = 375 + col * 265, y = 270 + row * 190;
    panel(ctx, x, y, 240, 150, 18, '#0B2032', C.cyan);
    crown(ctx, x + 120, y + 45, 0.7, C.silver);
    text(ctx, label, x + 120, y + 104, 19, C.white, 800, 'center', 215);
    text(ctx, 'إدارة الإعدادات', x + 120, y + 130, 13, C.muted, 600, 'center', 210);
  });
  panel(ctx, 375, 690, 1025, 125, 18, '#0B1D2D', C.silver);
  text(ctx, 'اختر القسم من القائمة التفاعلية أسفل الصورة لتعديل الإعدادات وحفظها', 1370, 752, 21, C.cyan, 800);
  footer(ctx, w, h, 'DOS CONTROL PANEL • ADMIN ONLY');
  return canvas.toBuffer('image/png');
}

async function renderAdminShop(products = []) {
  const w = 1500, h = 850, canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  backdrop(ctx, w, h);
  header(ctx, w, 'إدارة المتجر', 'DOS SHOP • إضافة المنتجات وتعديلها ومراجعة الطلبات');
  panel(ctx, 70, 245, 500, 530, 22, '#0B1D2C', C.cyan);
  text(ctx, 'معاينة المتجر', 530, 285, 25, C.white, 900);
  text(ctx, 'DOS SHOP', 320, 345, 34, C.silver, 900, 'center');
  const visible = products.slice(0, 6);
  if (!visible.length) text(ctx, 'أضف منتجات لتظهر هنا', 320, 540, 23, C.muted, 700, 'center');
  visible.forEach((p, i) => {
    const col = i % 2, row = Math.floor(i / 2), x = 95 + col * 230, y = 390 + row * 115;
    panel(ctx, x, y, 205, 96, 14, '#0E2638', C.silver);
    text(ctx, p.name || 'منتج DOS', x + 102, y + 34, 17, C.white, 800, 'center', 185);
    text(ctx, Number(p.price || 0).toLocaleString('en-US') + (p.currency === 'cash' ? ' نقداً' : ' Coin'), x + 102, y + 70, 15, C.cyan, 800, 'center', 185);
  });
  panel(ctx, 600, 245, 830, 530, 22, '#0B1D2C', C.silver);
  text(ctx, 'قائمة المنتجات', 1390, 285, 25, C.white, 900);
  visible.forEach((p, i) => {
    const y = 355 + i * 64;
    panel(ctx, 630, y, 770, 52, 12, '#102538', p.active ? C.cyan : C.border);
    text(ctx, p.name || 'منتج DOS', 1360, y + 25, 18, C.white, 800);
    text(ctx, Number(p.price || 0).toLocaleString('en-US') + (p.currency === 'cash' ? ' نقداً' : ' Coin'), 900, y + 25, 16, C.cyan, 700, 'center', 220);
    text(ctx, p.active ? 'مفعّل' : 'متوقف', 690, y + 25, 15, p.active ? C.green : C.muted, 800, 'left', 100);
  });
  text(ctx, 'التعديل والإضافة والحذف تتم من عناصر Discord التفاعلية أسفل الصورة', 1400, 810, 17, C.muted, 700);
  footer(ctx, w, h, 'DOS SHOP • ADMIN');
  return canvas.toBuffer('image/png');
}

module.exports = {
  renderWallet, renderTopLeaderboard, renderShopGrid, renderPanelPage,
  renderLevelSystemPage, renderAdminDashboard, renderAdminShop
};
