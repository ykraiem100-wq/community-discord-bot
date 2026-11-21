'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'assets', 'templates');
const FONT_DIR = path.join(ROOT, 'assets', 'fonts');
const C = Object.freeze({
  ink: '#050A12', panel: '#0B1B2B', panel2: '#10283A',
  white: '#F5F8FC', muted: '#AEC0D2', silver: '#D7E2EC', silverDark: '#8198AD',
  cyan: '#43DFFF', cyanDark: '#08789D', gold: '#F4CE68', green: '#69DDBD',
  bronze: '#C18A66', purple: '#B88AFF'
});
const FONT = 'DOSArabic, DOSLatin, Arial, sans-serif';

function registerFonts() {
  const files = [
    ['NotoSansArabic-Regular.ttf', 'DOSArabic'],
    ['NotoSansArabic-Bold.ttf', 'DOSArabic'],
    ['NotoSans-Regular.ttf', 'DOSLatin'],
    ['NotoSans-Bold.ttf', 'DOSLatin']
  ];
  let loaded = 0;
  for (const [filename, family] of files) {
    const full = path.join(FONT_DIR, filename);
    if (fs.existsSync(full)) {
      try { GlobalFonts.registerFromPath(full, family); loaded += 1; }
      catch (error) { console.warn('[PNG] Font registration failed:', filename, error.message); }
    }
  }
  if (loaded !== files.length) console.warn(`[PNG] Registered ${loaded}/${files.length} bundled font files.`);
}
registerFonts();

const templateCache = new Map();
async function loadTemplate(filename) {
  const full = path.join(TEMPLATE_DIR, filename);
  if (!fs.existsSync(full)) throw new Error(`Missing DOS template: assets/templates/${filename}`);
  if (!templateCache.has(filename)) templateCache.set(filename, await loadImage(full));
  return templateCache.get(filename);
}
async function loadSafeImage(source) {
  if (!source) return null;
  try {
    const value = String(source);
    if (/^https?:\/\//i.test(value)) return await loadImage(value);
    const full = path.isAbsolute(value) ? value : path.resolve(ROOT, value);
    if (fs.existsSync(full)) return await loadImage(full);
  } catch (error) {
    console.warn('[PNG] Could not load optional image:', error.message);
  }
  return null;
}
function rounded(ctx, x, y, w, h, radius, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function drawText(ctx, value, x, y, size = 22, color = C.white, weight = 700, align = 'right', maxWidth = 1200) {
  const text = String(value ?? '');
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.direction = /[\u0600-\u06ff]/.test(text) ? 'rtl' : 'ltr';
  if (color === C.cyan) { ctx.shadowColor = 'rgba(67,223,255,0.55)'; ctx.shadowBlur = 8; }
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}
function crown(ctx, cx, cy, scale = 1, color = C.silver) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-31, 14); ctx.lineTo(-37, -13); ctx.lineTo(-15, 0);
  ctx.lineTo(0, -26); ctx.lineTo(15, 0); ctx.lineTo(37, -13); ctx.lineTo(31, 14); ctx.closePath();
  const g = ctx.createLinearGradient(0, -26, 0, 15);
  g.addColorStop(0, C.white); g.addColorStop(0.55, color); g.addColorStop(1, C.silverDark);
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.cyan; ctx.stroke();
  ctx.fillStyle = C.gold;
  for (const [x, y] of [[-37, -13], [0, -26], [37, -13]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
async function header(ctx, w, title, subtitle) {
  const banner = await loadTemplate('dos-community-banner.png');
  const bannerWidth = Math.min(560, w - 240);
  const bannerHeight = bannerWidth * banner.height / banner.width;
  ctx.drawImage(banner, (w - bannerWidth) / 2, 5, bannerWidth, bannerHeight);
  drawText(ctx, title, w / 2, 165, 30, C.white, 900, 'center', w - 140);
  if (subtitle) drawText(ctx, subtitle, w / 2, 195, 15, C.cyan, 800, 'center', w - 150);
  const g = ctx.createLinearGradient(90, 0, w - 90, 0);
  g.addColorStop(0, 'rgba(67,223,255,0)'); g.addColorStop(0.5, 'rgba(67,223,255,0.85)'); g.addColorStop(1, 'rgba(67,223,255,0)');
  ctx.fillStyle = g; ctx.fillRect(90, 216, w - 180, 2);
}
function footer(ctx, w, h, label = 'DOS COMMUNITY • SILVER × CYAN') {
  drawText(ctx, label, w / 2, h - 28, 13, C.muted, 700, 'center', w - 100);
}
function formatNumber(value) { return Math.max(0, Number(value) || 0).toLocaleString('en-US'); }
function drawAvatar(ctx, image, x, y, size) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 + 8, 0, Math.PI * 2);
  ctx.strokeStyle = C.silver; ctx.lineWidth = 5; ctx.shadowColor = C.cyan; ctx.shadowBlur = 20; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  if (image) ctx.drawImage(image, x, y, size, size);
  else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#18506A'); g.addColorStop(1, '#07101B');
    ctx.fillStyle = g; ctx.fillRect(x, y, size, size);
    drawText(ctx, 'DOS', x + size / 2, y + size / 2, size * 0.22, C.silver, 900, 'center', size * 0.8);
  }
  ctx.restore();
}
function progressBar(ctx, x, y, w, h, pct, color = C.cyan) {
  rounded(ctx, x, y, w, h, h / 2, '#07111D', '#54758C', 1);
  const amount = Math.max(0, Math.min(1, Number(pct) || 0));
  if (amount > 0) {
    const fillW = Math.max(h, (w - 4) * amount);
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, color); g.addColorStop(1, C.cyanDark);
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 12;
    rounded(ctx, x + 2, y + 2, Math.min(w - 4, fillW), h - 4, (h - 4) / 2, g); ctx.restore();
  }
}
function wrapText(ctx, value, x, y, width, size = 23, lineHeight = 38, color = C.silver, maxLines = 8) {
  ctx.save(); ctx.font = `600 ${size}px ${FONT}`;
  let cursor = y, lineCount = 0;
  for (const paragraph of String(value || '').split(/\r?\n/)) {
    if (!paragraph.trim()) { cursor += lineHeight * 0.55; continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        drawText(ctx, line, x, cursor, size, color, 600, 'right', width);
        cursor += lineHeight; lineCount += 1; line = word;
        if (lineCount >= maxLines) { ctx.restore(); return cursor; }
      } else line = next;
    }
    if (line) { drawText(ctx, line, x, cursor, size, color, 600, 'right', width); cursor += lineHeight; lineCount += 1; }
    if (lineCount >= maxLines) break;
  }
  ctx.restore(); return cursor;
}

