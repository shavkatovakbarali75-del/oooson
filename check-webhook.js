import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const BOT_TOKEN = process.env.BOT_TOKEN;
fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`)
  .then(res => res.json())
  .then(console.log)
  .catch(console.error);
