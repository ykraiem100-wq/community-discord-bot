'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'assets', 'templates');
const FONT_DIR = path.join(ROOT, 'assets', 'fonts');
const C = Object.freeze({
  ink: '#06111C', ink2: '#0A1A29', white: '#F7FAFD', silver: '#DCE6F0',
  muted: '#B9C8D6', cyan: '#55DDF5', cyanBright: '#A7F3FF', gold: '#63DDF5',
  green: '#69DEB6', red: '#63DDF5'
});
const FONT = 'DOSArabic, DOSLatin, Arial, sans-serif';

function registerFonts() {
  for (const [file, family] of [
    ['NotoSansArabic-Regular.ttf', 'DOSArabic'],
    ['NotoSansArabic-Bold.ttf', 'DOSArabic'],
    ['NotoSans-Regular.ttf', 'DOSLatin'],
    ['NotoSans-Bold.ttf', 'DOSLatin']
  ]) {
    const full = path.join(FONT_DIR, file);
    if (!fs.existsSync(full)) continue;
    try { GlobalFonts.registerFromPath(full, family); }
    catch (error) { console.warn('[PNG] Font registration failed:', file, error.message); }
  }
}
registerFonts();

const templateCache = new Map();
async function loadTemplate(filename) {
  const full = path.join(TEMPLATE_DIR, filename);
  if (!fs.existsSync(full)) throw new Error(`Missing approved DOS reference template: assets/templates/${filename}`);
  if (!templateCache.has(filename)) templateCache.set(filename, loadImage(full));
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
    console.warn('[PNG] Optional image could not be loaded:', error.message);
  }
  return null;
}
function drawText(ctx, value, x, y, size = 18, color = C.white, weight = 700, align = 'right', maxWidth = 1200) {
  const text = String(value ?? '');
  ctx.save();
  const hasArabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(text);
  const fontStack = hasArabic ? 'DOSArabic, DOSLatin, Arial, sans-serif' : 'DOSLatin, DOSArabic, Arial, sans-serif';
  ctx.font = `${weight} ${size}px ${fontStack}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.direction = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(text) ? 'rtl' : 'ltr';
  ctx.shadowColor = color === C.cyan || color === C.cyanBright ? 'rgba(57,216,255,0.55)' : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = color === C.cyan || color === C.cyanBright ? 6 : 1;
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}
function patch(ctx, x, y, width, height, fill = 'rgba(3,12,22,0.92)', radius = 7, stroke = null) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}
function roundedClip(ctx, x, y, width, height, radius) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.clip();
}
function drawCircleImage(ctx, image, x, y, size, border = C.cyan, lineWidth = 2) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 + lineWidth + 1, 0, Math.PI * 2);
  ctx.strokeStyle = border; ctx.lineWidth = lineWidth; ctx.shadowColor = border; ctx.shadowBlur = 8; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  if (image) ctx.drawImage(image, x, y, size, size);
  else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#15516D'); g.addColorStop(1, '#07121E');
    ctx.fillStyle = g; ctx.fillRect(x, y, size, size);
    drawText(ctx, 'DOS', x + size / 2, y + size / 2, Math.max(12, size * 0.2), C.silver, 900, 'center', size * 0.8);
  }
  ctx.restore();
}
function drawImageContain(ctx, image, x, y, width, height, radius = 8) {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.save(); roundedClip(ctx, x, y, width, height, radius);
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}
function drawImageCover(ctx, image, x, y, width, height, radius = 8) {
  if (!image) return;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.save(); roundedClip(ctx, x, y, width, height, radius);
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}
function formatNumber(value) { return Math.max(0, Number(value) || 0).toLocaleString('en-US'); }
function truncate(value, max = 22) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
function wrapLines(ctx, value, width, size, maxLines = 3) {
  ctx.save(); ctx.font = `600 ${size}px ${FONT}`;
  const lines = [];
  for (const paragraph of String(value || '').split(/\r?\n/)) {
    if (!paragraph.trim()) continue;
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line); line = word;
        if (lines.length >= maxLines) break;
      } else line = next;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  ctx.restore();
  return lines;
}
function drawStar(ctx, cx, cy, outerRadius = 8, innerRadius = 3.5, color = C.gold) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 5; ctx.fill();
  ctx.restore();
}

function drawProgressBar(ctx, x, y, width, height, percent) {
  const p = Math.max(0, Math.min(1, Number(percent) || 0));
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, width, height, height / 2);
  const base = ctx.createLinearGradient(x, y, x + width, y);
  base.addColorStop(0, '#06111B'); base.addColorStop(1, '#13384B');
  ctx.fillStyle = base; ctx.fill(); ctx.strokeStyle = 'rgba(133,229,255,0.75)'; ctx.lineWidth = 1.2; ctx.stroke();
  if (p > 0) {
    ctx.beginPath(); ctx.roundRect(x + 2, y + 2, Math.max(height - 4, (width - 4) * p), height - 4, (height - 4) / 2);
    const fill = ctx.createLinearGradient(x, y, x + width, y);
    fill.addColorStop(0, '#00C5ED'); fill.addColorStop(1, '#0783B2');
    ctx.fillStyle = fill; ctx.shadowColor = C.cyan; ctx.shadowBlur = 9; ctx.fill();
  }
  ctx.restore();
}
function scaleCanvas(template, scale = 2) {
  const canvas = createCanvas(Math.round(template.width * scale), Math.round(template.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  return { canvas, ctx, scale };
}

// Exact wallet card crop from the approved first reference image.
async function renderWallet({ user, profile = {}, textProgress = {}, level = null, displayName = '' }) {
  const bg = await loadTemplate('wallet-base.png');
  const { canvas, ctx } = scaleCanvas(bg, 2.6);
  const avatarUrl = user && typeof user.displayAvatarURL === 'function'
    ? user.displayAvatarURL({ extension: 'png', size: 512 }) : null;
  const avatar = await loadSafeImage(avatarUrl);
  ctx.save();
  roundedClip(ctx, 43, 53, 119, 113, 54);
  if (avatar) ctx.drawImage(avatar, 43, 53, 119, 113);
  else {
    const fallback = ctx.createLinearGradient(43, 53, 162, 166);
    fallback.addColorStop(0, '#1A6480'); fallback.addColorStop(1, '#07121E');
    ctx.fillStyle = fallback; ctx.fillRect(43, 53, 119, 113);
    drawText(ctx, 'DOS', 102, 112, 25, C.silver, 900, 'center', 90);
  }
  ctx.restore();

  const name = displayName || (user && (user.globalName || user.username)) || 'عضو DOS';
  drawText(ctx, name.startsWith('@') ? name : '@' + name, 210, 92, 17, C.white, 900, 'left', 235);
  drawText(ctx, `${Math.max(0, Number(level ?? textProgress.level) || 0)} المستوى`, 325, 126, 18, C.white, 900, 'right', 116);
  drawStar(ctx, 341, 126, 8, 3.4, C.gold);

  const currentXp = Number(textProgress.xp || 0);
  const nextXp = Math.max(1, Number(textProgress.needed || 1));
  const percent = Math.max(0, Math.min(1, Number(textProgress.percent) / 100 || currentXp / nextXp));
  drawProgressBar(ctx, 207, 149, 272, 24, percent);
  drawText(ctx, `${formatNumber(currentXp)} / ${formatNumber(nextXp)} XP`, 343, 161, 11, C.white, 800, 'center', 185);

  const voiceMinutes = Math.floor(Math.max(0, Number(profile.voice_seconds) || 0) / 60);
  const metrics = [
    { x: 83, value: formatNumber(profile.coins), color: C.gold },
    { x: 221, value: formatNumber(profile.messages), color: C.white },
    { x: 360, value: formatNumber(voiceMinutes), color: C.cyan },
    { x: 498, value: formatNumber(profile.invites), color: C.silver }
  ];
  metrics.forEach((metric) => drawText(ctx, metric.value, metric.x, 277, 17, metric.color, 900, 'center', 126));
  return canvas.toBuffer('image/png');
}

// Exact TOP panel crop; its six visible slots match the approved source composition.
async function renderTopLeaderboard({ guild = null, entries = [], period = 'all', metric = 'all' }) {
  const bg = await loadTemplate('leaderboard-base.png');
  const { canvas, ctx } = scaleCanvas(bg, 3);
  const rows = (entries || []).slice(0, 6);
  const metricNames = { all: 'الخبرة (XP)', text: 'الخبرة الكتابية (XP)', voice: 'الخبرة الصوتية (XP)', coins: 'DOS Coin' };
  const periodNames = { all: 'منذ البداية', daily: 'اليومي', weekly: 'الأسبوعي', monthly: 'الشهري' };
  patch(ctx, 145, 5, 220, 48, 'rgba(2,10,18,0.90)', 7);
  drawText(ctx, `المتصدرون - ${metricNames[metric] || metricNames.all}`, 255, 22, 14, C.white, 900, 'center', 210);
  drawText(ctx, periodNames[period] || periodNames.all, 255, 40, 9, C.cyan, 800, 'center', 210);

  const avatarSlots = [
    { x: 78, y: 87, size: 54, index: 1, tint: '#C7D1DB' },
    { x: 224, y: 68, size: 69, index: 0, tint: C.gold },
    { x: 380, y: 87, size: 54, index: 2, tint: '#76DFF4' }
  ];
  for (const slot of avatarSlots) {
    const entry = rows[slot.index];
    if (!entry) continue;
    const image = await loadSafeImage(entry.avatarURL || entry.avatar_url);
    drawCircleImage(ctx, image, slot.x, slot.y, slot.size, slot.tint, 2);
  }
  const podium = [
    { index: 1, x: 49, w: 130, color: C.silver },
    { index: 0, x: 188, w: 137, color: C.gold },
    { index: 2, x: 337, w: 126, color: '#65C9E7' }
  ];
  for (const slot of podium) {
    const entry = rows[slot.index];
    patch(ctx, slot.x, 145, slot.w, 63, 'rgba(3,12,22,0.94)', 5);
    if (!entry) {
      drawText(ctx, `#${slot.index + 1}`, slot.x + slot.w / 2, 160, 12, slot.color, 900, 'center', slot.w - 10);
      drawText(ctx, '—', slot.x + slot.w / 2, 185, 12, C.muted, 700, 'center', slot.w - 10);
      continue;
    }
    drawText(ctx, `#${slot.index + 1}`, slot.x + slot.w / 2, 155, 11, slot.color, 900, 'center', slot.w - 10);
    drawText(ctx, truncate(entry.name || 'عضو DOS', 16), slot.x + slot.w / 2, 174, 11, C.white, 800, 'center', slot.w - 12);
    drawText(ctx, formatNumber(entry.score), slot.x + slot.w / 2, 193, 10, slot.color, 800, 'center', slot.w - 12);
  }
  for (let i = 0; i < 3; i += 1) {
    const entry = rows[i + 3];
    const y = [230, 260, 289][i];
    patch(ctx, 39, y - 12, 430, 25, 'rgba(4,14,24,0.94)', 4);
    drawText(ctx, `#${i + 4}`, 52, y, 11, C.cyan, 900, 'left', 35);
    drawText(ctx, entry ? truncate(entry.name || 'عضو DOS', 24) : '—', 91, y, 11, C.white, 700, 'left', 240);
    drawText(ctx, entry ? formatNumber(entry.score) : '—', 461, y, 11, C.silver, 800, 'right', 95);
  }
  return canvas.toBuffer('image/png');
}

