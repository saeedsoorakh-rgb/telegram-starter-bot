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
  pendingTags: {},
  messageCleanup: {},
  memberChannels: {},
  warnings: {}
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
    db.messageCleanup ||= {};
    db.memberChannels ||= {};
    db.warnings ||= {};

    // KHAN MEDIA
    db.media ||= {};
    db.pendingMedia ||= {};
    db.mediaSettings ||= {
      channelId: null,
      adChannel: null,
      adLink: null,
      adEnabled: false
    };

  } catch {
    db = {
      vip: {},
      vipNames: {},
      muted: {},
      profiles: {},
      setup: {},
      tags: {},
      pendingTags: {},
      messageCleanup: {},
      memberChannels: {},
      warnings: {},
      media: {},
      pendingMedia: {},
      mediaSettings: {
        channelId: null,
        adChannel: null,
        adLink: null,
        adEnabled: false
      }
    };

    await saveDB();
  }
}

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
can_send_documents: false,
can_send_photos: false,
can_send_videos: false,
can_send_video_notes: false,
can_send_voice_notes: true,
can_send_polls: false,
can_send_other_messages: false,
can_add_web_page_previews: false
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
          ? { use_independent_chat_permissions: true }
          : {
              until_date: Math.floor(until / 1000),
              use_independent_chat_permissions: true
            }
      );
      return;
    }

    delete db.muted[key];
    await saveDB();
  }

  if (isVIP(ctx.chat.id, userId)) {
    await ctx.api.restrictChatMember(
      ctx.chat.id,
      userId,
      {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true
      },
      {
        use_independent_chat_permissions: true
      }
    );
  } else {
    await ctx.api.restrictChatMember(
      ctx.chat.id,
      userId,
      normalPermissions,
      {
        use_independent_chat_permissions: true
      }
    );
  }
}
export function registerCommands(bot) {

    loadDB();

  // WELCOME NEW MEMBERS
  bot.on("message:new_chat_members", async (ctx, next) => {
    try {
      const members = ctx.message.new_chat_members;

      for (const member of members) {
        const name = String(member.first_name || "دوست جدید")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

        const welcome = await ctx.reply(
          `سلام <a href="tg://user?id=${member.id}">${name}</a> 🌹\n` +
          `به گروه خوش اومدی.\n\n` +
          `📜 لطفاً قبل از چت کردن قوانین گروه رو مطالعه کن.`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[
                {
                  text: "📜 مشاهده قوانین گروه",
                  url: "https://t.me/hddg5555/174"
                }
              ]]
            }
          }
        );

        db.messageCleanup[`${ctx.chat.id}_${welcome.message_id}`] = Date.now();
        await saveDB();
      }
    } catch (err) {
      console.error("WELCOME ERROR:", err);
    }

    await next();
  });

  // DELETE LINKS + SAVE MESSAGE TIMES
  bot.on("message", async (ctx, next) => {
    try {
      const msg = ctx.message;

      if (
        ctx.chat.type !== "group" &&
        ctx.chat.type !== "supergroup"
      ) return await next();

      const entities = [
        ...(msg.entities || []),
        ...(msg.caption_entities || [])
      ];

      const hasHiddenLink = entities.some(e =>
        e.type === "url" || e.type === "text_link"
      );

      const content = (msg.text || "") + " " + (msg.caption || "");

      const hasLink =
        /https?:\/\/|www\.|t\.me\/|telegram\.me\/|[\w-]+\.(com|net|org|ir|io|me|co|info|biz|app|dev)(\/|\b)/i.test(content);

      // لینک‌های اعضای VIP حذف نشوند
if (
  (hasHiddenLink || hasLink) &&
  !isVIP(ctx.chat.id, ctx.from?.id)
) {
  await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
  return await next();
}

      const key = `${ctx.chat.id}_${msg.message_id}`;
      db.messageCleanup[key] = Date.now();

      await saveDB();
    } catch (err) {
      console.error("MESSAGE CLEANUP ERROR:", err);
    }

    await next();
  });

  // AUTO DELETE AFTER 24 HOURS
  setInterval(async () => {
    try {
      const now = Date.now();
      let changed = false;

      for (const [key, sentAt] of Object.entries(db.messageCleanup)) {
        if (now - Number(sentAt) < 24 * 60 * 60 * 1000) continue;

        const splitAt = key.lastIndexOf("_");
        const chatId = Number(key.slice(0, splitAt));
        const messageId = Number(key.slice(splitAt + 1));

        try {
          await bot.api.deleteMessage(chatId, messageId);

          delete db.messageCleanup[key];
          changed = true;

        } catch (err) {
          console.log("DELETE MESSAGE:", err.message);
        }
      }

      if (changed) await saveDB();
    } catch (err) {
      console.error("AUTO DELETE ERROR:", err);
    }
  }, 60 * 1000);
