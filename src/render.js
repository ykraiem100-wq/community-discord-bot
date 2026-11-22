'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'assets', 'templates');
const FONT_DIR = path.join(ROOT, 'assets', 'fonts');
const C = Object.freeze({
  ink: '#06111C', ink2: '#0A1A29', white: '#F7FAFD', silver: '#DCE6F0',
  muted: '#B9C8D6', cyan: '#39D8FF', cyanBright: '#7CEBFF', gold: '#FFD45F',
  green: '#69DEB6', red: '#FF7888'
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
    { x: 380, y: 87, size: 54, index: 2, tint: '#C48C63' }
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
    { index: 2, x: 337, w: 126, color: '#D49B6D' }
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

// Welcome panel modeled on the supplied Discord welcome-message reference.
// The guild icon/name and owner signature are dynamic; editable copy comes from the admin panel.
async function renderMainPanel({ guild = null, title = '', body = '', signature = '' } = {}) {
  const canvas = createCanvas(1200, 900);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 900);
  bg.addColorStop(0, '#303136'); bg.addColorStop(1, '#383A40');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 900);
  patch(ctx, 16, 16, 1168, 868, '#37393F', 22, '#4A4C53');
  patch(ctx, 16, 16, 10, 868, '#D51F32', 8);
  const iconUrl = guild && typeof guild.iconURL === 'function'
    ? guild.iconURL({ extension: 'png', size: 512 }) : null;
  const icon = await loadSafeImage(iconUrl);
  const logoSize = 230, logoX = 600 - logoSize / 2, logoY = 62;
  ctx.save();
  ctx.beginPath(); ctx.arc(600, logoY + logoSize / 2, logoSize / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = '#D51F32'; ctx.lineWidth = 5; ctx.shadowColor = 'rgba(213,31,50,0.35)'; ctx.shadowBlur = 18; ctx.stroke();
  ctx.beginPath(); ctx.arc(600, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2); ctx.clip();
  if (icon) ctx.drawImage(icon, logoX, logoY, logoSize, logoSize);
  else {
    const fallback = ctx.createLinearGradient(logoX, logoY, logoX + logoSize, logoY + logoSize);
    fallback.addColorStop(0, '#16181D'); fallback.addColorStop(1, '#555861');
    ctx.fillStyle = fallback; ctx.fillRect(logoX, logoY, logoSize, logoSize);
    drawText(ctx, 'DOS', 600, logoY + logoSize / 2, 60, C.white, 900, 'center', 170);
  }
  ctx.restore();
  drawText(ctx, truncate(guild && guild.name ? guild.name : 'DOS COMMUNITY', 48), 600, 328, 40, C.white, 900, 'center', 1000);
  drawText(ctx, title || 'مرحباً بك في مجتمعنا الرسمي', 600, 390, 30, '#F2F2F4', 800, 'center', 1060);
  ctx.save(); ctx.strokeStyle = '#55575E'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(58, 430); ctx.lineTo(1142, 430); ctx.stroke(); ctx.restore();
  const lines = wrapLines(ctx, body || '', 1050, 24, 10);
  const startY = lines.length > 7 ? 475 : 500;
  lines.forEach((line, index) => drawText(ctx, line, 600, startY + index * 39, 24, '#D9EAF0', 650, 'center', 1050));
  ctx.save(); ctx.strokeStyle = '#55575E'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(58, 817); ctx.lineTo(1142, 817); ctx.stroke(); ctx.restore();
  drawText(ctx, signature || 'تحيات إدارة DOS COMMUNITY', 1120, 846, 22, '#BFC1C7', 700, 'right', 960);
  return canvas.toBuffer('image/png');
}

// Wide shop banner. The medallion is filled with the current Discord server icon at runtime.
// This keeps the shop branded to the actual guild instead of using a generic mascot.
async function renderShopHeader(guild = null) {
  const source = await loadSafeImage(path.join(TEMPLATE_DIR, 'shop-crest-bg.png'));
  const canvas = createCanvas(1200, 560);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 560);
  bg.addColorStop(0, '#282A2F'); bg.addColorStop(1, '#383A40');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 560);
  if (source) drawImageContain(ctx, source, 0, 0, 735, 560, 18);

  const iconUrl = guild && typeof guild.iconURL === 'function'
    ? guild.iconURL({ extension: 'png', size: 512 }) : null;
  const serverIcon = await loadSafeImage(iconUrl);
  // The image template has an empty circular crest here; the real server icon is clipped into it.
  drawCircleImage(ctx, serverIcon, 122, 93, 220, '#E4B94F', 4);

  patch(ctx, 752, 98, 430, 360, 'rgba(38,40,46,0.32)', 24, 'rgba(255,255,255,0.06)');
  drawText(ctx, 'CREDITS SHOP', 967, 205, 54, '#FFF8E7', 1000, 'center', 405);
  const serverName = guild && guild.name ? guild.name : 'DOS COMMUNITY';
  drawText(ctx, serverName, 967, 282, 27, '#E7C26D', 850, 'center', 390);
  ctx.save(); ctx.strokeStyle = '#CDA64B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(810, 330); ctx.lineTo(1124, 330); ctx.stroke(); ctx.restore();
  drawText(ctx, 'COLORS  •  CUSTOM ROLES  •  ITEMS', 967, 382, 17, '#E5E6E9', 800, 'center', 395);
  return canvas.toBuffer('image/png');
}

