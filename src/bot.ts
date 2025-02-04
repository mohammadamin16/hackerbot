import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import * as cheerio from "cheerio";
import * as dotenv from "dotenv";
import OpenAI from "openai";
import { Article } from "./types";
import {
  initializeDatabase,
  isArticleProcessed,
  insertProcessedArticle,
  cleanupOldArticles,
} from "./database";

// Load environment variables from .env file
dotenv.config();

// Initialize bot with your token (you'll need to set this as an environment variable)
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN || "", {
  polling: true,
});

const baleBot = new TelegramBot(process.env.BALE_BOT_TOKEN || "", {
  polling: true,
  baseApiUrl: "https://tapi.bale.ai",
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.metisai.ir/openai/v1",
});

// Function to translate text using OpenAI
async function translateText(text: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Translate the following text to Persian:\n${text}`,
        },
      ],
      model: "gpt-4o-mini",
    });
    return completion.choices[0]?.message?.content || text;
  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
}

// Function to fetch and parse articles from the website
async function fetchArticles() {
  try {
    const response = await axios.get("https://hackernews.betacat.io/");
    const $ = cheerio.load(response.data);
    const articles: Article[] = [];

    $(".post-item").each((_, element) => {
      const titleElement = $(element).find(".post-title a");
      const title = titleElement.text().trim();
      const link = titleElement.attr("href") || "";
      const imgElement = $(element).find(".feature-image img");
      const imgUrl = imgElement.attr("src") || "";
      const summaryElement = $(element).find(".post-summary");
      const summary = summaryElement.text().trim();

      if (title && link) {
        articles.push({
          title,
          link,
          imgUrl: imgUrl.startsWith("/")
            ? `https://hackernews.betacat.io${imgUrl}`
            : imgUrl,
          summary,
        });
      }
    });

    return articles;
  } catch (error) {
    console.error("Error fetching articles:", error);
    return [];
  }
}

// Function to send new articles to Telegram
async function sendNewArticles(chatId: string) {
  try {
    const articles = await fetchArticles();

    for (const article of articles) {
      // Check if article was already processed
      const isProcessed = await isArticleProcessed(article.title);
      if (isProcessed) continue;

      // Translate title and summary
      article.translatedTitle = await translateText(article.title);
      if (article.summary) {
        article.translatedSummary = await translateText(article.summary);
      }

      let message = `📰 *${article.title}* \n`;
      message += `🔰 ${article.translatedTitle}\n\n`;
      if (article.summary) {
        message += `📌 ${article.translatedSummary}\n\n`;
      }
      message += `🔗 ${article.link}`;

      if (article.imgUrl) {
        await baleBot.sendPhoto(chatId, article.imgUrl, {
          caption: message,
          parse_mode: "HTML",
        });
      } else {
        await baleBot.sendMessage(chatId, message, { parse_mode: "HTML" });
      }

      // Store the processed article in the database
      await insertProcessedArticle(article);
    }

    // Cleanup old articles periodically
    await cleanupOldArticles();
  } catch (error) {
    console.error("Error sending articles:", error);
  }
}

// Initialize database when the bot starts
initializeDatabase().catch(console.error);
const msgIds: number[] = [];

// Command to start the bot and set up the chat
baleBot.onText(/\/start/, (msg) => {
  if (msgIds.includes(msg.message_id)) {
    return;
  }
  msgIds.push(msg.message_id);
  const chatId = msg.chat.id.toString();
  baleBot.sendMessage(chatId, "Hey");

  // Set up the interval to check for new articles
  setInterval(() => sendNewArticles(chatId), 8 * 60 * 60 * 1000);

  // Do an initial check immediately
  sendNewArticles(chatId);
  sendNewArticles(process.env.BALE_CHANNEL_ID || " ");
});

baleBot.onText(/\/channel/, (msg) => {
  baleBot.sendMessage(process.env.BALE_CHANNEL_ID || " ", "test");
});
// Enable graceful stop
process.once("SIGINT", () => baleBot.stopPolling());
process.once("SIGTERM", () => baleBot.stopPolling());