async function renderWallet({ user, profile = {}, textProgress = {}, voiceProgress = {}, textPosition = 0, voicePosition = 0, displayName = '', guild = null }) {
  const bg = await loadTemplate('wallet-base.png');
  const canvas = createCanvas(bg.width, bg.height); const ctx = canvas.getContext('2d');
  ctx.drawImage(bg, 0, 0);
  await header(ctx, bg.width, 'محفظتي', 'بطاقة العضو • DOS WALLET');
  const avatarUrl = user && typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ extension: 'png', size: 512 }) : null;
  drawAvatar(ctx, await loadSafeImage(avatarUrl), 82, 252, 190);
  const logo = guild && typeof guild.iconURL === 'function' ? await loadSafeImage(guild.iconURL({ extension: 'png', size: 128 })) : null;
  if (logo) drawAvatar(ctx, logo, 1380, 48, 62);
  drawText(ctx, displayName || (user && (user.globalName || user.username)) || 'عضو DOS', 1370, 273, 38, C.white, 900);
  drawText(ctx, `المستوى الكتابي ${textProgress.level || 0}  •  المستوى الصوتي ${voiceProgress.level || 0}`, 1370, 326, 23, C.cyan, 800);
  drawText(ctx, 'عضو DOS • تقدمك في الكتابة والصوت', 1370, 369, 18, C.muted, 700);
  const voiceMinutes = Math.floor(Math.max(0, Number(profile.voice_seconds) || 0) / 60);
  const metrics = [
    { label: 'الرصيد', value: formatNumber(profile.coins), unit: 'DOS Coin', color: C.gold },
    { label: 'الرسائل', value: formatNumber(profile.messages), unit: 'رسالة', color: C.white },
    { label: 'دقائق الصوت', value: formatNumber(voiceMinutes), unit: 'دقيقة', color: C.cyan },
    { label: 'إجمالي XP', value: formatNumber(profile.total_xp), unit: 'XP', color: C.silver }
  ];
  metrics.forEach((m, i) => {
    const x = 62 + i * 344 + 172;
    drawText(ctx, m.label, x, 443, 18, C.cyan, 800, 'center', 285);
    drawText(ctx, m.value, x, 480, 29, m.color, 900, 'center', 285);
    drawText(ctx, m.unit, x, 510, 14, C.muted, 700, 'center', 285);
  });
  const bars = [
    { x: 62, label: 'تقدم المستوى الكتابي', value: textProgress, rank: textPosition },
    { x: 762, label: 'تقدم المستوى الصوتي', value: voiceProgress, rank: voicePosition }
  ];
  for (const b of bars) {
    drawText(ctx, b.label, b.x + 644, 570, 19, C.cyan, 800);
    drawText(ctx, `Lv.${b.value.level || 0} • #${b.rank || '—'}`, b.x + 644, 603, 16, C.white, 700);
    drawText(ctx, `${formatNumber(b.value.xp)} / ${formatNumber(b.value.needed || 1)} XP`, b.x + 30, 603, 15, C.muted, 700, 'left', 310);
    progressBar(ctx, b.x + 24, 621, 625, 12, (Number(b.value.percent) || 0) / 100);
  }
  footer(ctx, bg.width, bg.height, 'DOS COMMUNITY • YOUR PROGRESS');
  return canvas.toBuffer('image/png');
}

