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

## Nowhost deployment

This repository is prepared for Nowhost's Git-based Node.js bot runtime.

- Keep this repository's `package.json` in the repository root.
- Connect the GitHub repository and deploy the `main` branch.
- Nowhost detects Node.js from `package.json`; this project targets Node.js 20.x.
- The start command is `npm start`, which runs `node src/index.js`.
- Nowhost installs the dependencies declared in `package.json`; no Nowhost-specific YAML, Procfile, or Dockerfile is required for this Node.js bot.
- Add `DISCORD_TOKEN` as a secret and `DISCORD_CLIENT_ID` as an environment variable in the Nowhost panel.
- Optional variables: `BOT_PREFIX` (defaults to `.`) and `DATA_DIR` (defaults to `./data`).
- This version uses prefix commands, not slash commands; it does not require `GUILD_ID` or `OWNER_ID`.
- The code currently stores economy data in SQLite at `DATA_DIR/community.sqlite`. Use persistent storage if your selected Nowhost plan exposes it.

**Plan note:** Nowhost currently lists deployment of a user's own GitHub repository under its paid bot plans. The Free plan is for the visual builder and templates.

After deploying, check the runtime logs for `[Discord] Logged in as ...`. If that line does not appear, use the build/runtime error shown by Nowhost to diagnose the failure.

## Run
Use Node.js 20.x and the repository root (the folder containing `package.json`). Nowhost detects Node from the package manifest, installs dependencies from `package.json`, and starts the process with `npm start` (`node src/index.js`). Do not set a different start command or a Python runtime.\n\n### Nowhost environment variables\n- `DISCORD_TOKEN` — required bot token; store as a secret.\n- `DISCORD_CLIENT_ID` — recommended by Nowhost for its bot invite link. It is not required by this prefix-command code to log in.\n- `BOT_PREFIX` — optional, defaults to `.`.\n- `DATA_DIR` — optional, defaults to `./data`; point it to a persistent data directory if your Nowhost plan exposes one.\n\nNo `GUILD_ID`, `OWNER_ID`, or slash-command registration is needed by this version. The bot currently uses prefix commands, not slash commands. Run `npm run check` to syntax-check the JavaScript files.

Keep the SQLite database directory persistent on your host and do not commit tokens or database files.

Shop entries that represent Discord platform perks are submitted as staff-reviewed purchase requests; the bot cannot independently add platform entitlements such as animated assets or premium slots.

> Security note: Node.js 20 reached end-of-life on April 30, 2026. Use it only where required by the host; upgrade to a supported LTS runtime when possible.
