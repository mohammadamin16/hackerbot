import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import * as cheerio from "cheerio";
import * as dotenv from "dotenv";
import OpenAI from "openai";

// Load environment variables from .env file
dotenv.config();

// Initialize bot with your token (you'll need to set this as an environment variable)
const bot = new TelegramBot(process.env.BALE_BOT_TOKEN || "", {
  polling: true,
  baseApiUrl: "https://tapi.bale.ai",
});

interface Article {
  title: string;
  translatedTitle?: string;
  summary?: string;
  translatedSummary?: string;
  link?: string;
  imgUrl?: string;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.metisai.ir/openai/v1",
});

// Function to translate text using OpenAI
async function translateText(text: string): Promise<string> {
  console.log("text", text);
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
    console.log("result", JSON.stringify(completion.choices[0].message.content));
    return completion.choices[0]?.message?.content || text;
  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
}

// Store the last processed articles to avoid duplicates
let lastProcessedArticles = new Set<Article>();

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
    const newArticles = articles.filter(
      (article) =>
        !Array.from(lastProcessedArticles).some(
          (a) => a.title === article.title
        )
    );

    for (const article of newArticles) {
      // Translate title and summary
      article.translatedTitle = await translateText(article.title);
      if (article.summary) {
        article.translatedSummary = await translateText(article.summary);
      }

      let message = `📰 *${article.title}* \n`;
      message += `🔰 ${article.translatedTitle}\n\n`;
      if (article.summary) {
        // message += `📝 ${article.summary}\n`;
        message += `📌 ${article.translatedSummary}\n\n`;
      }
      message += `🔗 ${article.link}`;

      if (article.imgUrl) {
        await bot.sendPhoto(chatId, article.imgUrl, {
          caption: message,
          parse_mode: "HTML",
        });
      } else {
        await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      }
      lastProcessedArticles.add(article);

      // Keep only the most recent articles in memory
      if (lastProcessedArticles.size > 100) {
        const articlesArray = Array.from(lastProcessedArticles);
        lastProcessedArticles = new Set(articlesArray.slice(-50));
      }
    }
  } catch (error) {
    console.error("Error sending articles:", error);
  }
}

// Command to start the bot and set up the chat
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id.toString();
  bot.sendMessage(
    chatId,
    "Welcome! I will send you new Hacker News articles every 5 minutes."
  );

  // Set up the interval to check for new articles
  setInterval(() => sendNewArticles(chatId), 5 * 60 * 1000);

  // Do an initial check immediately
  sendNewArticles(chatId);
});

// Enable graceful stop
process.once("SIGINT", () => bot.stopPolling());
process.once("SIGTERM", () => bot.stopPolling());

translateText("hello").then(console.log).catch(console.error);