async function renderTopLeaderboard({ guild = null, entries = [], period = 'all', metric = 'all' }) {
  const bg = await loadTemplate('leaderboard-base.png');
  const canvas = createCanvas(bg.width, bg.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bg, 0, 0);
  await header(ctx, bg.width, 'المتصدرون', 'TOP LEADERBOARD • DOS COMMUNITY');
  const periodNames = { all: 'منذ البداية', daily: 'اليومي', weekly: 'الأسبوعي', monthly: 'الشهري' };
  const metricNames = { all: 'XP الكلي', text: 'XP كتابي', voice: 'XP صوتي', coins: 'DOS Coin' };
  rounded(ctx, 480, 228, 540, 52, 18, '#10283A', C.cyan, 2);
  drawText(ctx, `${metricNames[metric] || metricNames.all} • ${periodNames[period] || periodNames.all}`, 750, 254, 21, C.white, 800, 'center', 510);
  const rows = (entries || []).slice(0, 10);
  const podium = [
    { index: 1, x: 95, color: C.silver, name: 'المركز الثاني' },
    { index: 0, x: 550, color: C.gold, name: 'المركز الأول' },
    { index: 2, x: 1010, color: C.bronze, name: 'المركز الثالث' }
  ];
  for (const slot of podium) {
    const entry = rows[slot.index]; if (!entry) continue;
    rounded(ctx, slot.x, 305, 395, 190, 22, '#0D2538', slot.color, 3);
    crown(ctx, slot.x + 198, 340, slot.index === 0 ? 0.8 : 0.58, slot.color);
    drawText(ctx, `#${slot.index + 1}`, slot.x + 198, 382, 25, slot.color, 900, 'center');
    drawText(ctx, entry.name || 'عضو DOS', slot.x + 198, 425, 23, C.white, 800, 'center', 345);
    drawText(ctx, `${formatNumber(entry.score)} ${metric === 'coins' ? 'Coin' : 'XP'}`, slot.x + 198, 466, 19, slot.color, 800, 'center', 350);
  }
  rows.slice(3, 10).forEach((entry, i) => {
    const y = 545 + i * 43;
    rounded(ctx, 84, y - 17, 1332, 38, 11, '#0B1B2B', i % 2 ? '#5C788D' : C.cyanDark, 1.5);
    drawText(ctx, `#${i + 4}`, 134, y, 18, C.cyan, 800, 'left', 80);
    drawText(ctx, entry.name || 'عضو DOS', 235, y, 20, C.white, 700, 'left', 900);
    drawText(ctx, formatNumber(entry.score), 1360, y, 20, C.silver, 800, 'right', 250);
  });
  if (!rows.length) drawText(ctx, 'لا توجد نتائج مسجلة لهذه الفترة بعد.', 750, 650, 28, C.muted, 700, 'center', 900);
  footer(ctx, bg.width, bg.height, 'DOS COMMUNITY • TOP MEMBERS');
  return canvas.toBuffer('image/png');
}

