import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import dotenv from 'dotenv';
import { db } from './firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

dotenv.config({ path: '.env.local' });

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://oooson.vercel.app';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi! .env.local fayliga BOT_TOKEN qo\'shing.');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// Simple in-memory state management for registration steps
const registrationState = new Map<number, { step: 'WAITING_NAME', phone: string }>();

// Error handler
bot.catch((err) => {
  console.error('Bot xatosi:', err.message);
});

// /start komandasi
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    // Check if user is already registered in Firebase
    const docRef = doc(db, 'telegram_users', userId.toString());
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // User is already registered
      const keyboard = new InlineKeyboard().webApp("📚 Oson So'z'ni ochish", APP_URL);
      await ctx.reply(
        `Salom yana bir bor, ${docSnap.data().name}! 👋\n\nDavom etish uchun ilovani oching:`,
        { reply_markup: keyboard }
      );
    } else {
      // User is new, ask for phone number
      const keyboard = new Keyboard()
        .requestContact("📱 Raqamni yuborish").resized().oneTime();
      
      await ctx.reply(
        `Salom, ${ctx.from?.first_name || "do'stim"}! 👋\n\n` +
        `🎓 <b>Oson So'z</b> platformasiga xush kelibsiz.\n` +
        `Ro'yxatdan o'tish uchun quyidagi tugmani bosib, telefon raqamingizni yuboring. 👇`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }
      );
    }
  } catch (err) {
    console.error("Firebase error on start:", err);
    await ctx.reply("Tizimda xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.");
  }
});

// Handle contact sharing
bot.on('message:contact', async (ctx) => {
  const userId = ctx.from.id;
  const phone = ctx.message.contact.phone_number;

  // Verify that the contact belongs to the user
  if (ctx.message.contact.user_id !== userId) {
    await ctx.reply("Iltimos, faqat o'zingizning raqamingizni yuboring!");
    return;
  }

  // Save to state and ask for name
  registrationState.set(userId, { step: 'WAITING_NAME', phone });

  await ctx.reply("Rahmat! Endi platformada ko'rinadigan ismingizni kiriting (masalan, Akbarali):", {
    reply_markup: { remove_keyboard: true }
  });
});

// Handle text messages (for name input and general)
bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Check if user is in registration process
  if (registrationState.has(userId)) {
    const state = registrationState.get(userId);
    if (state?.step === 'WAITING_NAME') {
      const phone = state.phone;
      const name = text.trim();

      try {
        // Save to Firebase
        await setDoc(doc(db, 'telegram_users', userId.toString()), {
          telegramId: userId,
          phone: phone,
          name: name,
          registeredAt: new Date().toISOString()
        });

        // Clear state
        registrationState.delete(userId);

        // Send success message and WebApp button
        const keyboard = new InlineKeyboard().webApp("📚 Oson So'z'ni ochish", APP_URL);
        await ctx.reply(
          `Tabriklaymiz, ${name}! 🎉 Muvaffaqiyatli ro'yxatdan o'tdingiz.\n\nEndi quyidagi tugma orqali ilovaga kirishingiz mumkin. 👇`,
          { reply_markup: keyboard }
        );
      } catch (err) {
        console.error("Error saving user:", err);
        await ctx.reply("Kechirasiz, ro'yxatdan o'tishda xatolik yuz berdi.");
      }
      return;
    }
  }

  // Normal text response
  const keyboard = new InlineKeyboard().webApp("📚 Oson So'z'ni ochish", APP_URL);
  await ctx.reply(
    "Ilovani ochish uchun quyidagi tugmani bosing yoki /start komandasini yuboring! 📚",
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