// Exact six-product DOS SHOP crop; Discord's purchase menu/pagination remains interactive below it.
async function renderShopGrid(items = []) {
  // The six card positions are cut from the approved DOS SHOP image. Product
  // names/prices are the only editable copy; each original frame and D-coin badge remains.
  const bg = await loadTemplate('shop-base.png');
  const { canvas, ctx } = scaleCanvas(bg, 2.25);
  const visible = (items || []).slice(0, 6);
  const slots = [
    { x: 58, iconY: 142, nameY: 226, priceY: 266 },
    { x: 232, iconY: 142, nameY: 226, priceY: 266 },
    { x: 407, iconY: 142, nameY: 226, priceY: 266 },
    { x: 58, iconY: 309, nameY: 389, priceY: 430 },
    { x: 232, iconY: 309, nameY: 389, priceY: 430 },
    { x: 407, iconY: 309, nameY: 389, priceY: 430 }
  ];
  for (let i = 0; i < slots.length; i += 1) {
    const item = visible[i];
    const slot = slots[i];
    const center = slot.x + 62;
    if (!item) {
      drawText(ctx, 'غير متاح', center, slot.nameY, 12, C.muted, 700, 'center', 128);
      continue;
    }
    const image = await loadSafeImage(item.image_url);
    if (image) {
      patch(ctx, slot.x - 2, slot.iconY - 1, 128, 75, 'rgba(3,12,22,0.84)', 9, 'rgba(130,224,255,0.7)');
      drawImageContain(ctx, image, slot.x + 5, slot.iconY + 4, 112, 64, 7);
    }
    drawText(ctx, truncate(item.name || 'منتج DOS', 18), center, slot.nameY, 12, C.white, 900, 'center', 132);
    const cash = item.currency === 'cash';
    const price = cash
      ? `${Number(item.price || 0).toFixed(2)} ${item.cash_currency || 'JOD'}`
      : formatNumber(item.price);
    if (cash) {
      // Cash entries are explicit; cover the embedded DOS Coin medallion in this one slot.
      patch(ctx, slot.x + 81, slot.priceY - 12, 31, 24, 'rgba(3,12,22,0.92)', 12);
      drawText(ctx, 'JOD', slot.x + 96, slot.priceY, 8, C.silver, 800, 'center', 28);
      drawText(ctx, price, slot.x + 47, slot.priceY, 10, C.white, 900, 'center', 82);
    } else {
      drawText(ctx, price, slot.x + 50, slot.priceY, 13, C.white, 900, 'center', 70);
    }
  }
  return canvas.toBuffer('image/png');
}

