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
- `/color-selection order_id:<number>` — reopen a pending color selection if needed. The picker is a full color-wheel image plus 60 named Arabic color choices; no HEX code needs to be typed.
- `/admin-panel` — public DOS CONTROL PANEL message (its controls are restricted to Administrators, `OWNER_ID`, or the configured admin role). Configure the extra admin role and the room where the dashboard may be opened from **صلاحيات الإدارة وروم اللوحة**.
- `/add-coins member amount` and `.اضافة_عملات @عضو 500` — add DOS Coin (admin only).
- `/add-xp member amount type` and `.اضافة_xp @عضو 500 كتابة` — add text or voice XP (admin only; XP-to-coin conversion is applied).
- `/reset-member member` and `.reset @عضو` — show a confirmation before resetting the selected member's economy and activity data.
- `.متصدرين كتابي`, `.متصدرين صوتي`, `.متصدرين عملات`, `.إحصائيات`, `.مساعدة`.
- Existing admin commands `.تعيين_قناة` and `.رتبة_مستوى` remain available.

## Main panel and content

Use `/admin-panel` → **رتب المستويات** to link separate writing and voice reward roles to level thresholds. Use `/admin-panel` → **اللوحات والرسائل** to edit the title and body for the welcome panel, rules, information, notification roles, system, events/Arena, Social Media, Apply, and New/News. The welcome image includes the current server icon and name, bilingual welcome copy, and a signature using the server owner's display name. Its seven buttons match the supplied reference: **Server Rules**, **Read Information**, **Roles**, **Social Media**, **Apply**, **New**, and **Arena**. Button responses are ephemeral/private to the member. Use **نشر / تحديث اللوحة الرئيسية** to publish the panel in a chosen text channel.

## Admin access and private voice controls

The `/admin-panel` command publishes the dashboard publicly in the channel where it is used, but every interactive admin action is checked server-side. In **صلاحيات الإدارة وروم اللوحة**, administrators can select an extra admin role and a dedicated text channel. Members with that role may operate the panel; Administrator and `OWNER_ID` access remain available. If a dashboard channel is selected, `/admin-panel` must be invoked there. Clearing the channel removes the location restriction.

A private voice-room product publishes a control message in the voice channel chat. The room owner or administrators can rename the room, set its user limit, add/remove a member, and lock or reopen access for previously invited members. The bot needs Manage Channels and permission to send messages in the voice channel. Existing active voice rooms without a saved control-message ID are backfilled by the room scheduler.

## Economy and levels

Defaults remain 7 XP per ordinary text message, 9 XP per eligible voice minute, and 250 XP per DOS Coin. XP and coin rates can be changed from `/admin-panel`. Text and voice XP have separate levels. The default hardening curve requires 100, 150, 250, 400, 500 and 600 XP for levels 1–6; level 7 starts at 750 XP, then the requirement grows by 150 XP plus another 5 XP of growth per level. Administrators can customize the first six requirements and the later growth from `/admin-panel` → العملات والمستويات. They can optionally select a level-up notification channel there; if none is selected, text level-ups are announced in the channel that awarded XP and voice level-ups use the server system channel. Disabling the economy and disabling levels are separate controls.

Daily, weekly, and monthly TOP history starts accumulating from this release because older versions did not record timestamped XP events. All-time totals are preserved.

## DOS SHOP

Admins can add/edit/deactivate products and configure the shop channel and private-room category in `/admin-panel`. Product types: color, private text room, private voice room, existing Discord role, digital item, or manual fulfillment. A disabled-by-default `Colors` product is created for each server; edit its price and activate it before members can buy it. The public shop has a wide DOS SHOP banner with the current Discord server logo displayed in the silver/cyan medallion and a small subtitle editable from **إدارة المتجر → إعداد القنوات → تعديل كتابة صورة المتجر**, plus a single Buy... dropdown; product names, descriptions and prices are driven by the product records. After purchasing Colors, members see a full-spectrum color wheel and choose one of 60 clearly named Arabic colors from a paged dropdown—no HEX entry is required. The bot creates/updates the Discord color role and assigns it to the buyer for 30 days; an expiry worker removes the role automatically and notifies the member. Create a role named `Member` (or `Members`, `عضو`, `الأعضاء`) before enabling color delivery; the custom color role is automatically positioned immediately above it. Keep the bot's highest role above the Member role so Discord permits this position change.

