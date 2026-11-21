# DOS COMMUNITY Discord Bot

A Discord.js v14 bot designed for Node.js 20 and Nowhost Git deployment.

## Nowhost deployment

| Setting | Value |
|---|---|
| Repository root | `/` (folder containing `package.json`) |
| Branch | `main` |
| Runtime | Node.js `20.x` |
| Start command | `npm start` |
| Entry point | `src/index.js` |
| Database | `DATA_DIR/community.sqlite` |

Keep `DATA_DIR` on Nowhost persistent storage. The bot upgrades SQLite tables additively and does not intentionally delete members, XP, balances, or legacy orders. Do not delete `/app/data` or the database file when deploying.

Set these environment values in Nowhost (do not paste a real token into GitHub):

- `DISCORD_TOKEN` — bot token (secret).
- `DISCORD_CLIENT_ID` — Discord application ID.
- `DISCORD_GUILD_ID` — optional server ID for fast guild slash-command registration during setup. If omitted and the bot is in exactly one server, that server is selected automatically; otherwise commands are registered globally and may take time to appear.
- `OWNER_ID` — optional Discord user ID that can access the admin panel. Server Administrators can also access it.
- `BOT_PREFIX` — optional, defaults to `.`.
- `DATA_DIR` — optional, defaults to `./data`; point this at persistent storage.
- `TZ` — optional, e.g. `Asia/Amman`.

The application must be invited with the `bot` and `applications.commands` OAuth2 scopes. Enable Message Content Intent and Server Members Intent in Discord Developer Portal → Bot → Privileged Gateway Intents.

### Discord permissions

The bot needs View Channel, Send Messages, Read Message History, Embed Links, Manage Roles, and Manage Channels. Manage Roles is required for reward/custom-color roles; place the bot's highest role above roles it should assign. Manage Channels is required to create and expire private rooms.

## Commands

- `/wallet` or `.محفظتي` — wallet.
- `/top` or writing `Top` — leaderboard. `/top` supports all XP, coins, text XP, voice XP, and all-time/daily/weekly/monthly periods.
- `/shop` or `.المتجر` — DOS shop.
- `/color-selection order_id:<number>` — reopen a pending color selection if needed.
- `/admin-panel` — private interactive DOS CONTROL PANEL (Administrators or `OWNER_ID` only).
- `.متصدرين كتابي`, `.متصدرين صوتي`, `.متصدرين عملات`, `.إحصائيات`, `.مساعدة`.
- Existing admin commands `.تعيين_قناة` and `.رتبة_مستوى` remain available.

## Main panel and content

Use `/admin-panel` → **رتب المستويات** to link separate writing and voice reward roles to level thresholds. Use `/admin-panel` → **اللوحات والرسائل** to edit the title and body for the main panel, rules, server information, interaction notifications, server system, and events. The five public panel buttons are **قوانين السيرفر**, **معلومات السيرفر**, **رتب التفاعل**, **نظام السيرفر**, and **الفعاليات** (the description retains `Arena & Events`). Button responses are ephemeral/private to the member. Use **نشر / تحديث اللوحة الرئيسية** to publish the panel in a chosen text channel.

## Economy and levels

Defaults remain 7 XP per ordinary text message, 9 XP per eligible voice minute, and 250 XP per DOS Coin. XP and coin rates can be changed from `/admin-panel`. Text and voice XP have separate levels. The level curve gradually increases requirements: levels 1–50 (easy to medium), 51–100 (medium to hard), then 101+ (hard). Admins can adjust each curve segment, subject to continuity checks. Disabling the economy and disabling levels are separate controls.

Daily, weekly, and monthly TOP history starts accumulating from this release because older versions did not record timestamped XP events. All-time totals are preserved.

## DOS SHOP

Admins can add/edit/deactivate products and configure the shop channel and private-room category in `/admin-panel`. Product types: color, private text room, private voice room, existing Discord role, digital item, or manual fulfillment. Colors are presented from a 214-color palette, excluding pure black and pure white. Color selection uses private interaction pages; a Discord role is created/updated and assigned to the buyer.

Private room products use DOS Coin, last 30 days, send a reminder three days before expiry, and can be renewed for another 30 days. Renewal adds time to the current expiry rather than discarding remaining days. Expired channels are deleted automatically. The room owner can manage their room channel.

