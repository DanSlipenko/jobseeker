import { Stagehand } from "@browserbasehq/stagehand";
import { getFilteredJobs } from "./notion";
import fs from "fs";
import "dotenv/config";

export async function applyToFilteredJobs() {
  console.log("Fetching 'Filtered' jobs from Notion...");
  const jobs = await getFilteredJobs();

  if (jobs.length === 0) {
    console.log("No 'Filtered' jobs found.");
    return;
  }

  console.log(`Found ${jobs.length} filtered jobs. Loading candidate profile...`);

  let profile: any = {};
  if (fs.existsSync("./candidate-profile.json")) {
    profile = JSON.parse(fs.readFileSync("./candidate-profile.json", "utf-8"));
  } else {
    console.log("⚠️ No candidate-profile.json found. The AI might not know your details!");
  }

  // Initialize Stagehand
  // NOTE: This uses OPENAI_API_KEY from your .env by default.
  // To use "Open Claw" (Claude), you can configure it like:
  // const stagehand = new Stagehand({ env: "LOCAL", modelName: "claude-3-5-sonnet-latest", modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY } });

  console.log("Starting Stagehand (connecting to your running Chrome)...");

  // Get the WebSocket debugger URL from Chrome's CDP endpoint
  const versionRes = await fetch("http://localhost:9222/json/version");
  const versionData = (await versionRes.json()) as any;
  const wsUrl = versionData.webSocketDebuggerUrl;
  console.log("🔗 Connecting via:", wsUrl);

  const stagehand = new Stagehand({
    env: "LOCAL",
    model: "openai/gpt-4o",
    localBrowserLaunchOptions: {
      cdpUrl: wsUrl,
    },
  });

  await stagehand.init();
  // Open a new tab in the existing browser
  const page = await stagehand.context.newPage();

  for (const job of jobs) {
    // Debug: log actual property keys for the first job
    if (jobs.indexOf(job) === 0) {
      console.log("📋 Notion property keys:", Object.keys(job.properties || {}));
    }
    const titleObj = job.properties?.["Project name"];
    const title = titleObj?.title?.[0]?.plain_text || "Unknown Title";
    const linkUrl = job.properties?.Link?.url;

    if (!linkUrl) {
      console.log(`⏩ Skipping ${title}: No link found.`);
      continue;
    }

    console.log(`\n➡️ Opening page for: ${title}`);
    try {
      await page.goto(linkUrl);
      await page.waitForLoadState("domcontentloaded");

      console.log(`✅ Loaded ${title}. Instructing AI to click 'Apply'...`);

      // Step 1: Click the Apply button
      await stagehand.act('Click the "Apply Now" or "Apply on company site" button.');

      // Wait for the application page to load
      await page.waitForLoadState("domcontentloaded");
      await new Promise((r) => setTimeout(r, 2000));

      // Step 2: Upload files programmatically (AI can't interact with OS file dialogs)
      console.log("📎 Looking for file upload fields...");
      const fileInputInfo = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
        return inputs.map((input) => ({
          accept: input.getAttribute("accept") || "",
          name: input.getAttribute("name") || "",
          id: input.getAttribute("id") || "",
        }));
      });

      if (fileInputInfo.length > 0) {
        for (let i = 0; i < fileInputInfo.length; i++) {
          const info = fileInputInfo[i];
          const label = (info.name + info.id + info.accept).toLowerCase();

          let filePath = "";
          if (label.includes("resume") || label.includes("cv")) {
            filePath = profile.personal_info?.resume_full_path || "";
          } else if (label.includes("cover") || label.includes("letter")) {
            filePath = profile.personal_info?.cover_letter_full_path || "";
          } else if (label.includes("photo") || label.includes("image") || label.includes("picture")) {
            filePath = profile.personal_info?.photo_full_path || "";
          } else if (info.accept.includes("pdf") || info.accept.includes("doc")) {
            filePath = profile.personal_info?.resume_full_path || "";
          }

          if (filePath && fs.existsSync(filePath)) {
            try {
              await page.locator(`input[type="file"]`).nth(i).setInputFiles(filePath);
              console.log(`  ✅ Uploaded: ${filePath}`);
            } catch (e: any) {
              console.log(`  ⚠️ Failed to upload ${filePath}: ${e.message}`);
            }
          }
        }
      } else {
        console.log("  ℹ️ No file upload fields found on this page.");
      }

      // Step 3: Fill out text fields
      console.log("🧠 Instructing AI to fill out the application...");
      await stagehand.act(`
        Please fill out all text fields in this job application form using the following candidate information:
        ${JSON.stringify(profile)}
        
        Do NOT click any file upload buttons - files have already been uploaded.
        Fill in text fields, select dropdowns, and check required checkboxes.
      `);

      // Step 4: Submit
      console.log("📤 Submitting application...");
      await stagehand.act('Click the "Submit Application" or "Submit" button to submit the form.');

      console.log(`🎉 Successfully handled application for ${title}!`);

      // Wait a moment between jobs
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err: any) {
      console.log(`❌ Failed navigating to or applying for ${title}:`, err.message);
    }
  }

  console.log("\n🎉 Finished processing filtered jobs.");
  await stagehand.close();
}

(async () => {
  await applyToFilteredJobs();
})();
