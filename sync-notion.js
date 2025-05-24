require('dotenv').config(); // Load environment variables from .env file (for local testing)

const { Client } = require('@notionhq/client'); // Notion API client
const { NotionToMarkdown } = require('notion-to-md'); // Converter for Notion blocks to Markdown
const fs = require('fs'); // Node.js File System module
const path = require('path'); // Node.js Path module

// --- Configuration ---
// These values will be loaded from environment variables.
// For local testing, they come from your .env file.
// For GitHub Actions, they come from GitHub Secrets.
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Define the directory where Hugo expects your blog post Markdown files.
// This creates 'my-blog-site/content/posts/'
const HUGO_CONTENT_DIR = path.join(__dirname, 'content', 'posts');

// Initialize the Notion API client
const notion = new Client({ auth: NOTION_TOKEN });

// Initialize the Notion-to-Markdown converter
const n2m = new NotionToMarkdown({ notionClient: notion });

// --- Main Synchronization Function ---
async function syncNotionContent() {
    // Basic check to ensure required environment variables are set
    if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
        console.error("Error: NOTION_TOKEN or NOTION_DATABASE_ID is not set.");
        console.error("Please make sure they are defined in your .env file (for local testing) or GitHub Secrets.");
        process.exit(1); // Exit if critical variables are missing
    }

    console.log(`Starting Notion content sync for database ID: ${NOTION_DATABASE_ID}`);

    try {
        // 1. Query the Notion database to get your blog post pages.
        // We filter to get only pages where the 'draft' checkbox is checked.
        // We sort by 'Date' in descending order (newest first).
        const { results: pages } = await notion.databases.query({
            database_id: NOTION_DATABASE_ID,
            filter: {
                property: 'draft', // Matches your Notion 'draft' checkbox property name
                checkbox: {
                    equals: true,
                },
            },
            sorts: [
                {
                    property: 'Date', // Matches your Notion 'Date' property name
                    direction: 'descending',
                },
            ],
        });

        // Ensure the target directory for Hugo content exists. If not, create it.
        if (!fs.existsSync(HUGO_CONTENT_DIR)) {
            fs.mkdirSync(HUGO_CONTENT_DIR, { recursive: true });
            console.log(`Created content directory: ${HUGO_CONTENT_DIR}`);
        }

        // 2. Process each page (blog post) fetched from Notion.
        for (const page of pages) {
            const pageId = page.id; // Unique ID of the Notion page
            const properties = page.properties; // All the properties (columns) of the Notion page

            // --- Extract Data from Notion Properties ---
            // These lines map your Notion column names to variables for your Hugo front matter.
            // Ensure the property names (`Name`, `Slug`, `Date`, `Tags`) match EXACTLY
            // what you named your columns in Notion (case-sensitive!).

            // Get the Title from the 'Name' property
            const title = properties.Name?.title?.[0]?.plain_text || 'Untitled Post';

            // Get the Slug from the 'Slug' property.
            // Includes a fallback to generate a slug from the title if 'Slug' is empty.
            const slug = properties.Slug?.rich_text?.[0]?.plain_text ||
                         title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');

            // Get the Date from the 'Date' property.
            // Fallback to current date if 'Date' is empty.
            const date = properties.Date?.date?.start || new Date().toISOString().split('T')[0];

            // Get Tags from the 'Tags' multi-select property.
            // Maps the Notion tag objects to just their names.
            const tags = properties.Tags?.multi_select?.map(t => t.name) || [];

            // --- Convert Notion Page Content to Markdown ---
            // This fetches all the blocks (paragraphs, headings, code, equations, etc.)
            // from the Notion page body and converts them into a Markdown string.
            const mdblocks = await n2m.pageToMarkdown(pageId);
            let markdownContent = n2m.toMarkdownString(mdblocks).parent;

            // --- Construct Hugo Front Matter (YAML format) ---
            // This is the metadata block at the top of your Markdown file that Hugo reads.
            const frontMatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: "${date}"
slug: "${slug}"
tags: [${tags.map(t => `"${t}"`).join(', ')}]
draft: false
---\n\n`;

            const fullContent = frontMatter + markdownContent;

            // 3. Define the output file path for the Markdown file.
            // Files will be named using the slug (e.g., 'my-blog-site/content/posts/my-first-blog-post.md')
            const filePath = path.join(HUGO_CONTENT_DIR, `${slug}.md`);

            // 4. Write the combined content to the Markdown file.
            fs.writeFileSync(filePath, fullContent, 'utf8');
            console.log(`Generated: ${filePath}`);
        }

        console.log('Notion content sync complete. All published posts have been processed.');

    } catch (error) {
        // Error handling for Notion API issues or file system errors
        console.error('An error occurred during Notion content sync:', error);
        if (error.status) console.error('Notion API Status:', error.status);
        if (error.code) console.error('Notion API Code:', error.code);
        if (error.body) console.error('Notion API Response Body:', error.body);
        process.exit(1); // Exit with an error code to indicate failure
    }
}

// Call the main synchronization function to start the process
syncNotionContent();
