require("dotenv").config();

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error("[Startup] Missing DISCORD_TOKEN. Add it in Nowhost > Environment and redeploy.");
  process.exit(1);
}

const appId = process.env.DISCORD_CLIENT_ID?.trim();
if (!appId) {
  console.warn("[Config] DISCORD_CLIENT_ID is not set. Prefix commands can still run; Nowhost uses this value for its invite link.");
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
console.log("[Startup] DOS Community starting | Node", process.version);
if (nodeMajor !== 20) {
  console.warn("[Runtime] This project is configured for Node.js 20.x. Current runtime:", process.version);
}

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const db = require("./db");
const { makeWallet } = require("./wallet");
const prefix = process.env.BOT_PREFIX || ".";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const shop = [
  ["Prison", 25, "25 credits and up"],
  ["Animate", 30, "30 credits and up"],
  ["Typo Virus", 30, "30 credits and up"],
  ["Vault Guard", 50, "50 credits / 3 days"],
  ["Sticker Slot", 50, "50 credits / 14 days"],
  ["Honorary Booster", 150, "150 credits / 7 days"],
  ["Emoji Slot", 150, "150 credits"],
  ["Custom Role", 200, "200 credits / 14 days"]
];

const admin = (member) => member.permissions.has(PermissionsBitField.Flags.Administrator);

async function awardVoice(guildId, userId, now = Date.now()) {
  const session = db.voice(guildId, userId);
  if (!session) return;

  const minutes = Math.floor((now - session.started_at) / 60000);
  if (minutes < 1) return;

  db.addXp(guildId, userId, "voice", minutes * 9, { seconds: minutes * 60 });
  db.updateVoice(guildId, userId, session.started_at + minutes * 60000);
}

async function applyLevelRoles(member, kind, level) {
  const rows = db.roles(member.guild.id, kind).filter((row) => level >= row.level);
  if (!rows.length) return;

  const role = member.guild.roles.cache.get(rows[rows.length - 1].role_id);
  const botHighestRole = member.guild.members.me?.roles.highest;

  if (role && botHighestRole && role.position < botHighestRole.position && !member.roles.cache.has(role.id)) {
    await member.roles.add(role).catch((error) => console.error("[Roles] Could not assign level role:", error.message));
  }
}

client.once("ready", () => {
  console.log("[Discord] Logged in as " + client.user.tag);

  for (const session of db.allVoice()) {
    awardVoice(session.guild_id, session.user_id).catch((error) => console.error("[Voice] Resume failed:", error));
  }

  setInterval(() => {
    for (const session of db.allVoice()) {
      awardVoice(session.guild_id, session.user_id).catch((error) => console.error("[Voice] XP update failed:", error));
    }
  }, 15000);
});

client.on("error", (error) => console.error("[Discord] Client error:", error));
client.on("shardError", (error) => console.error("[Discord] Gateway shard error:", error));

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot || message.content.trim().startsWith(prefix)) return;

  const result = db.addXp(message.guild.id, message.author.id, "text", 7, { message: true });
  if (result.newTextLevel > result.oldTextLevel) {
    await applyLevelRoles(message.member, "text", result.newTextLevel);
  }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  const guildId = newState.guild.id;
  const userId = newState.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  const eligible = (state) =>
    !!state.channelId &&
    !state.member.user.bot &&
    !state.selfDeaf &&
    !state.serverDeaf &&
    !state.selfMute &&
    !state.serverMute;

  if (oldChannelId && oldChannelId !== newChannelId) {
    await awardVoice(guildId, userId);
    db.stopVoice(guildId, userId);
  }

  if (newChannelId && eligible(newState) && (!oldChannelId || oldChannelId !== newChannelId || !db.voice(guildId, userId))) {
    db.startVoice(guildId, userId);
  }

  if (newChannelId && !eligible(newState) && db.voice(guildId, userId)) {
    await awardVoice(guildId, userId);
    db.stopVoice(guildId, userId);
  }
});

