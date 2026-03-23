import "dotenv/config";
import { getNewJobs, getPageText, updateJobStatus, addJobComment } from "./notion";

const REQUIREMENTS_PAGE_ID = "32b78a62-0343-8053-83ca-ed034507008a";

async function analyzeJob(title: string, description: string, requirements: string) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEP_SEEK}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: `You are an expert technical recruiter filtering job postings for a candidate.\n\nHere are the candidate's firm requirements and criteria:\n\n${requirements}\n\nAnalyze the provided job title and description. You MUST return a JSON object with two properties:\n1. "fit": a boolean (true if it meets the criteria, false if it is Filtered out).\n2. "reasons": an array of strings listing the specific reasons why it did not meet the criteria (leave empty if it's a fit).`,
        },
        {
          role: "user",
          content: `Job Title: ${title}\n\nJob Description:\n${description}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error: ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}

(async () => {
  console.log("Fetching requirements from Notion...");
  const requirements = await getPageText(REQUIREMENTS_PAGE_ID);
  
  if (!requirements) {
    console.error("Could not load requirements from Notion. Exiting.");
    process.exit(1);
  }

  console.log("Fetching 'New' jobs from Notion...");
  const jobs = await getNewJobs();
  
  if (jobs.length === 0) {
    console.log("No 'New' jobs found.");
    return;
  }

  console.log(`Found ${jobs.length} new jobs to analyze.`);

  for (const job of jobs) {
    const pageId = job.id;
    // Safely extract the title from the Notion page properties
    const titleObj = job.properties?.title || job.properties?.Name;
    const title = titleObj?.title?.[0]?.plain_text || "Unknown Title";

    console.log(`\nAnalyzing: ${title}...`);
    
    try {
      const description = await getPageText(pageId);
      if (!description) {
        console.log(`⏩ Skipping ${title}: No description found.`);
        continue;
      }
      
      const result = await analyzeJob(title, description, requirements);
      
      if (result.fit) {
        console.log(`✅ MATCH! Updating status to 'Filtered'`);
        await updateJobStatus(pageId, "Filtered");
      } else {
        console.log(`❌ REJECTED! Updating status to 'Filtered out'`);
        await updateJobStatus(pageId, "Filtered out");
        
        if (result.reasons && result.reasons.length > 0) {
          const commentText = `Failed Criteria:\n- ${result.reasons.join("\n- ")}`;
          await addJobComment(pageId, commentText);
          console.log(`   Added rejection reasons as a comment.`);
        }
      }
      
      // Sleep slightly to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));
    } catch (err: any) {
      console.error(`Error processing job ${title}: ${err.message}`);
    }
  }
  
  console.log("\n🎉 Finished analyzing all new jobs!");
})();
