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

// Exact public panel image; its five labels and icon placements are preserved from the approved art.
async function renderMainPanel({ title = '', body = '' } = {}) {
  // The selected frame, logo and five button tiles remain exactly as approved.
  // Only the editable welcome copy is laid into the original central text area.
  const bg = await loadTemplate('main-panel-base.png');
  const { canvas, ctx } = scaleCanvas(bg, 1.8);
  const safeTitle = truncate(title || 'مرحباً بك في مجتمع DOS COMMUNITY', 58);
  const lines = wrapLines(ctx, body || 'هنا تجد جميع الأنظمة والقوانين، يمكنك تفعيل رتب التفاعل، ومعرفة نظام السيرفر والمشاركة في الفعاليات.', 620, 18, 2);
  drawText(ctx, safeTitle, 410, 195, 21, C.white, 900, 'center', 640);
  lines.forEach((line, index) => drawText(ctx, line, 410, 232 + index * 28, 17, C.silver, 700, 'center', 635));
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
  TEMPLATE_DIR
};
