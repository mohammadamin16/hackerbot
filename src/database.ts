import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import { Article } from "./types";

let db: Database | null = null;

export async function initializeDatabase() {
    if (!db) {
        db = await open({
            filename: "articles.db",
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT UNIQUE,
                link TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    return db;
}

export async function isArticleProcessed(title: string): Promise<boolean> {
    const database = await initializeDatabase();
    const result = await database.get(
        "SELECT 1 FROM articles WHERE title = ?",
        [title]
    );
    return !!result;
}

export async function insertProcessedArticle(article: Article): Promise<void> {
    const database = await initializeDatabase();
    await database.run(
        "INSERT OR IGNORE INTO articles (title, link) VALUES (?, ?)",
        [article.title, article.link]
    );
}

export async function cleanupOldArticles(): Promise<void> {
    const database = await initializeDatabase();
    // Keep only the last 1000 articles
    await database.run(`
        DELETE FROM articles 
        WHERE id NOT IN (
            SELECT id FROM articles 
            ORDER BY created_at DESC 
            LIMIT 1000
        )
    `);
}