async function renderShopGrid(items = [], title = 'DOS SHOP') {
  const bg = await loadTemplate('shop-base.png');
  const canvas = createCanvas(bg.width, bg.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bg, 0, 0);
  await header(ctx, bg.width, title || 'DOS SHOP', 'اختر المنتج المناسب • DOS COMMUNITY STORE');
  const itemsToShow = (items || []).slice(0, 9);
  for (let i = 0; i < 9; i += 1) {
    const col = i % 3, row = Math.floor(i / 3), x = 50 + col * 418, y = 245 + row * 300;
    const item = itemsToShow[i];
    if (!item) {
      rounded(ctx, x + 18, y + 16, 354, 148, 14, 'rgba(4,13,22,0.72)', 'rgba(90,125,150,0.24)', 1);
      continue;
    }
    const image = await loadSafeImage(item.image_url);
    if (image) {
      const bx = x + 20, by = y + 18, bw = 350, bh = 144;
      const scale = Math.max(bw / image.width, bh / image.height);
      const dw = image.width * scale, dh = image.height * scale;
      ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.clip();
      ctx.drawImage(image, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh); ctx.restore();
      rounded(ctx, bx, by, bw, bh, 12, null, 'rgba(208,232,248,0.65)', 2);
    } else {
      crown(ctx, x + 195, y + 80, 0.85, C.silver);
      drawText(ctx, 'DOS', x + 195, y + 128, 24, C.cyan, 900, 'center', 120);
    }
    drawText(ctx, item.name || 'منتج DOS', x + 195, y + 202, 22, C.white, 900, 'center', 350);
    drawText(ctx, item.display_price || `${formatNumber(item.price)} DOS Coin`, x + 195, y + 242, 20, C.cyan, 900, 'center', 350);
  }
  footer(ctx, bg.width, bg.height, 'DOS SHOP • PRODUCTS');
  return canvas.toBuffer('image/png');
}

async function renderMainPanel({ title = 'DOS COMMUNITY', body = '' } = {}) {
  const bg = await loadTemplate('main-panel-base.png');
  const canvas = createCanvas(bg.width, bg.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bg, 0, 0);
  await header(ctx, bg.width, title || 'مرحباً بك في مجتمع DOS COMMUNITY', 'اكتشف أنظمة السيرفر وشارك في مجتمعنا');
  wrapText(ctx, body || 'هنا تجد جميع الأنظمة والقوانين، ويمكنك تفعيل رتب التفاعل ومعرفة نظام السيرفر والمشاركة في الفعاليات.', 1370, 267, 1215, 21, 31, C.silver, 3);
  drawText(ctx, 'DOS COMMUNITY', 1370, 346, 16, C.cyan, 700);
  const boxes = [
    { x: 90, y: 405, w: 640, h: 115, icon: '▤', title: 'قوانين السيرفر', en: 'Server Rules' },
    { x: 770, y: 405, w: 640, h: 115, icon: 'i', title: 'معلومات السيرفر', en: 'Server Information' },
    { x: 90, y: 540, w: 640, h: 115, icon: '◈', title: 'رتب التفاعل', en: 'Notification Roles' },
    { x: 770, y: 540, w: 640, h: 115, icon: '⚙', title: 'نظام السيرفر', en: 'Server System' },
    { x: 425, y: 675, w: 650, h: 80, icon: '✦', title: 'الفعاليات', en: 'Arena & Events' }
  ];
  boxes.forEach((b) => {
    drawText(ctx, b.icon, b.x + b.w - 62, b.y + b.h / 2, 30, C.cyan, 900, 'center', 55);
    drawText(ctx, b.title, b.x + b.w / 2, b.y + b.h / 2 - 12, 24, C.white, 900, 'center', b.w - 130);
    drawText(ctx, b.en, b.x + b.w / 2, b.y + b.h / 2 + 22, 16, C.silver, 700, 'center', b.w - 130);
  });
  footer(ctx, bg.width, bg.height, 'DOS COMMUNITY • MAIN PANEL');
  return canvas.toBuffer('image/png');
}

