import "dotenv/config";
import { Client } from "@notionhq/client";
import { Job } from "./scraper";

const notion = new Client({ auth: process.env.NOTION_API });

const NOTION_DB_ID = process.env.NOTION_DB_ID;
if (!NOTION_DB_ID) throw new Error("NOTION_DB_ID is not defined");

export async function addJobToNotion(job: Job) {
  await notion.pages.create({
    parent: { database_id: NOTION_DB_ID as string },
    properties: {
      title: {
        title: [
          {
            text: {
              content: job.title || "No title",
            },
          },
        ],
      },
      Company: {
        rich_text: [{ text: { content: job.company || "" } }],
      },
      Location: {
        rich_text: [{ text: { content: job.location || "" } }],
      },
      Salary: {
        rich_text: [{ text: { content: job.salary || "" } }],
      },
      "Job Type": {
        select: {
          name: job.jobType || "Unknown",
        },
      },
      Status: {
        status: {
          name: "New",
        },
      },
      Platform: {
        select: {
          name: "Indeed",
        },
      },
      Link: {
        url: job.link || "",
      },
    },
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: job.description?.slice(0, 2000) || "No description available.",
              },
            },
          ],
        },
      },
    ],
  });
}

export async function checkIfJobExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          property: "Link",
          url: {
            equals: url,
          },
        },
      }),
    });

    if (!response.ok) {
      console.error("Notion API error:", await response.text());
      return false;
    }

    const data = await response.json();
    return data.results && data.results.length > 0;
  } catch (error) {
    console.error("Failed to query Notion for duplicates:", error);
    return false;
  }
}

export async function getPageText(pageId: string): Promise<string> {
  const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API}`,
      "Notion-Version": "2022-06-28",
    },
  });
  if (!response.ok) throw new Error("Failed to fetch page blocks");
  const data = await response.json();
  let text = "";
  for (const block of data.results) {
    if (block[block.type] && block[block.type].rich_text) {
      text += block[block.type].rich_text.map((t: any) => t.plain_text).join("") + "\n";
    }
  }
  return text.trim();
}

export async function getNewJobs(): Promise<any[]> {
  const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: {
        property: "Status",
        status: {
          equals: "New",
        },
      },
    }),
  });
  if (!response.ok) throw new Error("Failed to fetch new jobs");
  const data = await response.json();
  return data.results;
}

export async function updateJobStatus(pageId: string, statusText: string) {
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        Status: {
          status: {
            name: statusText,
          },
        },
      },
    }),
  });
}

export async function addJobComment(pageId: string, text: string) {
  await fetch(`https://api.notion.com/v1/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: {
        page_id: pageId,
      },
      rich_text: [
        {
          text: {
            content: text,
          },
        },
      ],
    }),
  });
}