Private room products use DOS Coin, last 30 days, send a reminder three days before expiry, and can be renewed for another 30 days. Renewal adds time to the current expiry rather than discarding remaining days. Expired channels are deleted automatically. The room owner can manage their room channel. Each private voice room also receives a control panel in its built-in voice-channel chat: rename the room, set the user limit, add/remove members, and lock/unlock general access. The room owner and administrators can use these controls.

Cash products are separate from DOS Coin. A cash order can show an external HTTPS payment link, but payment is **not automatically verified** by the bot. An Administrator must verify receipt in the external payment provider before approving delivery. Cash refunds, if needed, are handled manually outside Discord. Automatic payment capture requires a separately integrated payment provider/webhook and is not included in this version. To keep room renewals reliable, private-room products are restricted to DOS Coin at present.

The DOS SHOP uses a generated silver-and-cyan server-crest banner; the medallion is filled dynamically with the actual DOS logo, while `DOS SHOP` and the editable small subtitle appear to its right. A single Buy... dropdown contains up to 25 products per page. Product names and prices are read from configured product records; page controls appear only when more than 25 products are active. The Colors item is created automatically but stays disabled until an administrator sets its price and enables it.

## Data and tests

SQLite file: `DATA_DIR/community.sqlite`. The migration retains existing member records and coin balances, adds the new settings/shop/room/content tables, and preserves old orders. Daily/weekly/monthly event history only starts with the new release.

A member reset clears that member's coins, coin remainder, text/voice/total XP, messages, voice seconds and recent TOP event history after an explicit confirmation. It retains the member row, invite attribution, products, orders and all other members' data.

Run locally or in CI: `npm install`, `npm run check`, `npm test`, `npm start`. GitHub Actions checks syntax and runs tests on pushes and pull requests.

## الصور المباشرة (PNG)

- `/wallet` و`.محفظتي` يرسلان بطاقة المحفظة كملف PNG مباشر، مع فصل تقدّم الكتابة عن الصوت.
- `/top` و`TOP` يرسلان صورة المتصدرين كملف PNG مباشر.
- `/shop` و`.المتجر` يرسلان صورة DOS SHOP العريضة مع قائمة Buy... تفاعلية (حتى 25 منتجاً في الصفحة)، وتفتح عملية شراء Colors عجلة ألوان كاملة مع قائمة درجات مسماة بالعربية؛ لا يحتاج العضو إلى إدخال HEX. صلاحية رتبة اللون 30 يوماً وتزال تلقائياً عند الانتهاء.
- لوحة الترحيب تُرسل بصورة PNG فحمية بإطار سماوي وشعار السيرفر، ويظهر النص العربي/الإنجليزي بوضوح داخل Embed Discord وتتبعه أزرار Discord السبعة. صفحات القوانين والمعلومات والنظام والفعاليات تُرسل كصور PNG أيضاً.
- لكل قسم في لوحة الإدارة صورة رأس مخصصة بنفس أسلوب DOS CONTROL PANEL؛ تتغير بحسب القسم (المتجر، الغرف، الرسائل، الأنظمة، XP، الأعضاء، الرتب، والطلبات)، وتُرفق بصورة ظاهرة داخل Embed مع الأوامر الفعلية لكل قسم. تعرض صورة المتجر شعار السيرفر الفعلي داخل إطار فضي/سماوي وعنوان CREDITS SHOP بخط ثابت واضح؛ يظهر اسم السيرفر وتعليمات الشراء داخل Embed Discord.
- لا يجري تعديل مخطط بيانات الأعضاء أو حذف قاعدة البيانات بسبب إضافة الرسومات.

