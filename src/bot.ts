import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://oooson.vercel.app';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi! .env.local fayliga BOT_TOKEN qo\'shing.');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// Error handler
bot.catch((err) => {
  console.error('Bot xatosi:', err.message);
});

// /start komandasi
bot.command('start', async (ctx) => {
  const userName = ctx.from?.first_name || "do'stim";
  
  const keyboard = new InlineKeyboard()
    .webApp("📚 Oson So'z'ni ochish", APP_URL);

  await ctx.reply(
    `Salom, ${userName}! 👋\n\n` +
    `🎓 <b>Oson So'z</b> — ingliz tili so'zlarini oson va samarali yodlash platformasi.\n\n` +
    `🧠 Sun'iy intellekt yordamida so'z yarating\n` +
    `🃏 Flashkartalar bilan yodlang\n` +
    `🎮 6 xil mashq rejimida mashq qiling\n` +
    `🏆 Reytingda boshqalar bilan raqobatlashing\n\n` +
    `Boshlash uchun quyidagi tugmani bosing! 👇`,
    {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );
});

// /help komandasi
bot.command('help', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp("📚 Ochish", APP_URL);

  await ctx.reply(
    `📖 <b>Oson So'z — Yordam</b>\n\n` +
    `Mavjud komandalar:\n` +
    `/start - Botni boshlash\n` +
    `/help - Yordam\n` +
    `/app - Ilovani ochish\n\n` +
    `Savollar uchun: @akbarali_shavkatov`,
    {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );
});

// /app komandasi
bot.command('app', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp("📚 Oson So'z'ni ochish", APP_URL);

  await ctx.reply("Ilovani ochish uchun tugmani bosing 👇", {
    reply_markup: keyboard,
  });
});

// Oddiy xabar uchun javob
bot.on('message:text', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp("📚 Oson So'z'ni ochish", APP_URL);

  await ctx.reply(
    "So'z yodlashni boshlash uchun quyidagi tugmani bosing yoki /start komandasini yuboring! 📚",
    { reply_markup: keyboard }
  );
});

// Botni ishga tushirish
bot.start({
  onStart: (botInfo) => {
    console.log(`\n🤖 Oson So'z Bot ishga tushdi!`);
    console.log(`   Bot: @${botInfo.username}`);
    console.log(`   App URL: ${APP_URL}`);
    console.log(`\n   Telegram'da ochish: https://t.me/${botInfo.username}\n`);
  },
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
