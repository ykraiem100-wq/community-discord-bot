# DOS Community Discord Bot

Node.js 20 + Discord.js v14 bot, structured for Nowhost Git deployment.

## Nowhost deployment

Nowhost detects Node.js projects from the root package.json, installs dependencies and starts the start script. This repository intentionally has no Render manifest, Procfile, Dockerfile or made-up Nowhost YAML file.

| Setting | Value |
|---|---|
| Repository root | / (the folder containing package.json) |
| Branch | main |
| Runtime | Node.js 20.x |
| Install | Automatic from package.json |
| Start command | npm start |
| Entry point | src/index.js |

Add these variables in Nowhost → your bot → Environment:

- DISCORD_TOKEN — required bot token; store it as a secret.
- DISCORD_CLIENT_ID — required by Nowhost for application identity and invite link.
- OWNER_ID — optional Discord user ID that can run admin commands.
- BOT_PREFIX — optional, defaults to .
- DATA_DIR — optional, defaults to ./data; use persistent storage if available.
- TZ — optional timezone, e.g. Asia/Amman.

Do not add quotation marks around values. Never commit a real token or .env file.

## Discord Developer Portal

Enable Message Content Intent and Server Members Intent under Application → Bot → Privileged Gateway Intents. The bot also needs permissions to view/send messages, embed links, view voice channels, and manage roles if you use level-role rewards. Place the bot's highest role above the reward roles.

## Commands

- .مساعدة
- .محفظتي and .محفظتي @member
- .متصدرين كتابي, .متصدرين صوتي, .متصدرين عملات
- .المتجر, .شراء 1
- .إحصائيات
- Admin: .تعيين_قناة متجر #channel, .تعيين_قناة ترحيب #channel
- Admin: .رتبة_مستوى كتابة 10 @role, .رتبة_مستوى صوت 10 @role
- Admin: .طلبات, .قبول ID, .رفض ID

## Economy

- Each non-command text message: 7 XP.
- Each eligible voice minute: 9 XP.
- Text and voice XP levels are separate.
- Every 250 earned XP grants 1 coin; spending coins does not reduce XP.
- SQLite stores XP, balances, messages, voice totals, settings, level roles and shop orders.

Database file: DATA_DIR/community.sqlite. Keep this directory persistent if your hosting plan provides persistent storage. The migration adds missing fields to the existing database without deleting members or changing their coin balances.

## Checks

Run locally or in CI: npm install, npm run check, npm test, npm start.

The GitHub Actions workflow runs syntax checks and tests on pushes to main.

After a successful Nowhost deployment, Runtime Logs should include: [DISCORD] Logged in as ...

Node.js 20 is used because the Nowhost Discord.js deployment guide specifies Node 20. Node.js 20 is end-of-life upstream; upgrade only when Nowhost supports a newer runtime for this bot.