// Full-spectrum HSV wheel: a visual reference paired with a hex-input modal for any sRGB color.
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
  ctx.strokeStyle = '#E5C36B'; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(center, center, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#34363B'; ctx.fill(); ctx.strokeStyle = '#F2F2F4'; ctx.lineWidth = 2; ctx.stroke();
  drawText(ctx, 'HEX', center, center, 13, C.white, 900, 'center', 32);
  return canvas.toBuffer('image/png');
}

// Reusable image header rendered for every admin section, with live section title/description.
function renderAdminSection({ title = 'إدارة DOS COMMUNITY', subtitle = 'لوحة التحكم', emblem = 'DOS' } = {}) {
  const canvas = createCanvas(1200, 280);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 280);
  bg.addColorStop(0, '#292B31'); bg.addColorStop(1, '#3A3C43');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 280);
  patch(ctx, 10, 10, 1180, 260, '#37393F', 22, '#50525A');
  patch(ctx, 10, 10, 9, 260, '#DDB84E', 5);
  ctx.save(); ctx.beginPath(); ctx.arc(145, 140, 82, 0, Math.PI * 2);
  const halo = ctx.createLinearGradient(70, 60, 220, 220);
  halo.addColorStop(0, '#EACB76'); halo.addColorStop(1, '#6F8F9F');
  ctx.fillStyle = '#25272D'; ctx.fill(); ctx.strokeStyle = halo; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
  drawText(ctx, String(emblem).slice(0, 10), 145, 140, 32, '#EBD38D', 900, 'center', 136);
  drawText(ctx, 'DOS COMMUNITY  •  CONTROL PANEL', 280, 85, 18, '#DCC27B', 850, 'left', 850);
  drawText(ctx, title, 280, 143, 43, '#F5F5F6', 900, 'left', 850);
  drawText(ctx, subtitle, 280, 206, 22, '#C8CBD1', 650, 'left', 850);
  return canvas.toBuffer('image/png');
}

// A dedicated content card cropped from the chosen rules-message design.
async function renderPanelPage({ guild = null, title = 'قوانين السيرفر', body = '', subtitle = '' } = {}) {
  const bg = await loadTemplate('content-panel-base.png');
  const { canvas, ctx } = scaleCanvas(bg, 2.35);
  drawText(ctx, truncate(title || 'DOS COMMUNITY', 38), 204, 47, 22, C.white, 900, 'center', 280);
  const lines = wrapLines(ctx, body, 395, 13, 5);
  const startY = lines.length >= 5 ? 105 : lines.length === 4 ? 111 : lines.length === 3 ? 120 : lines.length === 2 ? 133 : 145;
  lines.forEach((line, i) => drawText(ctx, line, bg.width / 2, startY + i * 14, 13, C.silver, 650, 'center', 395));
  return canvas.toBuffer('image/png');
}

// Exact level-system infographic; only the three configurable rate values are refreshed.
async function renderLevelSystemPage({ messageXp = 7, voiceXp = 9, xpPerCoin = 250 } = {}) {
  const bg = await loadTemplate('level-system-base.png');
  const { canvas, ctx } = scaleCanvas(bg, 2.2);
  patch(ctx, 66, 226, 205, 28, 'rgba(2,11,20,0.94)', 4);
  patch(ctx, 66, 268, 205, 28, 'rgba(2,11,20,0.94)', 4);
  patch(ctx, 445, 241, 220, 50, 'rgba(2,11,20,0.94)', 4);
  drawText(ctx, `${Number(messageXp)} XP لكل رسالة`, 166, 240, 15, C.white, 800, 'center', 195);
  drawText(ctx, `${Number(voiceXp)} XP لكل دقيقة في الصوت`, 166, 282, 14, C.white, 800, 'center', 195);
  drawText(ctx, `كل ${Number(xpPerCoin)} XP تساوي`, 555, 253, 14, C.white, 800, 'center', 205);
  drawText(ctx, '1 DOS Coin', 555, 277, 19, C.cyanBright, 900, 'center', 205);
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

// Full reference dashboard is retained as the canvas; the live metrics and section states are refreshed.
async function renderAdminDashboard() {
  // The original admin screen is a complete approved UI mockup. Keep it pixel-identical;
  // current statistics are sent in a Discord embed beside the image, not painted over it.
  const bg = await loadTemplate('admin-dashboard-base.png');
  const { canvas } = scaleCanvas(bg, 1);
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