client.on("guildMemberAdd", async (member) => {
  const settings = db.settings(member.guild.id);
  if (!settings.welcome_channel_id) return;

  const channel = member.guild.channels.cache.get(settings.welcome_channel_id);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(0xc5a66a)
    .setTitle("Welcome to " + member.guild.name)
    .setDescription("أهلاً " + member + "! نتمنى لك وقتاً ممتعاً في مجتمعنا.")
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("welcome_rules").setLabel("Server Rules").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("welcome_info").setLabel("Read Information").setStyle(ButtonStyle.Primary)
  );

  channel.send({ embeds: [embed], components: [row] }).catch((error) => console.error("[Welcome] Could not send welcome:", error.message));
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "welcome_rules") {
    return interaction.reply({ content: "يرجى مراجعة قناة القوانين في السيرفر.", ephemeral: true });
  }

  if (interaction.customId === "welcome_info") {
    return interaction.reply({ content: "أهلاً بك! استخدم .محفظتي لعرض محفظتك ومستوياتك.", ephemeral: true });
  }
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift();
  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    if (command === "محفظتي") {
      const user = message.mentions.users.first() || message.author;
      const memberData = db.ensure(guildId, user.id);
      const png = await makeWallet(memberData, user);
      return message.reply({ files: [new AttachmentBuilder(png, { name: "wallet.png" })] });
    }

    if (command === "متصدرين") {
      const kind = args[0] === "صوتي" ? "voice" : args[0] === "عملات" ? "coins" : "text";
      const rows = db.leaderboard(guildId, kind);
      const title = kind === "voice" ? "المتصدرون صوتياً" : kind === "coins" ? "أغنى الأعضاء" : "المتصدرون كتابياً";
      const lines = rows.map((row, index) => "**" + (index + 1) + ".** <@" + row.user_id + "> — " + row.score.toLocaleString());
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xc5a66a)
            .setTitle(title)
            .setDescription(lines.join("\n") || "لا توجد بيانات بعد.")
        ]
      });
    }

    if (command === "إحصائيات") {
      const stats = db.stats(guildId);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xc5a66a)
            .setTitle("إحصائيات المجتمع")
            .addFields(
              { name: "الأعضاء المسجلون", value: String(stats.members), inline: true },
              { name: "الرسائل", value: stats.messages.toLocaleString(), inline: true },
              { name: "ساعات الصوت", value: (stats.voice_seconds / 3600).toFixed(1), inline: true },
              { name: "العملات المتداولة", value: stats.coins.toLocaleString(), inline: true }
            )
        ]
      });
    }

    if (command === "المتجر") {
      const lines = shop.map((item, index) =>
        "**" + (index + 1) + ". " + item[0] + "** — " + item[2] + " (السعر الأساسي: " + item[1] + " عملة)"
      ).join("\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xc5a66a)
            .setTitle("CREDITS SHOP")
            .setDescription(lines + "\n\nللشراء اكتب: " + prefix + "شراء رقم_المنتج")
        ]
      });
    }

    if (command === "شراء") {
      const item = shop[Number(args[0]) - 1];
      if (!item) return message.reply("اختر رقم منتج صحيح من .المتجر");

      const settings = db.settings(guildId);
      if (settings.shop_channel_id && message.channel.id !== settings.shop_channel_id) {
        return message.reply("المتجر متاح في القناة المخصصة فقط.");
      }

      if (!db.spend(guildId, userId, item[1])) {
        return message.reply("رصيدك غير كافٍ. استخدم .محفظتي لمعرفة رصيدك.");
      }

      const orderId = db.createOrder(guildId, userId, String(args[0]), item[0], item[1]);
      return message.reply("تم حجز " + item[0] + " مقابل " + item[1] + " عملة. رقم الطلب: #" + orderId + ". ينتظر موافقة الإدارة.");
    }

    if (command === "طلبات") {
      if (!admin(message.member)) return;
      const rows = db.orders(guildId);
      return message.reply(
        rows.map((order) => "#" + order.id + " — " + order.item_name + " — <@" + order.user_id + "> — " + order.price + " عملة").join("\n") ||
        "لا توجد طلبات معلقة."
      );
    }

    if (command === "قبول" || command === "رفض") {
      if (!admin(message.member)) return;

      const id = Number(args[0]);
      const order = db.getOrder(guildId, id);
      if (!order || order.status !== "pending") {
        return message.reply("الطلب غير موجود أو تمت مراجعته.");
      }

      const status = command === "قبول" ? "approved" : "rejected";
      if (db.review(guildId, id, status, userId) && status === "rejected") {
        db.db.prepare("UPDATE members SET coins = coins + ? WHERE guild_id = ? AND user_id = ?")
          .run(order.price, guildId, order.user_id);
      }

      return message.reply(
        "تم " + (status === "approved" ? "قبول" : "رفض") + " الطلب #" + id +
        (status === "rejected" ? " وإعادة المبلغ." : ".")
      );
    }

    if (command === "تعيين_قناة") {
      if (!admin(message.member)) return;

      const channel = message.mentions.channels.first();
      if (!channel) return message.reply("اذكر القناة.");

      const key = args[0] === "ترحيب" ? "welcome_channel_id" : args[0] === "متجر" ? "shop_channel_id" : null;
      if (!key) return message.reply("استخدم متجر أو ترحيب.");

      db.setSetting(guildId, key, channel.id);
      return message.reply("تم تعيين قناة " + args[0] + ": " + channel);
    }

    if (command === "رتبة_مستوى") {
      if (!admin(message.member)) return;

      const kind = args[0] === "صوت" ? "voice" : args[0] === "كتابة" ? "text" : null;
      const level = Number(args[1]);
      const role = message.mentions.roles.first();

      if (!kind || !Number.isInteger(level) || level < 1 || !role) {
        return message.reply("مثال: .رتبة_مستوى كتابة 10 @Role");
      }

      db.setRole(guildId, kind, level, role.id);
      return message.reply("تم ربط رتبة " + role + " بمستوى " + level + ".");
    }
  } catch (error) {
    console.error("[Command] Error while executing " + command + ":", error);
    return message.reply("حدث خطأ أثناء تنفيذ الأمر.").catch(() => {});
  }
});

client.login(token).catch((error) => {
  console.error("[Startup] Discord login failed:", error);

  if (error?.code === 4014 || error?.name === "PrivilegedIntentsRequired") {
    console.error("[Startup] Enable Server Members Intent and Message Content Intent in Discord Developer Portal > Bot > Privileged Gateway Intents, then redeploy.");
  } else if (error?.name === "TokenInvalid" || error?.code === "TokenInvalid") {
    console.error("[Startup] DISCORD_TOKEN is invalid or revoked. Regenerate it in Discord Developer Portal and replace the Nowhost secret.");
  }

  process.exit(1);
});
