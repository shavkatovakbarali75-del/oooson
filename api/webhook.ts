import { webhookCallback } from 'grammy';
import { bot } from '../src/bot.js';

// Vercel Serverless Function export
export default webhookCallback(bot, 'http');
