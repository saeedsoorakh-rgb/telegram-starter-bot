import fs from "node:fs/promises";
import path from "node:path";

const OWNER_ID = Number(process.env.OWNER_ID || 8752447301);
const DB_FILE = path.resolve("bot-data.json");

let db = {
  vip: {},
  vipNames: {},
  muted: {},
  profiles: {},
  setup: {},
  tags: {},
  pendingTags: {}
};
async function loadDB() {
  try {
    db = JSON.parse(await fs.readFile(DB_FILE, "utf8"));

    db.vip ||= {};
    db.vipNames ||= {};
    db.muted ||= {};
    db.profiles ||= {};
    db.setup ||= {};
    db.tags ||= {};
    db.pendingTags ||= {};

  } catch {
    await saveDB();
  }
}

async function saveDB() {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function isOwner(ctx) {
  return ctx.from?.id === OWNER_ID;
}

function isVIP(chatId, userId) {
  const expiry = db.vip[`${chatId}_${userId}`];
  return expiry && expiry > Date.now();
}

function target(ctx) {
  return ctx.message?.reply_to_message?.from;
}

function targetKey(ctx) {
  const user = target(ctx);
  if (!user) return null;
  return `${ctx.chat.id}_${user.id}`;
}

const normalPermissions = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: false,
  can_add_web_page_previews: true
};

const mutePermissions = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false
};

async function applyPolicy(ctx, userId) {
  const key = `${ctx.chat.id}_${userId}`;

  if (db.muted[key]) {
    const until = db.muted[key];

    if (until === "permanent" || until > Date.now()) {
      await ctx.api.restrictChatMember(
        ctx.chat.id,
        userId,
        mutePermissions,
        until === "permanent"
          ? {}
          : { until_date: Math.floor(until / 1000) }
      );
      return;
    }

    delete db.muted[key];
    await saveDB();
  }

  if (isVIP(ctx.chat.id, userId)) {
    await ctx.api.unrestrictChatMember(ctx.chat.id, userId);
  } else {
    await ctx.api.restrictChatMember(
      ctx.chat.id,
      userId,
      normalPermissions
    );
  }
}

export function registerCommands(bot) {

  loadDB();

  // START
  bot.command("start", async (ctx) => {
    await ctx.reply(
      `سلام ${ctx.from.first_name} 🌹\nربات مدیریت گروه فعاله.`
    );
  });

  // HELP
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "دستورات ربات:\n\n" +
      "VIP:\n" +
      "/setvip 3\n" +
      "/removevip\n" +
      "/viplist\n\n" +
      "سکوت:\n" +
      "/mute\n" +
      "/mute24\n" +
      "/unmute\n\n" +
      "پرونده:\n" +
      "/setasl\n" +
      "/editasl\n" +
      "/deleteasl\n" +
      "/asl\n\n" +
      "تنظیمات:\n" +
      "/setup"
    );
  });

  // SET VIP
bot.hears(/^ویژه\s+([0-9۰-۹]+)$/, async (ctx) => {
  if (!isOwner(ctx)) return;

  const user = target(ctx);
  const days = Number(ctx.match[1].replace(/[۰-۹]/g, d =>
    "۰۱۲۳۴۵۶۷۸۹".indexOf(d)
  ));

  if (!user || days < 1) {
    return ctx.reply("روی پیام شخص ریپلای کن و بنویس: ویژه ۷");
  }

  const key = `${ctx.chat.id}_${user.id}`;

  db.vip[key] = Date.now() + days * 86400000;
  await saveDB();
  await applyPolicy(ctx, user.id);

  await ctx.reply(`⭐ ${user.first_name} به مدت ${days} روز VIP شد!`);
});

// EXTEND VIP
bot.hears(/^تمدید\s+([0-9۰-۹]+)$/, async (ctx) => {
  if (!isOwner(ctx)) return;

  const user = target(ctx);
  const days = Number(ctx.match[1].replace(/[۰-۹]/g, d =>
    "۰۱۲۳۴۵۶۷۸۹".indexOf(d)
  ));

  if (!user || days < 1) {
    return ctx.reply("روی پیام شخص ریپلای کن و بنویس: تمدید ۳");
  }

  const key = `${ctx.chat.id}_${user.id}`;
  const current = Math.max(db.vip[key] || 0, Date.now());

  if (!db.vip[key]) {
    return ctx.reply("این شخص VIP نیست.");
  }

  db.vip[key] = current + days * 86400000;
  await saveDB();

  await ctx.reply(`✅ ${days} روز به اعتبار VIP اضافه شد.`);
});

// REMOVE VIP
bot.hears("حذف ویژه", async (ctx) => {
  if (!isOwner(ctx)) return;

  const key = targetKey(ctx);
  const user = target(ctx);

  if (!key) return ctx.reply("روی پیام شخص ریپلای کن.");

  delete db.vip[key];
  delete db.vipNames[key];

  await saveDB();
  await applyPolicy(ctx, user.id);

  await ctx.reply("VIP این شخص حذف شد.");
});