Cash products are separate from DOS Coin. A cash order can show an external HTTPS payment link, but payment is **not automatically verified** by the bot. An Administrator must verify receipt in the external payment provider before approving delivery. Cash refunds, if needed, are handled manually outside Discord. Automatic payment capture requires a separately integrated payment provider/webhook and is not included in this version. To keep room renewals reliable, private-room products are restricted to DOS Coin at present.

The DOS SHOP uses the exact approved six-card artwork (three columns × two rows) and displays up to six products per page. Product names, prices and uploaded product images are read from the configured product records; the real purchase select menu and page buttons remain below the PNG.

## Data and tests

SQLite file: `DATA_DIR/community.sqlite`. The migration retains existing member records and coin balances, adds the new settings/shop/room/content tables, and preserves old orders. Daily/weekly/monthly event history only starts with the new release.

Run locally or in CI: `npm install`, `npm run check`, `npm test`, `npm start`. GitHub Actions checks syntax and runs tests on pushes and pull requests.

## الصور المباشرة (PNG)

- `/wallet` و`.محفظتي` يرسلان بطاقة المحفظة كملف PNG مباشر، مع فصل تقدّم الكتابة عن الصوت.
- `/top` و`TOP` يرسلان صورة المتصدرين كملف PNG مباشر.
- `/shop` و`.المتجر` يرسلان صورة DOS SHOP الأصلية بثلاثة أعمدة وصفّين (حتى 6 منتجات في الصفحة) مع قائمة شراء وأزرار صفحات Discord أسفل الصورة.
- لوحة DOS الرئيسية وصفحات القوانين والمعلومات والنظام والفعاليات تُرسل كصور PNG مباشرة؛ وتبقى أزرار التفاعل الحقيقية كعناصر Discord أسفل صورة اللوحة.
- تستخدم خلفيات PNG المقتطعة من صورك الأصلية داخل `assets/templates/`، ويضيف البوت فوقها البيانات الحقيقية في المواضع المتغيرة فقط. صور المصدر الكاملة والقصاصات المرجعية موجودة في `assets/design-references/`.
- لا يجري تعديل مخطط بيانات الأعضاء أو حذف قاعدة البيانات بسبب إضافة الرسومات.

## القوالب والصور المعتمدة

القوالب التشغيلية هي قصاصات أصلية من الصور التي اخترتها، وليست إعادة تصميم. يحتفظ البوت بالإطار المعدني والشعار والزخرفة والتوزيع كما في المرجع، ويضع البيانات المتغيرة فوق المناطق المناسبة فقط.

- `wallet-base.png`: بطاقة المحفظة.
- `leaderboard-base.png`: لوحة TOP والمتصدرين.
- `shop-base.png`: واجهة DOS SHOP الأصلية بستة مواضع فارغة للمنتجات، مع الإبقاء على الشارات وإطارات الأسعار.
- `main-panel-base.png`: لوحة السيرفر العامة بخمسة أقسام؛ نص الترحيب يُكتب في المساحة الأصلية الفارغة، والأزرار الحقيقية تُرسل أسفلها.
- `content-panel-base.png`: بطاقة رسالة القوانين/المعلومات؛ ويُرفق النص الكامل في رسالة Discord حتى لا يُقص المحتوى الطويل.
- `level-system-base.png`: إنفوجرافيك مراحل المستويات.
- `level-up-base.png`: إعلان الوصول إلى مستوى جديد.
- `admin-dashboard-base.png`: صورة لوحة الإدارة الأصلية كما هي؛ تُعرض الإحصائيات الحية في بطاقة Discord تحتها حتى لا يتغير شكل الصورة المختارة.
- `admin-shop-base.png`: صورة إدارة المتجر الأصلية كما هي؛ تظهر المنتجات الفعلية وأسعارها وحالاتها في بطاقة Discord وقائمة الاختيار أسفلها.

الصور المصدرية الخمس والقصاصات موجودة في `assets/design-references/`. خريطة ربط الملفات ووظائفها في `assets/templates/images-map.json`. لا تحذف ملفات القوالب التسعة ولا تغيّر أسماءها. لا تحتوي الحزمة على قاعدة بيانات الإنتاج أو ملف `.env` أو رمز Discord.
