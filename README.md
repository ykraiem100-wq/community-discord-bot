# Community Discord Bot

Arabic Discord bot built with Node.js 20 and discord.js v14.

## Economy
- Each non-command text message: 7 XP.
- Each complete minute in a voice channel: 9 XP.
- Text and voice XP/levels are tracked separately.
- Every 250 lifetime XP earned grants 1 coin. Coins are stored separately from XP and spending never reduces XP.
- Voice XP is awarded only for complete elapsed minutes. Bot restarts preserve session timestamps.

## Commands
- `.محفظتي` — wallet card.
- `.محفظتي @member` — another member's public wallet.
- `.متصدرين كتابي`, `.متصدرين صوتي`, `.متصدرين عملات`.
- `.المتجر` — show shop items.
- `.شراء رقم_المنتج` — buy an item (staff approval required).
- `.إحصائيات` — server economy statistics.
- Admin: `.تعيين_قناة متجر #channel`, `.تعيين_قناة ترحيب #channel`.
- Admin: `.رتبة_مستوى كتابة 10 @role` or `.رتبة_مستوى صوت 10 @role`.
- Admin: `.طلبات`, `.قبول ID`, `.رفض ID`.

## Run
Use Node.js 20.x and the repository root (the folder containing `package.json`). Nowhost detects Node from the package manifest, installs dependencies from `package.json`, and starts the process with `npm start` (`node src/index.js`). Do not set a different start command or a Python runtime.\n\n### Nowhost environment variables\n- `DISCORD_TOKEN` — required bot token; store as a secret.\n- `DISCORD_CLIENT_ID` — recommended by Nowhost for its bot invite link. It is not required by this prefix-command code to log in.\n- `BOT_PREFIX` — optional, defaults to `.`.\n- `DATA_DIR` — optional, defaults to `./data`; point it to a persistent data directory if your Nowhost plan exposes one.\n\nNo `GUILD_ID`, `OWNER_ID`, or slash-command registration is needed by this version. The bot currently uses prefix commands, not slash commands. Run `npm run check` to syntax-check the JavaScript files.

Keep the SQLite database directory persistent on your host and do not commit tokens or database files.

Shop entries that represent Discord platform perks are submitted as staff-reviewed purchase requests; the bot cannot independently add platform entitlements such as animated assets or premium slots.

> Security note: Node.js 20 reached end-of-life on April 30, 2026. Use it only where required by the host; upgrade to a supported LTS runtime when possible.