// Brand mark supplied by the server owner. Keep its artwork exact, crop it
// circularly, and add a restrained ice-cyan halo so it matches the DOS UI.
function drawBrandLogo(ctx, image, centerX, centerY, diameter, accent = '#63DDF5') {
  const radius = diameter / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + Math.max(3, diameter * 0.018), 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(3, diameter * 0.018);
  ctx.shadowColor = accent;
  ctx.shadowBlur = diameter * 0.075;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();
  if (image) ctx.drawImage(image, centerX - radius, centerY - radius, diameter, diameter);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(223, 246, 255, 0.82)';
  ctx.lineWidth = Math.max(1, diameter * 0.006);
  ctx.stroke();
  ctx.restore();
}

// The welcome image uses the exact owner-provided DOS COMMUNITY logo.
// Readable message copy remains in the Discord embed to keep Arabic text crisp.
async function renderMainPanel() {
  const canvas = createCanvas(1200, 560);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 560);
  bg.addColorStop(0, '#303238'); bg.addColorStop(1, '#383B42');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 560);
  patch(ctx, 16, 16, 1168, 528, '#373A41', 22, '#59636D');
  patch(ctx, 16, 16, 10, 528, '#63DDF5', 8);
  const logo = await loadTemplate('dos-community-logo.png');
  drawBrandLogo(ctx, logo, 600, 222, 278, '#63DDF5');
  ctx.save();
  ctx.strokeStyle = 'rgba(99,221,245,0.52)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(110, 430); ctx.lineTo(1090, 430); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(190, 478); ctx.lineTo(1010, 478); ctx.stroke();
  ctx.restore();
  return canvas.toBuffer('image/png');
}