async function renderPanelPage({ guild = null, title = 'DOS COMMUNITY', body = '', sections = [], subtitle = 'DOS COMMUNITY • SILVER × CYAN' }) {
  const bg = await loadTemplate('content-panel-base.png');
  const canvas = createCanvas(bg.width, bg.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bg, 0, 0);
  await header(ctx, bg.width, title, subtitle);
  const logo = guild && typeof guild.iconURL === 'function' ? await loadSafeImage(guild.iconURL({ extension: 'png', size: 128 })) : null;
  if (logo) drawAvatar(ctx, logo, 72, 245, 78);
  wrapText(ctx, body, 1360, 292, 1220, 23, 42, C.silver, 8);
  if (sections.length) {
    const count = Math.min(5, sections.length), gap = 16, width = (bg.width - 140 - gap * (count - 1)) / count;
    sections.slice(0, count).forEach((section, i) => {
      const x = 70 + i * (width + gap);
      rounded(ctx, x, 560, width, 70, 14, '#0D2538', C.cyan, 2);
      drawText(ctx, section, x + width / 2, 595, 18, C.white, 800, 'center', width - 18);
    });
  }
  footer(ctx, bg.width, bg.height, subtitle);
  return canvas.toBuffer('image/png');
}

async function renderLevelSystemPage({ messageXp = 7, voiceXp = 9, xpPerCoin = 250 } = {}) {
  const bg = await loadTemplate('level-system-base.png');
  const canvas = createCanvas(bg.width, bg.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bg, 0, 0);
  await header(ctx, bg.width, 'نظام المستويات', 'مراحل تطور المستويات وصعوبة الترقّي');
  const tiers = [
    { y: 245, range: 'المستويات 1–50', stage: 'المرحلة الأولى', desc: 'من سهل إلى متوسط', note: 'تدرّج مناسب لبداية التفاعل', color: C.green },
    { y: 385, range: 'المستويات 51–100', stage: 'المرحلة الثانية', desc: 'من متوسط إلى صعب', note: 'تحدٍ أكبر مع استمرار النشاط', color: C.cyan },
    { y: 525, range: 'المستوى 101 فأعلى', stage: 'المرحلة الثالثة', desc: 'صعب', note: 'مخصص للأعضاء الأكثر نشاطاً وتفاعلاً', color: C.purple }
  ];
  tiers.forEach((t) => {
    crown(ctx, 1290, t.y + 52, 0.8, t.color);
    drawText(ctx, t.stage, 1190, t.y + 32, 18, t.color, 800);
    drawText(ctx, t.range, 1190, t.y + 76, 24, C.white, 900);
    drawText(ctx, t.desc, 720, t.y + 43, 25, C.white, 900, 'center', 650);
    drawText(ctx, t.note, 720, t.y + 80, 17, C.muted, 600, 'center', 650);
  });
  drawText(ctx, 'طرق الحصول على الخبرة', 1360, 713, 20, C.cyan, 900);
  drawText(ctx, `الرسائل: ${Number(messageXp)} XP لكل رسالة`, 1330, 753, 19, C.white, 700);
  drawText(ctx, `الصوت: ${Number(voiceXp)} XP لكل دقيقة مؤهلة`, 780, 753, 19, C.white, 700);
  drawText(ctx, `كل ${Number(xpPerCoin)} XP = 1 DOS Coin`, 250, 753, 19, C.gold, 800);
  footer(ctx, bg.width, bg.height, 'DOS COMMUNITY • LEVELS');
  return canvas.toBuffer('image/png');
}