// VIP NAME
bot.hears(/^لقب\s+(.+)$/, async (ctx) => {
  if (!isOwner(ctx)) return;

  const user = target(ctx);
  const key = targetKey(ctx);
  const name = ctx.match[1].trim();

  if (!user || !key) {
    return ctx.reply("روی پیام عضو VIP ریپلای کن.");
  }

  if (!isVIP(ctx.chat.id, user.id)) {
    return ctx.reply("این شخص VIP نیست.");
  }

  db.vipNames[key] = name;
  await saveDB();

  await ctx.reply(`🏅 لقب ${user.first_name} شد: ${name}`);
});

// REMOVE VIP NAME
bot.hears("حذف لقب", async (ctx) => {
  if (!isOwner(ctx)) return;

  const key = targetKey(ctx);
  if (!key) return ctx.reply("روی پیام شخص ریپلای کن.");

  delete db.vipNames[key];
  await saveDB();

  await ctx.reply("لقب VIP حذف شد.");
});

// VIP LIST
bot.hears("فهرست ویژه", async (ctx) => {
  if (!isOwner(ctx)) return;

  const prefix = `${ctx.chat.id}_`;

  const list = Object.entries(db.vip)
    .filter(([key, expiry]) =>
      key.startsWith(prefix) && expiry > Date.now()
    )
    .map(([key, expiry]) => {
      const id = key.split("_")[1];
      const name = db.vipNames[key] || "بدون لقب";
      const days = Math.ceil((expiry - Date.now()) / 86400000);

      return `⭐ ${name}\nشناسه: ${id}\nاعتبار: ${days} روز`;
    });

  await ctx.reply(
    list.length ? list.join("\n\n") : "فهرست ویژه خالی است."
  );
});

  // MUTE
  bot.hears("سکوت", async (ctx) => {
    if (!isOwner(ctx)) return;

    const user = target(ctx);
    if (!user) return ctx.reply("روی پیام شخص ریپلای کن.");

    db.muted[`${ctx.chat.id}_${user.id}`] = "permanent";
    await saveDB();

    await applyPolicy(ctx, user.id);
    await ctx.reply("🔇 سکوت دائمی فعال شد.");
  });

  // MUTE 24 HOURS
  bot.hears("سکوت ۲۴", async (ctx) => {
    if (!isOwner(ctx)) return;

    const user = target(ctx);
    if (!user) return ctx.reply("روی پیام شخص ریپلای کن.");

    db.muted[`${ctx.chat.id}_${user.id}`] =
      Date.now() + 86400000;

    await saveDB();
    await applyPolicy(ctx, user.id);

    await ctx.reply("سکوت ۲۴ ساعته فعال شد.");
  });
// TEST UNMUTE
bot.hears("تست آزاد", async (ctx) => {
  await ctx.reply("✅ دستور دریافت شد");
});

// TEST OWNER
bot.hears("تست مدیر", async (ctx) => {
  const result =
    "شناسه شما: " + ctx.from.id +
    "\nشناسه مدیر: " + OWNER_ID +
    "\nمدیر هستید؟ " + isOwner(ctx);

  await ctx.reply(result);
});

// UNMUTE
bot.hears(/^(رفع سکوت|آزاد)$/u, async (ctx) => {
if (!isOwner(ctx)) return;

const user = target(ctx);
if (!user) {
return ctx.reply("روی پیام شخص ریپلای کن.");
}

const key = "${ctx.chat.id}_${user.id}";

delete db.muted[key];
await saveDB();
await applyPolicy(ctx, user.id);

await ctx.reply("🔊 سکوت برداشته شد.");
});
// UNMUTE
bot.hears(/^(رفع سکوت|آزاد)$/u, async (ctx) => {
  if (!isOwner(ctx)) return;

  const user = target(ctx);
  if (!user) {
    return ctx.reply("روی پیام شخص ریپلای کن.");
  }

  const key = `${ctx.chat.id}_${user.id}`;

  delete db.muted[key];
  await saveDB();
  await applyPolicy(ctx, user.id);

  await ctx.reply("🔊 سکوت برداشته شد.");
});
 // SET PROFILE
  bot.hears("ثبت اصل", async (ctx) => {
    if (ctx.chat.type === "private") return;

    const user = target(ctx);
    const key = targetKey(ctx);

    if (!user || !ctx.from || (!isOwner(ctx) && !isVIP(ctx.chat.id, ctx.from.id))) {
      return ctx.reply("فقط اعضای VIP می‌توانند پرونده ثبت کنند. باید روی پیام مشخصات شخص ریپلای کنی.");
    }

    const content = ctx.message.reply_to_message.text ||
      ctx.message.reply_to_message.caption;

    if (!content) return ctx.reply("پیام مشخصات باید متن داشته باشد.");

    db.profiles[key] = {
      text: content,
      editor: ctx.from.id
    };

    await saveDB();
    await ctx.reply("✅ پرونده ثبت شد.");
  });

  // EDIT PROFILE
  bot.hears("ویرایش اصل", async (ctx) => {
    if (ctx.chat.type === "private") return;

    const user = target(ctx);
    const key = targetKey(ctx);

    if (!user || !ctx.from || (!isOwner(ctx) && !isVIP(ctx.chat.id, ctx.from.id))) {
      return ctx.reply("فقط VIP می‌تواند پرونده را ویرایش کند.");
    }

    const content = ctx.message.reply_to_message.text ||
      ctx.message.reply_to_message.caption;

    if (!content) return ctx.reply("پیام جدید مشخصات را ریپلای کن.");

    if (!db.profiles[key]) {
      return ctx.reply("برای این شخص پرونده‌ای ثبت نشده.");
    }

    db.profiles[key] = {
      text: content,
      editor: ctx.from.id
    };

    await saveDB();
    await ctx.reply("✅ پرونده ویرایش شد.");
  });

  // DELETE PROFILE
  bot.hears("حذف اصل", async (ctx) => {
    if (ctx.chat.type === "private") return;

    const key = targetKey(ctx);

    if (!key || !ctx.from || (!isOwner(ctx) && !isVIP(ctx.chat.id, ctx.from.id))) {
      return ctx.reply("فقط VIP می‌تواند پرونده را حذف کند.");
    }

    if (!db.profiles[key]) {
      return ctx.reply("پرونده‌ای وجود ندارد.");
    }

    delete db.profiles[key];
    await saveDB();

    await ctx.reply("پرونده حذف شد.");
  });

  