// Full-width store artwork only: no extra card/frame or title graphic. A large DOS
// wordmark is placed in the crest medallion and the source illustration fills the image.
async function renderShopHeader(guild = null, subtitle = 'COLORS • CUSTOM ROLES • ITEMS') {
  const source = await loadSafeImage(path.join(TEMPLATE_DIR, 'shop-crest-bg.png'));
  if (!source) throw new Error('Missing DOS shop crest background.');
  const logo = await loadTemplate('dos-community-logo.png');
  const width = source.width;
  const height = source.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, width, height);
  // Place the exact DOS logo in the silver/cyan crest on the left.
  drawBrandLogo(ctx, logo, width * 0.254, height * 0.397, height * 0.466, '#63DDF5');

  // Typography sits in the intentionally empty right side of the artwork.
  drawText(ctx, 'DOS SHOP', width * 0.735, height * 0.405, 104, '#F0FAFF', 900, 'center', width * 0.46);
  ctx.save();
  ctx.strokeStyle = 'rgba(99,221,245,0.82)';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#36D9FF';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(width * 0.56, height * 0.49);
  ctx.lineTo(width * 0.91, height * 0.49);
  ctx.stroke();
  ctx.restore();
  const smallText = String(subtitle || '').trim().slice(0, 90);
  if (smallText) drawText(ctx, smallText, width * 0.735, height * 0.56, 31, '#BFEFFA', 700, 'center', width * 0.48);
  return canvas.toBuffer('image/png');
}

