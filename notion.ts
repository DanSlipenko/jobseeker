import { Client } from "@notionhq/client";
import { Job } from "./scraper";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

if (!process.env.NOTION_DB_ID) {
  throw new Error("NOTION_DB_ID is not defined");
}

export async function addJobToNotion(job: Job) {
  await notion.pages.create({
    parent: { database_id: process.env.NOTION_DB_ID },
    properties: {
      Name: {
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
        select: {
          name: "New",
        },
      },
      Link: {
        url: job.link || "",
      },
      Summary: {
        rich_text: [
          {
            text: {
              content: job.description?.slice(0, 200) || "",
            },
          },
        ],
      },
    },
  });
}