async function renderAdminDashboard({ stats = {}, features = {} } = {}) {
  const bg = await loadTemplate('admin-dashboard-base.png');
  const canvas = createCanvas(bg.width, bg.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bg, 0, 0);
  await header(ctx, bg.width, 'لوحة الإدارة الشاملة', 'إدارة وتحكم في أنظمة DOS COMMUNITY من مكان واحد');
  crown(ctx, 195, 285, 0.95, C.silver);
  drawText(ctx, 'DOS ADMIN', 195, 345, 22, C.white, 900, 'center');
  const nav = ['الرئيسية', 'إدارة المتجر', 'الغرف الخاصة', 'اللوحات والرسائل', 'تشغيل الأنظمة', 'العملات والمستويات', 'رتب التفاعل', 'طلبات المتجر'];
  nav.forEach((label, i) => {
    rounded(ctx, 82, 345 + i * 57, 228, 46, 10, i === 0 ? '#10445D' : '#0C2134', i === 0 ? C.cyan : C.silverDark, 1.5);
    drawText(ctx, label, 292, 368 + i * 57, 17, C.white, 700);
  });
  const modules = [
    ['إدارة المتجر', 'shop'], ['الغرف الخاصة', 'rooms'], ['اللوحات والرسائل', 'content'], ['تشغيل الأنظمة', 'features'],
    ['العملات والمستويات', 'economy'], ['رتب التفاعل', 'roles'], ['رتب المستويات', 'level_roles'], ['طلبات المتجر', 'sales']
  ];
  modules.forEach(([label, key], i) => {
    const col = i % 4, row = Math.floor(i / 4), x = 355 + col * 263, y = 260 + row * 190;
    const on = features[key] !== false;
    const color = on ? C.cyan : C.silverDark;
    crown(ctx, x + 120, y + 51, 0.62, C.silver);
    drawText(ctx, label, x + 120, y + 111, 18, C.white, 800, 'center', 222);
    rounded(ctx, x + 71, y + 127, 100, 21, 11, on ? '#0A493A' : '#283443', on ? C.green : C.silverDark, 1);
    drawText(ctx, on ? 'مفعّل' : 'متوقف', x + 121, y + 138, 12, on ? C.green : C.muted, 800, 'center', 90);
  });
  rounded(ctx, 355, 665, 1038, 160, 18, '#091B2C', C.silver, 2);
  drawText(ctx, `الأعضاء المسجلون: ${formatNumber(stats.members)}`, 1360, 716, 20, C.white, 800);
  drawText(ctx, `الرسائل: ${formatNumber(stats.messages)}`, 1020, 716, 20, C.cyan, 800);
  drawText(ctx, `العملات المتداولة: ${formatNumber(stats.coins)}`, 1360, 765, 20, C.gold, 800);
  drawText(ctx, `وقت الصوت: ${(Number(stats.voice_seconds || 0) / 3600).toFixed(1)} ساعة`, 1020, 765, 20, C.silver, 800);
  footer(ctx, bg.width, bg.height, 'DOS CONTROL PANEL • ADMIN ONLY');
  return canvas.toBuffer('image/png');
}

async function renderAdminShop(products = []) {
  const bg = await loadTemplate('admin-shop-base.png');
  const canvas = createCanvas(bg.width, bg.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bg, 0, 0);
  await header(ctx, bg.width, 'إدارة المتجر', 'DOS SHOP • إضافة المنتجات وتعديلها ومراجعة الطلبات');
  drawText(ctx, 'معاينة المنتجات', 520, 287, 23, C.white, 900);
  drawText(ctx, 'قائمة المنتجات', 1390, 287, 23, C.white, 900);
  const preview = products.slice(0, 6);
  if (!preview.length) drawText(ctx, 'أضف المنتجات لتظهر هنا', 310, 520, 22, C.muted, 700, 'center');
  preview.forEach((p, i) => {
    const col = i % 2, row = Math.floor(i / 2), x = 90 + col * 230, y = 330 + row * 135;
    rounded(ctx, x, y, 205, 112, 14, '#0B2439', C.cyan, 2);
    drawText(ctx, p.name || 'منتج DOS', x + 102, y + 40, 17, C.white, 800, 'center', 185);
    const currency = p.currency === 'cash' ? 'نقداً' : 'DOS Coin';
    drawText(ctx, `${formatNumber(p.price)} ${currency}`, x + 102, y + 78, 15, C.cyan, 800, 'center', 185);
  });
  const list = products.slice(0, 6);
  list.forEach((p, i) => {
    const y = 340 + i * 70;
    rounded(ctx, 610, y, 790, 52, 12, '#0D2538', p.active ? C.cyan : C.silverDark, 1.5);
    drawText(ctx, p.name || 'منتج DOS', 1360, y + 25, 17, C.white, 800);
    const currency = p.currency === 'cash' ? 'نقداً' : 'Coin';
    drawText(ctx, `${formatNumber(p.price)} ${currency}`, 900, y + 25, 16, C.cyan, 700, 'center', 240);
    drawText(ctx, p.active ? 'مفعّل' : 'متوقف', 650, y + 25, 14, p.active ? C.green : C.muted, 800, 'left', 95);
  });
  drawText(ctx, 'الإضافة والتعديل وإيقاف المنتجات تتم من عناصر Discord أسفل الصورة', 1400, 805, 16, C.muted, 700);
  footer(ctx, bg.width, bg.height, 'DOS SHOP • ADMIN');
  return canvas.toBuffer('image/png');
}

module.exports = {
  renderWallet, renderTopLeaderboard, renderShopGrid, renderPanelPage,
  renderMainPanel, renderLevelSystemPage, renderAdminDashboard, renderAdminShop,
  TEMPLATE_DIR
};