// Full-spectrum HSV wheel: a visual reference paired with named color choices in the Discord menu.
function renderColorWheel() {
  const size = 430, center = size / 2, radius = 185;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#34363B'; ctx.fillRect(0, 0, size, size);
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const dx = x - center, dy = y - center, r = Math.sqrt(dx * dx + dy * dy);
    const index = (y * size + x) * 4;
    if (r > radius) { image.data[index + 3] = 0; continue; }
    const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const saturation = Math.min(1, r / radius), hh = hue / 60;
    const chroma = saturation, second = chroma * (1 - Math.abs((hh % 2) - 1));
    let rr = 0, gg = 0, bb = 0;
    if (hh < 1) [rr, gg, bb] = [chroma, second, 0];
    else if (hh < 2) [rr, gg, bb] = [second, chroma, 0];
    else if (hh < 3) [rr, gg, bb] = [0, chroma, second];
    else if (hh < 4) [rr, gg, bb] = [0, second, chroma];
    else if (hh < 5) [rr, gg, bb] = [second, 0, chroma];
    else [rr, gg, bb] = [chroma, 0, second];
    const m = 1 - chroma;
    image.data[index] = Math.round((rr + m) * 255);
    image.data[index + 1] = Math.round((gg + m) * 255);
    image.data[index + 2] = Math.round((bb + m) * 255);
    image.data[index + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  ctx.beginPath(); ctx.arc(center, center, radius + 2, 0, Math.PI * 2);
  ctx.strokeStyle = '#63DDF5'; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(center, center, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#34363B'; ctx.fill(); ctx.strokeStyle = '#F2F2F4'; ctx.lineWidth = 2; ctx.stroke();
  drawText(ctx, 'DOS', center, center, 13, C.white, 900, 'center', 32);
  return canvas.toBuffer('image/png');
}

function drawAdminGlyph(ctx, emblem = '') {
  const key = String(emblem || '').toUpperCase();
  const cx = 150, cy = 150;
  ctx.save();
  ctx.strokeStyle = '#8CEFFF'; ctx.fillStyle = 'rgba(99,221,245,0.12)';
  ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); };
  if (key.includes('SHOP')) {
    ctx.beginPath(); ctx.roundRect(cx-48,cy-24,96,76,12); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy-25,28,Math.PI,0); ctx.stroke();
    line(cx-22,cy-1,cx-22,cy+15); line(cx+22,cy-1,cx+22,cy+15);
  } else if (key.includes('ROOM')) {
    ctx.beginPath(); ctx.moveTo(cx-58,cy-2); ctx.lineTo(cx,cy-52); ctx.lineTo(cx+58,cy-2); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(cx-40,cy-2,80,58,7); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(cx-10,cy+20,25,36,4); ctx.stroke();
  } else if (key.includes('CONTENT') || key.includes('PREVIEW') || key.includes('PUBLISH')) {
    ctx.beginPath(); ctx.moveTo(cx-36,cy-58); ctx.lineTo(cx+20,cy-58); ctx.lineTo(cx+48,cy-30); ctx.lineTo(cx+48,cy+58); ctx.lineTo(cx-36,cy+58); ctx.closePath(); ctx.stroke();
    line(cx+20,cy-58,cx+20,cy-30); line(cx+20,cy-30,cx+48,cy-30);
    line(cx-18,cy-4,cx+28,cy-4); line(cx-18,cy+19,cx+28,cy+19);
  } else if (key.includes('FEATURE')) {
    for (const [y,on] of [[cy-28,true],[cy+30,false]]) {
      ctx.beginPath(); ctx.roundRect(cx-62,y-19,124,38,19); ctx.stroke();
      ctx.beginPath(); ctx.arc(on?cx+22:cx-22,y,13,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
  } else if (key.includes('XP') || key.includes('LEVEL')) {
    ctx.beginPath(); ctx.moveTo(cx-62,cy+54); ctx.lineTo(cx+62,cy+54); ctx.stroke();
    ctx.fillRect(cx-52,cy+5,25,49); ctx.fillRect(cx-12,cy-20,25,74); ctx.fillRect(cx+28,cy-52,25,106);
    line(cx-49,cy-28,cx-4,cy-58); line(cx-4,cy-58,cx+23,cy-39); line(cx+23,cy-39,cx+60,cy-72);
  } else if (key.includes('MEMBER') || key.includes('ROLE')) {
    for (const [x,y,r] of [[cx-34,cy-28,19],[cx+34,cy-28,19],[cx,cy-48,22]]) {
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx,cy+52,57,Math.PI,0); ctx.stroke();
  } else if (key.includes('SALE')) {
    ctx.beginPath(); ctx.moveTo(cx-38,cy-58); ctx.lineTo(cx+38,cy-58); ctx.lineTo(cx+38,cy+58); ctx.lineTo(cx,cy+43); ctx.lineTo(cx-38,cy+58); ctx.closePath(); ctx.stroke();
    line(cx-20,cy-22,cx+20,cy-22); line(cx-20,cy+2,cx+20,cy+2); line(cx-20,cy+26,cx+10,cy+26);
  } else {
    // Terminal/command icon for the help image and general administration page.
    ctx.beginPath(); ctx.roundRect(cx-66,cy-48,132,96,12); ctx.stroke();
    line(cx-34,cy-13,cx-12,cy); line(cx-12,cy,cx-34,cy+14);
    line(cx+2,cy+17,cx+34,cy+17);
  }
  ctx.restore();
}

// Reusable cyan/silver artwork for every real admin command page. Each section has
// its own vector icon; Arabic labels and actual actions stay in the Discord embed.
function renderAdminSection({ title = '', subtitle = '', emblem = '' } = {}) {
  const canvas = createCanvas(1200, 300);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 300);
  bg.addColorStop(0, '#252B33'); bg.addColorStop(1, '#3A3E46');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 300);
  patch(ctx, 12, 12, 1176, 276, '#353A43', 22, 'rgba(99,221,245,0.52)');
  patch(ctx, 12, 12, 10, 276, '#63DDF5', 6);
  ctx.save();
  ctx.beginPath(); ctx.arc(150, 150, 95, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(13,30,42,0.55)'; ctx.fill();
  ctx.strokeStyle = 'rgba(99,221,245,0.65)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.restore();
  drawAdminGlyph(ctx, emblem || title);
  ctx.save();
  for (let i = 0; i < 3; i += 1) {
    const y = 92 + i * 62;
    ctx.beginPath(); ctx.roundRect(330, y, i === 0 ? 710 : i === 1 ? 590 : 460, 16, 8);
    ctx.fillStyle = i === 0 ? 'rgba(221,243,250,0.24)' : 'rgba(99,221,245,0.16)'; ctx.fill();
  }
  ctx.beginPath(); ctx.roundRect(330, 255, 145, 7, 3); ctx.fillStyle = 'rgba(99,221,245,0.8)'; ctx.fill();
  ctx.restore();
  return canvas.toBuffer('image/png');
}

