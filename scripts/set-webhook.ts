import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://oooson.vercel.app';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing!');
  process.exit(1);
}

const webhookUrl = `${APP_URL}/api/webhook`;

async function setWebhook() {
  console.log(`Setting webhook to: ${webhookUrl}...`);
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Webhook successfully set!');
    } else {
      console.error('❌ Failed to set webhook:', data.description);
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error);
  }
}

setWebhook();