// SHOW PROFILE
bot.hears("اصل", async (ctx) => {
  const key = targetKey(ctx);

  if (!key) return ctx.reply("روی پیام شخص ریپلای کن.");

  const profile = db.profiles[key];

  if (!profile) return ctx.reply("پرونده‌ای ثبت نشده.");

  const tags = db.tags?.[key] || [];

  let result = "📋 پرونده عضو:\n\n" + profile.text;

  if (tags.length > 0) {
    result += "\n\n🏷 برچسب‌های تأییدشده:\n";
    result += tags.map(tag => "⭐ " + tag).join("\n");
  }

  await ctx.reply(result);
});
// ADD TAG
bot.hears(/^برچسب\s+(.+)$/s, async (ctx) => {
  if (ctx.chat.type === "private") return;

  const user = target(ctx);
  const key = targetKey(ctx);
  const tag = ctx.match[1].trim();

  if (!user || !key) {
    return ctx.reply("برای ثبت برچسب باید روی پیام شخص ریپلای کنی.");
  }

  const msg = await ctx.reply(
    `🏷 برچسب پیشنهادی برای ${user.first_name}:\n⭐ ${tag}\n\nبرای تأیید، خود شخص روی همین پیام ریپلای کند و بنویسد: اعتماد`
  );

  db.pendingTags[`${ctx.chat.id}_${msg.message_id}`] = {
    targetId: user.id,
    tag
  };

  await saveDB();
});

// APPROVE TAG
bot.hears("اعتماد", async (ctx) => {
  const reply = ctx.message.reply_to_message;
  if (!reply || !ctx.from) return;

  const key = `${ctx.chat.id}_${reply.message_id}`;
  const pending = db.pendingTags[key];

  if (!pending) return;

  if (pending.targetId !== ctx.from.id) {
    return ctx.reply("فقط شخصی که برچسب برای او ثبت شده می‌تواند تأیید کند.");
  }

  const profileKey = `${ctx.chat.id}_${ctx.from.id}`;

  if (!db.tags[profileKey]) db.tags[profileKey] = [];

  db.tags[profileKey].push(pending.tag);
  delete db.pendingTags[key];

  await saveDB();
  await ctx.reply("✅ برچسب تأیید و در اصل ثبت شد.");
});



  // SETUP
  bot.command("setup", async (ctx) => {
    if (!isOwner(ctx)) return;

    if (ctx.chat.type === "private") {
      return ctx.reply("این دستور را داخل گروه اجرا کن.");
    }

    db.setup[ctx.chat.id] = true;
    await saveDB();

    const user = target(ctx);

    if (user) {
      await applyPolicy(ctx, user.id);
    }

    await ctx.reply(
      "✅ تنظیمات فعال شد.\nاعضای جدید به‌صورت خودکار محدود می‌شوند."
    );
  });

  // WELCOME + NEW MEMBER RESTRICTION
  bot.on("message:new_chat_members", async (ctx) => {
    for (const user of ctx.message.new_chat_members) {
      if (user.is_bot) continue;

      if (db.setup[ctx.chat.id]) {
        await applyPolicy(ctx, user.id).catch(console.error);
      }

      await ctx.reply(
        `🌹 به گروه خوش آمدی ${user.first_name}!`
      );
    }
  });

  // EXPIRED VIP AND MUTE CHECK
  setInterval(async () => {
    const now = Date.now();

    for (const key of Object.keys(db.vip)) {
      if (db.vip[key] <= now) {
        delete db.vip[key];
        await saveDB();
      }
    }

    for (const key of Object.keys(db.muted)) {
      if (db.muted[key] !== "permanent" &&
          db.muted[key] <= now) {
        delete db.muted[key];
        await saveDB();
      }
    }
  }, 60000);

  bot.command("ping", (ctx) => ctx.reply("ربات فعاله ✅"));
}