// A dedicated content card cropped from the chosen rules-message design.
async function renderPanelPage({ guild = null, title = '', body = '', subtitle = '' } = {}) {
  // Keep Arabic titles/body in Discord embeds, while branding the panel with the
  // exact DOS logo in a small cyan-rimmed badge above the content area.
  const bg = await loadTemplate('content-panel-base.png');
  const { canvas, ctx } = scaleCanvas(bg, 2.35);
  const logo = await loadTemplate('dos-community-logo.png');
  drawBrandLogo(ctx, logo, 365, 43, 60, '#63DDF5');
  return canvas.toBuffer('image/png');
}

// Exact level-system infographic; only the three configurable rate values are refreshed.
async function renderLevelSystemPage({ messageXp = 7, voiceXp = 9, xpPerCoin = 250 } = {}) {
  // Dynamic rate values and progression are written in the Discord embed. This clean
  // cyan/silver image avoids rasterizing Arabic labels into broken glyphs.
  const bg = await loadTemplate('content-panel-base.png');
  const { canvas } = scaleCanvas(bg, 2.35);
  return canvas.toBuffer('image/png');
}

// Exact level-up reward banner crop. It shows the reached level without inventing a coin bonus.
async function renderLevelUpBanner({ level = 1 } = {}) {
  const bg = await loadTemplate('level-up-base.png');
  const { canvas, ctx } = scaleCanvas(bg, 2.1);
  const reachedLevel = Math.max(1, Number(level) || 1);
  drawText(ctx, String(reachedLevel), 299, 75, 35, C.white, 900, 'center', 60);
  drawText(ctx, `المستوى ${reachedLevel}`, 298, 194, 22, C.cyanBright, 900, 'center', 250);
  drawText(ctx, 'استمر بتفاعلك لتحصل على المزيد من المستويات', 295, 226, 12, C.silver, 800, 'center', 385);
  return canvas.toBuffer('image/png');
}

