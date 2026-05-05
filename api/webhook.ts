import { webhookCallback } from 'grammy';
import { bot } from '../src/bot.js';

// Vercel Serverless Function export
// We wrap it to allow easier debugging if needed and to ensure correct response handling
export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      return res.status(200).send('Oooson Bot Webhook is active and running.');
    }
    
    // grammy's webhookCallback handles the request and sends the response
    return await webhookCallback(bot, 'http')(req, res);
  } catch (error: any) {
    console.error('Webhook Handler Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