## القوالب والصور المعتمدة

تجمع القوالب التشغيلية بين عناصر DOS السابقة والتصميم الجديد المستلهم من مراجعك. الصور تعرض خلفيات نظيفة بألوان فضية وسماوية، بينما تظهر النصوص العربية وأسماء الأوامر في Discord Embeds لتفادي تشوه الحروف في بيئة الاستضافة.

- `wallet-base.png`: بطاقة المحفظة.
- `leaderboard-base.png`: لوحة TOP والمتصدرين.
- `shop-base.png`: قالب المتجر القديم محفوظ للتوافق مع الأصول السابقة.
- `shop-crest-bg.png`: صورة المتجر كاملة بعرضها، مع كلمة DOS كبيرة داخل الدائرة؛ لا يوجد صندوق عنوان أو كتابة إضافية في الصورة.
- `main-panel-base.png`: قالب قديم محفوظ؛ صورة الترحيب الحالية تعرض كلمة DOS كبيرة بدلاً من شعار السيرفر، ويمكن للإدارة تحديد الأزرار الظاهرة من لوحة التحكم.
- `content-panel-base.png`: بطاقة رسالة القوانين/المعلومات؛ ويُرفق النص الكامل في رسالة Discord حتى لا يُقص المحتوى الطويل.
- `level-system-base.png`: إنفوجرافيك مراحل المستويات.
- `level-up-base.png`: إعلان الوصول إلى مستوى جديد.
- `admin-dashboard-base.png`: مرجع قديم محفوظ؛ لوحة الإدارة الحالية تستخدم رأساً جديداً بلا أزرار وهمية، وتعرض الأقسام والأوامر الفعلية في Embed والقائمة.
- `admin-shop-base.png`: صورة إدارة المتجر السابقة محفوظة؛ تُعرض المنتجات الفعلية وأسعارها وحالاتها في قائمة التحكم.

الصور المصدرية الخمس والقصاصات موجودة في `assets/design-references/`. خريطة ربط الملفات ووظائفها في `assets/templates/images-map.json`. لا تحذف ملفات القوالب التسعة ولا تغيّر أسماءها. لا تحتوي الحزمة على قاعدة بيانات الإنتاج أو ملف `.env` أو رمز Discord.


### التحكم بأزرار رسالة الترحيب

من `/admin-panel` افتح **اللوحات والرسائل**. القائمة الثالثة تعرض أزرار رسالة الترحيب المتاحة؛ حدد الأزرار التي تريد إظهارها أو أزل تحديد الأزرار التي تريد إخفاءها. يتم حفظ الاختيار في `guild_config` وتحديث رسالة الترحيب المنشورة تلقائياً إذا كانت محددة. ترك جميع الخيارات دون تحديد يخفي الأزرار كلها.

صورة المتجر تستخدم الخلفية العريضة فقط مع كلمة DOS كبيرة داخل الدائرة، من دون صندوق إضافي أو كتابة داخل الصورة. تظهر خيارات المنتجات في قائمة الشراء أسفل الصورة.

## رسالة ترحيب الأعضاء الجدد

من لوحة الإدارة `/admin-panel` افتح قسم **ترحيب الأعضاء الجدد** لتحديد قناة الشات العام، تعديل النص والإيموجي، تفعيل/إيقاف الرسالة، وإرسال رسالة تجربة. يستخدم البوت تنسيق Discord الصغير `-#` ويرسل الرسالة كنص مباشر بدون Embed.

قالب النص الافتراضي: `🌟 First message from {user}`. المتغيرات المتاحة: `{user}` لمنشن العضو الجديد، `{username}` لاسمه، و`{server}` لاسم السيرفر. زر الإيموجي بجانب الرسالة يضيف تفاعل 👋 إلى رسالة الترحيب عند الضغط عليه.

تأكد من تفعيل **Server Members Intent** في Discord Developer Portal ومنح البوت صلاحيات عرض القناة وإرسال الرسائل وإضافة التفاعلات.