function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days} أيام ${hours} ساعة`;
  if (hours) return `${hours} ساعة ${minutes} دقيقة`;
  return `${minutes} دقيقة`;
}

// Live admin dashboard artwork contains no mock controls. The actual sections and
// commands are listed in the Discord embed/menu, so no unimplemented feature appears.
async function renderAdminDashboard({ guild = null } = {}) {
  const canvas = createCanvas(1200, 430);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 430);
  bg.addColorStop(0, '#252B33'); bg.addColorStop(1, '#3B4048');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 430);
  patch(ctx, 14, 14, 1172, 402, '#353A43', 26, 'rgba(99,221,245,0.58)');
  patch(ctx, 14, 14, 11, 402, '#63DDF5', 7);
  const iconUrl = guild && typeof guild.iconURL === 'function'
    ? guild.iconURL({ extension: 'png', size: 512 }) : null;
  const icon = await loadSafeImage(iconUrl);
  drawCircleImage(ctx, icon, 86, 92, 245, '#63DDF5', 7);
  ctx.save();
  for (let i = 0; i < 4; i += 1) {
    const x = 410 + (i % 2) * 350;
    const y = 72 + Math.floor(i / 2) * 170;
    patch(ctx, x, y, 300, 126, 'rgba(10,26,39,0.46)', 18, 'rgba(99,221,245,0.42)');
    ctx.beginPath(); ctx.arc(x + 54, y + 63, 24, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(167,243,255,0.9)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 100, y + 48); ctx.lineTo(x + 264, y + 48);
    ctx.strokeStyle = 'rgba(218,235,242,0.58)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 100, y + 78); ctx.lineTo(x + 220, y + 78);
    ctx.strokeStyle = 'rgba(99,221,245,0.56)'; ctx.lineWidth = 5; ctx.stroke();
  }
  ctx.restore();
  return canvas.toBuffer('image/png');
}

// Full shop-admin reference image, with current product data overlaid on the same six rows and preview cards.
async function renderAdminShop() {
  // Preserve the exact approved shop-management screenshot. Live product rows,
  // prices and edit actions are delivered through the real Discord controls below it.
  const bg = await loadTemplate('admin-shop-base.png');
  const { canvas } = scaleCanvas(bg, 1);
  return canvas.toBuffer('image/png');
}

module.exports = {
  renderWallet,
  renderTopLeaderboard,
  renderShopGrid,
  renderMainPanel,
  renderPanelPage,
  renderLevelSystemPage,
  renderLevelUpBanner,
  renderAdminDashboard,
  renderAdminShop,
  renderShopHeader,
  renderColorWheel,
  renderAdminSection,
  TEMPLATE_DIR
};