// ثبت کانال اختصاصی هر ممبر
bot.command("setchannel", async (ctx) => {
if (ctx.chat.type !== "private") {
return ctx.reply("⚠️ این دستور رو در پی‌وی خان اجرا کن.");
}

const channelId = String(ctx.match || "").trim();

if (!channelId) {
return ctx.reply(
"📢 شناسه کانالت رو همراه دستور بفرست.\n\nمثال:\n/setchannel -1001234567890"
);
}

try {
const botInfo = await ctx.api.getMe();
const botMember = await ctx.api.getChatMember(channelId, botInfo.id);
const userMember = await ctx.api.getChatMember(channelId, ctx.from.id);

if (!["administrator", "creator"].includes(botMember.status)) {
  return ctx.reply("❌ اول خان رو در کانالت ادمین کن.");
}

if (!["administrator", "creator"].includes(userMember.status)) {
  return ctx.reply("❌ باید خودت مدیر این کانال باشی.");
}

if (botMember.status === "administrator" && !botMember.can_post_messages) {
  return ctx.reply("❌ اجازه انتشار پست رو به خان بده.");
}

db.memberChannels[ctx.from.id] = channelId;
await saveDB();

await ctx.reply(
  "✅ کانالت با موفقیت ثبت شد.\n\n" +
  "🔒 برای محافظت از محتوای کانالت:\n\n" +
  "۱. وارد تنظیمات کانال شو.\n" +
  "۲. بخش نوع کانال یا Channel Type رو باز کن.\n" +
  "۳. گزینه Restrict Saving Content رو فعال کن.\n\n" +
  "⚠️ خان امکان فعال‌سازی یا بررسی خودکار این گزینه رو نداره.\n" +
  "لطفاً خودت فعال بودنش رو بررسی کن."
);

} catch (err) {
console.error("SET CHANNEL ERROR:", err);
await ctx.reply("❌ نتونستم کانال رو بررسی کنم. شناسه و دسترسی خان رو بررسی کن.");
}
});
// START
bot.command("start", async (ctx) => {
  const payload = String(ctx.match || "").trim();

  // دریافت لینک اختصاصی مدیا
  if (payload.startsWith("media_")) {
    const id = payload.replace("media_", "");
    const media = db.media[id];

    if (!media) {
      return ctx.reply("❌ این مدیا موجود نیست.");
    }

    // بررسی عضویت تبلیغاتی
    if (db.mediaSettings.adEnabled) {
      return ctx.reply(
        "برای مشاهده مدیا ابتدا عضو کانال تبلیغاتی شو.",
        {
          reply_markup: {
            inline_keyboard: [
              [{
                text: "📢 عضویت در کانال",
                url: db.mediaSettings.adLink
              }],
              [{
                text: "✅ عضو شدم، نمایش مدیا",
                callback_data: "show_media_" + id
              }]
            ]
          }
        }
      );
    }

    // انتشار مدیا در کانال اختصاصی ممبر
    const memberChannel = db.memberChannels[ctx.from.id];

    if (!memberChannel) {
      return ctx.reply(
        "⚠️ هنوز کانالت رو ثبت نکردی.\n\nابتدا کانالت رو با دستور زیر ثبت کن:\n/setchannel شناسه_کانال"
      );
    }

    const methods = {
      photo: "sendPhoto",
      video: "sendVideo",
      document: "sendDocument",
      audio: "sendAudio",
      voice: "sendVoice",
      video_note: "sendVideoNote"
    };

    const method = methods[media.type];

    if (!method) {
      return ctx.reply("❌ نوع این مدیا پشتیبانی نمی‌شود.");
    }

    try {
      await ctx.api[method](
        memberChannel,
        media.file_id,
        media.type === "video_note"
          ? { protect_content: true }
          : {
              caption: media.caption || "",
              protect_content: true
            }
      );

      return ctx.reply("✅ مدیا در کانال شما منتشر شد.");
        } catch (err) {
      console.error("MEMBER CHANNEL PUBLISH ERROR:", err);
      return ctx.reply("❌ انتشار در کانالت انجام نشد. دسترسی خان رو بررسی کن.");
    }
  }

  // پیام معمولی شروع ربات
  await ctx.reply(
    `سلام ${ctx.from.first_name} 🌹\nربات مدیریت گروه فعاله.\n\n📩 برای ارسال مدیا، عکس یا فیلم خودت رو همین‌جا بفرست.`
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

  if (!user || !Number.isInteger(days) || days < 1) {
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

  if (!user || !Number.isInteger(days) || days < 1) {
    return ctx.reply("روی پیام شخص ریپلای کن و بنویس: تمدید ۳");
  }

  const key = `${ctx.chat.id}_${user.id}`;
  const current = db.vip[key];

  if (!current || current <= Date.now()) {
    return ctx.reply("این شخص VIP فعال ندارد.");
  }

  db.vip[key] = current + days * 86400000;

  await saveDB();
  await applyPolicy(ctx, user.id);

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

  const members = Object.entries(db.vip)
    .filter(([key, expiry]) =>
      key.startsWith(prefix) && expiry > Date.now()
    );

  const list = await Promise.all(
    members.map(async ([key, expiry]) => {
      const id = key.split("_")[1];

      let name = db.vipNames[key];

      if (!name) {
        try {
          const member = await ctx.api.getChatMember(
            ctx.chat.id,
            Number(id)
          );
          name = member.user.first_name;
        } catch {
          name = "عضو گروه";
        }
      }

      const days = Math.ceil(
        (expiry - Date.now()) / 86400000
      );

      return `⭐ ${name}\nاعتبار: ${days} روز`;
    })
  );

  await ctx.reply(
    list.length
      ? list.join("\n\n")
      : "فهرست ویژه خالی است."
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
bot.hears(/^سکوت\s+(۲۴|24)$/, async (ctx) => {
  if (!isOwner(ctx)) return;

  const user = target(ctx);

  if (!user) {
    return ctx.reply("⚠️ روی پیام شخص موردنظر ریپلای کن.");
  }

  const key = `${ctx.chat.id}_${user.id}`;

  db.muted[key] = Date.now() + 24 * 60 * 60 * 1000;

  await saveDB();
  await applyPolicy(ctx, user.id);

  await ctx.reply(
    `🔇 سکوت ۲۴ ساعته برای ${user.first_name} فعال شد.`
  );
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
bot.hears("رفع سکوت", async (ctx) => {
  if (!isOwner(ctx)) {
    return ctx.reply("⛔ فقط مدیر اصلی اجازه دارد.");
  }

  const user = target(ctx);

  if (!user) {
    return ctx.reply("⚠️ روی پیام شخص موردنظر ریپلای کن.");
  }

  const key = `${ctx.chat.id}_${user.id}`;

  delete db.muted[key];
  await saveDB();

  try {
    await applyPolicy(ctx, user.id);

    await ctx.reply("🔊 سکوت برداشته شد.");

  } catch (err) {
    console.error("UNMUTE ERROR:", err);

    await ctx.reply(
      "❌ خطا در رفع سکوت:\n" +
      String(err.description || err.message || err)
    );
  }
});


// WARN USER
bot.hears("اخطار", async (ctx) => {
  if (ctx.chat.type === "private") return;

  const user = target(ctx);

  if (!user) {
    return ctx.reply("⚠️ برای ثبت اخطار، روی پیام شخص موردنظر ریپلای کن.");
  }

  if (user.is_bot || user.id === ctx.from.id) {
    return ctx.reply("⛔ امکان اخطار دادن به این کاربر وجود ندارد.");
  }

  let allowed = isOwner(ctx) || isVIP(ctx.chat.id, ctx.from.id);

  if (!allowed) {
    try {
      const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
      allowed = ["creator", "administrator"].includes(member.status);
    } catch (err) {
      return ctx.reply("❌ امکان بررسی دسترسی شما وجود ندارد.");
    }
  }

  if (!allowed) {
    return ctx.reply("⛔ فقط مدیران گروه و اعضای VIP اجازه ثبت اخطار دارند.");
  }

  try {
    const targetMember = await ctx.api.getChatMember(ctx.chat.id, user.id);

    if (["creator", "administrator"].includes(targetMember.status)) {
      return ctx.reply("⛔ امکان اخطار دادن به مدیران گروه وجود ندارد.");
    }
  } catch (err) {
    return ctx.reply("❌ امکان بررسی وضعیت این کاربر وجود ندارد.");
  }

  const key = `${ctx.chat.id}_${user.id}`;

  db.warnings[key] ||= 0;

  if (db.warnings[key] >= 3) {
    return ctx.reply("⚠️ این کاربر قبلاً ۳ اخطار دریافت کرده است.");
  }

  db.warnings[key]++;
  const count = db.warnings[key];

  await saveDB();

  const escapeHTML = (text) =>
    String(text).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  const name = escapeHTML(user.first_name || "کاربر");

  await ctx.reply(
    `⚠️ <b>اخطار رسمی</b>\n\n` +
    `<a href="tg://user?id=${user.id}">${name}</a> گرامی، شما یک اخطار دریافت کردید.\n\n` +
    `تعداد اخطارهای ثبت‌شده شما: <b>${count} از ۳</b>\n\n` +
    `لطفاً قوانین گروه را رعایت کنید.\n\n` +
    `🚫 اخطار سوم = بن شدن از گروه`,
    { parse_mode: "HTML" }
  );

  if (count === 3) {
    try {
      await ctx.api.banChatMember(ctx.chat.id, user.id);

      await ctx.reply(
        `🚫 <a href="tg://user?id=${user.id}">${name}</a> به دلیل دریافت ۳ اخطار از گروه بن شد.`,
        { parse_mode: "HTML" }
      );

    } catch (err) {
      console.error("WARNING BAN ERROR:", err);

      await ctx.reply(
        "❌ اخطار سوم ثبت شد، اما خان نتوانست کاربر را بن کند.\n" +
        "دسترسی ادمین ربات برای مسدود کردن اعضا را بررسی کن."
      );
    }
  }
});


// DECREASE WARNING
bot.hears("کاهش اخطار", async (ctx) => {
  if (!isOwner(ctx)) {
    return ctx.reply("⛔ فقط مدیر اصلی اجازه کاهش اخطار را دارد.");
  }

  if (ctx.chat.type === "private") return;

  const user = target(ctx);

  if (!user) {
    return ctx.reply("⚠️ برای کاهش اخطار، روی پیام شخص موردنظر ریپلای کن.");
  }

  const key = `${ctx.chat.id}_${user.id}`;
  const count = db.warnings[key] || 0;

  if (count === 0) {
    return ctx.reply("⚠️ این کاربر اخطاری برای کاهش ندارد.");
  }

  db.warnings[key]--;

  if (db.warnings[key] === 0) {
    delete db.warnings[key];
  }

  await saveDB();

  await ctx.reply(
    `✅ یک اخطار از کاربر ${user.first_name} کم شد.\n` +
    `تعداد اخطارهای باقی‌مانده: ${db.warnings[key] || 0} از ۳`
  );
});


// ASL FORM
bot.hears("فرم اصل", async (ctx) => {
if (ctx.chat.type === "private") return;

const userId = ctx.from.id;

try {
const member = await ctx.api.getChatMember(
ctx.chat.id,
userId
);

const isAdmin =
  member.status === "creator" ||
  member.status === "administrator";

const vip = isVIP(ctx.chat.id, userId);

if (!isAdmin && !vip) {
  return ctx.reply("فقط مدیران و اعضای VIP اجازه دارند.");
}

const form = `به گروه خوش اومدی 🌹

📜 راهنمای گروه و ثبت اصل

<a href="https://t.me/hotiwifeee/11">📋 قوانین گروه</a>

<a href="https://t.me/hotiwifeee/6">🌈 راهنمای گرایشات</a>

<a href="https://t.me/hotiwifeee/7">🌶️ راهنمای رول‌ها و اصطلاحات</a>

━━━━━━━━━━━━━━━━━━

لطفا اصلت طبق موارد زیر رو ادمین ها رپلای کن تا اصلت ثبت کنند

اسم:

سن:

شهر:

رول: هرکدام که هستید (کاکولد، استگ، بول، نفرسوم، وانیلا)

گرایش: (استریت، بایسکشوال)

ثبت رول و گرایش الزامیه.

برای ثبت اصل خانم‌ها، ارسال وویس به ادمین الزامی است.`;

await ctx.reply(form, {
  parse_mode: "HTML",
  link_preview_options: {
    is_disabled: true
  }
});

} catch (err) {
console.error("ASL FORM ERROR:", err);
await ctx.reply("خطا در نمایش فرم.");
}
});


// COPY FORM
bot.hears("کپی", async (ctx) => {
  if (ctx.chat.type === "private") return;

  const replied = ctx.message.reply_to_message;

  if (!replied || !replied.text) {
    return ctx.reply("روی پیام فرم ریپلای کن.");
  }

  try {
    await ctx.api.sendMessage(
      ctx.from.id,
      replied.text
    );

    await ctx.reply("فرم به پی وی ارسال شد.");

  } catch (err) {
    console.error("COPY FORM ERROR:", err);

    await ctx.reply(
      "ابتدا یک پیام در پی وی ربات بفرست، سپس دوباره دستور کپی را بزن."
    );
  }
});
// SET PROFILE
bot.hears("ثبت اصل", async (ctx) => {
  if (ctx.chat.type === "private") return;

  const user = target(ctx);
  const key = targetKey(ctx);

  if (!user || !ctx.from || (!isOwner(ctx) && !isVIP(ctx.chat.id, ctx.from.id))) {
    return ctx.reply("فقط اعضای VIP می‌توانند پرونده ثبت کنند. باید روی پیام مشخصات شخص ریپلای کنی.");
  }

  if (db.profiles[key]) {
    return ctx.reply("⚠️ این شخص قبلاً پرونده ثبت‌شده دارد. پرونده قبلی حفظ شد.");
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

  
// PROFILE MENU
function profileMenu(key) {
  const count = db.tags?.[key]?.length || 0;

  return {
    inline_keyboard: [
      [
        {
          text: "👤 Personal Profile",
          callback_data: `pr|p|${key}`
        }
      ],
      [
        {
          text: `🏷 Tags (${count})`,
          callback_data: `pr|t|${key}|0`
        }
      ]
    ]
  };
}

// SHOW PROFILE
bot.hears("اصل", async (ctx) => {
  const key = targetKey(ctx);

  if (!key) return ctx.reply("روی پیام شخص ریپلای کن.");

  if (!db.profiles[key]) {
    return ctx.reply("پرونده‌ای ثبت نشده.");
  }

  await ctx.reply("📋 پرونده عضو\n\nبرای مشاهده بخش موردنظر انتخاب کن:", {
    reply_markup: profileMenu(key)
  });
});

// MY PROFILE
bot.hears("اصل من", async (ctx) => {
  if (!ctx.from) return;

  const key = `${ctx.chat.id}_${ctx.from.id}`;

  if (!db.profiles[key]) {
    return ctx.reply("📋 هنوز پرونده‌ای برای شما ثبت نشده.");
  }

  await ctx.reply("📋 پرونده شخصی شما\n\nیک بخش را انتخاب کن:", {
    reply_markup: profileMenu(key)
  });
});

// PROFILE BUTTONS
bot.callbackQuery(/^pr\|(p|t)\|(-?\d+_\d+)(?:\|(\d+))?$/, async (ctx) => {
  const type = ctx.match[1];
  const key = ctx.match[2];
  const page = Number(ctx.match[3] || 0);

  const profile = db.profiles[key];

  if (!profile) {
    return ctx.answerCallbackQuery({
      text: "پرونده پیدا نشد."
    });
  }

  let text = "";
  let keyboard;

  if (type === "p") {
    text = "👤 Personal Profile\n\n" + profile.text;

    keyboard = {
      inline_keyboard: [
        [
          {
            text: "🔙 Back",
            callback_data: `pr|m|${key}`
          }
        ]
      ]
    };
  }

  if (type === "t") {
    const tags = db.tags?.[key] || [];

    const perPage = 10;
    const totalPages = Math.max(1, Math.ceil(tags.length / perPage));
    const currentPage = Math.min(page, totalPages - 1);

    const start = currentPage * perPage;
    const shownTags = tags.slice(start, start + perPage);

    text = `🏷 Tags\n\nتعداد کل: ${tags.length}\nصفحه ${currentPage + 1} از ${totalPages}\n\n`;

    text += shownTags.length
      ? shownTags.map((tag, i) => `${start + i + 1}. ⭐ ${tag}`).join("\n")
      : "هنوز برچسبی ثبت نشده.";

    keyboard = {
      inline_keyboard: [
        [
          ...(currentPage > 0
            ? [{
                text: "⬅️ Previous",
                callback_data: `pr|t|${key}|${currentPage - 1}`
              }]
            : []),

          ...(currentPage < totalPages - 1
            ? [{
                text: "Next ➡️",
                callback_data: `pr|t|${key}|${currentPage + 1}`
              }]
            : [])
        ],
        [
          {
            text: "🔙 Back",
            callback_data: `pr|m|${key}`
          }
        ]
      ]
    };
  }

  await ctx.editMessageText(text, {
    reply_markup: keyboard
  });

  await ctx.answerCallbackQuery();
});

// BACK TO PROFILE MENU
bot.callbackQuery(/^pr\|m\|(-?\d+_\d+)$/, async (ctx) => {
  const key = ctx.match[1];

  if (!db.profiles[key]) {
    return ctx.answerCallbackQuery({
      text: "پرونده پیدا نشد."
    });
  }

  await ctx.editMessageText(
    "📋 پرونده عضو\n\nبرای مشاهده بخش موردنظر انتخاب کن:",
    {
      reply_markup: profileMenu(key)
    }
  );

  await ctx.answerCallbackQuery();
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

// KHAN REPLY
bot.hears("خان", async (ctx) => {
  if (ctx.from.is_bot) return;

  const key = `${ctx.chat.id}_${ctx.from.id}`;
  const tags = db.tags[key] || [];

  if (tags.length > 0) {
    const tag = tags[Math.floor(Math.random() * tags.length)];
    return ctx.reply(`جان ${tag} ❤️`);
  }

  return ctx.reply("جان عزیزم ❤️");
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

  // ===== KHAN MEDIA =====

  function getMedia(msg) {
    if (msg.photo) {
      return {
        type: "photo",
        file_id: msg.photo[msg.photo.length - 1].file_id
      };
    }

    for (const type of ["video", "document", "animation", "audio", "voice", "video_note"]) {
      if (msg[type]) {
        return {
          type,
          file_id: msg[type].file_id
        };
      }
    }

    return null;
  }

  // تنظیم کانال خان مدیا
  bot.hears(/^تنظیم کانال مدیا (.+)$/, async (ctx) => {
    if (!isOwner(ctx)) return;

    db.mediaSettings.channelId = ctx.match[1].trim();
    await saveDB();

    await ctx.reply("✅ کانال خان مدیا تنظیم شد.");
  });

  // تنظیم کانال تبلیغاتی
  bot.hears(/^تنظیم تبلیغ (.+) (https:\/\/\S+)$/, async (ctx) => {
    if (!isOwner(ctx)) return;

    db.mediaSettings.adChannel = ctx.match[1].trim();
    db.mediaSettings.adLink = ctx.match[2].trim();

    await saveDB();
    await ctx.reply("✅ کانال تبلیغاتی ثبت شد.");
  });

  // روشن کردن تبلیغات
  bot.hears("روشن کردن تبلیغات", async (ctx) => {
    if (!isOwner(ctx)) return;

    if (!db.mediaSettings.adChannel) {
      return ctx.reply("⚠️ ابتدا کانال تبلیغاتی را تنظیم کن.");
    }

    db.mediaSettings.adEnabled = true;
    await saveDB();

    await ctx.reply("✅ عضویت اجباری روشن شد.");
  });

  // خاموش کردن تبلیغات
  bot.hears("خاموش کردن تبلیغات", async (ctx) => {
    if (!isOwner(ctx)) return;

    db.mediaSettings.adEnabled = false;
    await saveDB();

    await ctx.reply("✅ عضویت اجباری خاموش شد.");
  });

  // حذف کانال تبلیغاتی
  bot.hears("حذف کانال تبلیغاتی", async (ctx) => {
    if (!isOwner(ctx)) return;

    db.mediaSettings.adChannel = null;
    db.mediaSettings.adLink = null;
    db.mediaSettings.adEnabled = false;

    await saveDB();
    await ctx.reply("✅ کانال تبلیغاتی حذف شد.");
  });

// دریافت مدیا از کاربران
bot.on("message", async (ctx, next) => {
  if (ctx.chat.type !== "private") return next();
  if (isOwner(ctx)) return next();

  const media = getMedia(ctx.message);
  if (!media) return next();

  const id = Date.now().toString();

  // بررسی VIP بودن در گروه اصلی
  const vip = isVIP(-1004449300940, ctx.from.id);

  // مسیر اختصاصی اعضای VIP
  if (vip) {
    if (!db.mediaSettings.channelId) {
      return ctx.reply("❌ کانال مرکزی مدیا هنوز تنظیم نشده است.");
    }

    try {
      const method =
        "send" + media.type.charAt(0).toUpperCase() + media.type.slice(1);

      const sent = await bot.api[method](
        db.mediaSettings.channelId,
        media.file_id,
        media.type === "video_note"
          ? { protect_content: true }
          : {
              caption: media.caption || "",
              protect_content: true
            }
      );

      // ذخیره اطلاعات مدیا
      db.media[id] = {
        ...media,
        caption: ctx.message.caption || "",
        channelMessageId: sent.message_id
      };

      await saveDB();

      // ساخت لینک اختصاصی
      const me = await bot.api.getMe();
      const link = `https://t.me/${me.username}?start=media_${id}`;

      await ctx.reply(
        "✅ مدیای شما در کانال مرکزی ذخیره شد.\n\n" +
        "🔗 لینک اختصاصی شما:\n" + link,
        {
          link_preview_options: {
            is_disabled: true
          }
        }
      );

    } catch (err) {
      console.error("VIP MEDIA ERROR:", err);
      await ctx.reply("❌ هنگام ذخیره مدیا مشکلی پیش آمد.");
    }

    return;
  }

  // مسیر کاربران عادی؛ نیازمند تأیید مدیر
  db.pendingMedia[id] = {
    ...media,
    caption: ctx.message.caption || ""
  };

  await saveDB();

  await ctx.reply("✅ مدیای شما دریافت شد و منتظر تأیید مدیر است.");

  const options = {};
  if (media.type !== "video_note") {
    options.caption = "📩 مدیای جدید برای بررسی\nشناسه: " + id;
  }

  const method =
    "send" + media.type.charAt(0).toUpperCase() + media.type.slice(1);

  await bot.api[method](OWNER_ID, media.file_id, options);

  await bot.api.sendMessage(
    OWNER_ID,
    "مدیا را تأیید یا رد کن.",
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ تأیید و انتشار", callback_data: "media_yes_" + id },
          { text: "❌ رد", callback_data: "media_no_" + id }
        ]]
      }
    }
  );

  return;
});

 // تأیید و انتشار مدیا
bot.callbackQuery(/^media_yes_(.+)$/, async (ctx) => {
if (!isOwner(ctx)) {
return ctx.answerCallbackQuery("فقط مدیر اصلی اجازه دارد.");
}

const id = ctx.match[1];
const media = db.pendingMedia[id];

if (!media) {
return ctx.answerCallbackQuery("مدیا پیدا نشد.");
}

if (!db.mediaSettings.channelId) {
return ctx.answerCallbackQuery("کانال مدیا تنظیم نشده است.");
}

try {
const method =
"send" + media.type.charAt(0).toUpperCase() + media.type.slice(1);

const sent = await bot.api[method](
  db.mediaSettings.channelId,
  media.file_id,
  media.type === "video_note"
  ? { protect_content: true }
  : {
      caption: media.caption || "",
      protect_content: true
    }
);
db.media[id] = {
  ...media,
  channelMessageId: sent.message_id
};

delete db.pendingMedia[id];
await saveDB();

const me = await bot.api.getMe();
const link = `https://t.me/${me.username}?start=media_${id}`;

// ارسال کپشن و لینک به گروه اصلی
const groupText =
  "🎬 مدیای جدید منتشر شد.\n\n" +
  (media.caption ? "📝 " + media.caption + "\n\n" : "") +
  "🔗 مشاهده مدیا:\n" + link;

await bot.api.sendMessage(
  -1004449300940,
  groupText,
  {
    link_preview_options: {
      is_disabled: true
    }
  }
);
await ctx.editMessageText(
  "✅ مدیا منتشر شد.\n\n🔗 لینک اختصاصی:\n" + link
);

await ctx.answerCallbackQuery("منتشر شد.");

} catch (err) {
console.error("MEDIA PUBLISH ERROR:", err);
await ctx.answerCallbackQuery("خطا در انتشار مدیا.");
}
});

// رد مدیا
bot.callbackQuery(/^media_no_(.+)$/, async (ctx) => {
if (!isOwner(ctx)) {
return ctx.answerCallbackQuery("فقط مدیر اصلی اجازه دارد.");
}

const id = ctx.match[1];

if (!db.pendingMedia[id]) {
return ctx.answerCallbackQuery("مدیا پیدا نشد.");
}

delete db.pendingMedia[id];
await saveDB();

await ctx.editMessageText("❌ مدیا رد شد.");
await ctx.answerCallbackQuery("رد شد.");
});

// نمایش مدیا در کانال اختصاصی ممبر
bot.callbackQuery(/^show_media_(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  const media = db.media[id];

  if (!media) {
    return ctx.answerCallbackQuery("مدیا موجود نیست.");
  }

  try {
    // بررسی عضویت در کانال تبلیغاتی
    if (db.mediaSettings.adEnabled) {
      const member = await ctx.api.getChatMember(
        db.mediaSettings.adChannel,
        ctx.from.id
      );

      const joined =
        ["creator", "administrator", "member"].includes(member.status) ||
        (member.status === "restricted" && member.is_member);

      if (!joined) {
        return ctx.answerCallbackQuery("ابتدا عضو کانال تبلیغاتی شو.");
      }
    }

    // پیدا کردن کانال ثبت‌شده ممبر
    const memberChannel = db.memberChannels[ctx.from.id];

    if (!memberChannel) {
      return ctx.answerCallbackQuery(
        "ابتدا کانال خودت رو با دستور /setchannel ثبت کن."
      );
    }

    const methods = {
      photo: "sendPhoto",
      video: "sendVideo",
      document: "sendDocument",
      audio: "sendAudio",
      voice: "sendVoice",
      video_note: "sendVideoNote"
    };

    const method = methods[media.type];

    if (!method) {
      return ctx.answerCallbackQuery("نوع مدیا پشتیبانی نمی‌شود.");
    }

    await ctx.api[method](
      memberChannel,
      media.file_id,
      media.type === "video_note"
        ? { protect_content: true }
        : {
            caption: media.caption || "",
            protect_content: true
          }
    );

    await ctx.answerCallbackQuery("مدیا در کانالت منتشر شد.");

  } catch (err) {
    console.error("SHOW MEDIA ERROR:", err);
    await ctx.answerCallbackQuery("خطا در انتشار مدیا در کانال.");
  }
});

  bot.command("ping", (ctx) => ctx.reply("ربات فعاله"));


  // BAN USER
  bot.hears("بن", async (ctx) => {
    if (ctx.chat.type === "private") return;

    try {
      const member = await ctx.api.getChatMember(
        ctx.chat.id,
        ctx.from.id
      );

      const isAdmin =
        member.status === "creator" ||
        member.status === "administrator";

      if (!isAdmin) {
        return ctx.reply("فقط مدیران گروه اجازه بن دارند.");
      }

      const replied = ctx.message.reply_to_message;

      if (!replied || !replied.from) {
        return ctx.reply("روی پیام شخص موردنظر ریپلای کن.");
      }

      const userId = replied.from.id;

      if (userId === ctx.from.id) {
        return ctx.reply("نمی‌توانی خودت را بن کنی.");
      }

      await ctx.api.banChatMember(ctx.chat.id, userId);

      await ctx.reply(
        `کاربر با شناسه ${userId} از گروه بن شد.`
      );

    } catch (err) {
      console.error("BAN ERROR:", err);
      await ctx.reply("خطا در بن کردن کاربر.");
    }
  });


  // UNBAN USER
  bot.hears(/^رفع بن\s+([0-9۰-۹]+)$/, async (ctx) => {
    if (ctx.chat.type === "private") return;

    try {
      const member = await ctx.api.getChatMember(
        ctx.chat.id,
        ctx.from.id
      );

      const isAdmin =
        member.status === "creator" ||
        member.status === "administrator";

      if (!isAdmin) {
        return ctx.reply("فقط مدیران گروه اجازه رفع بن دارند.");
      }

      const userId = Number(
        ctx.match[1].replace(/[۰-۹]/g, d =>
          "۰۱۲۳۴۵۶۷۸۹".indexOf(d)
        )
      );

      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return ctx.reply("شناسه عددی معتبر نیست.");
      }

      await ctx.api.unbanChatMember(ctx.chat.id, userId);

      await ctx.reply(
        `بن کاربر با شناسه ${userId} برداشته شد. اکنون می‌تواند دوباره وارد گروه شود.`
      );

    } catch (err) {
      console.error("UNBAN ERROR:", err);
      await ctx.reply("خطا در رفع بن کاربر.");
    }
  });

}
