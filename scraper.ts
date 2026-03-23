import { chromium } from "playwright";
import { addJobToNotion, checkIfJobExists } from "./notion";

export interface Job {
  title: string;
  company: string;
  location: string;
  link: string;
  salary: string;
  jobType: string;
  description?: string;
}

(async () => {
  // Connect to your running Chrome (must be started with debugging port)
  const browser = await chromium.connectOverCDP("http://localhost:9222");

  const context = browser.contexts()[0];
  const page = context.pages().find((p: any) => p.url().includes("indeed"));

  if (!page) {
    throw new Error("❌ No Indeed page found. Open Indeed first.");
  }
  console.log("🔍 Scraping job list...");

  // Get job list
  const jobs = await page.$$eval(".job_seen_beacon", (elements: any[]): Job[] =>
    elements.map((el) => {
      const title = el.querySelector("h2")?.textContent?.trim() || "";

      const link = el.querySelector("a")?.href || "";

      const company = el.querySelector('[data-testid="company-name"]')?.textContent?.trim() || "";

      const location = el.querySelector('[data-testid="text-location"]')?.textContent?.trim() || "";

      const metadata = Array.from(el.querySelectorAll('[data-testid*="attribute_snippet_testid"] span')).map(
        (span: any) => span.textContent?.trim() || "",
      );

      const salary = metadata.find((text) => text.includes("$")) || "";

      const jobTypes = ["Full-time", "Part-time", "Contract", "Temporary", "Internship"];
      const jobType = metadata.find((text) => jobTypes.some((t) => text.toLowerCase().includes(t.toLowerCase()))) || "";

      return { title, company, location, link, salary, jobType };
    }),
  );

  // Remove duplicates
  const uniqueJobs = Array.from(new Map<string, Job>(jobs.map((job: Job) => [job.link, job])).values());

  console.log(`📄 Found ${uniqueJobs.length} unique jobs`);

  const results = [];

  // Get job card elements (limit to 5)
  const jobCards = await page.$$(".job_seen_beacon");

  for (let i = 0; i < Math.min(jobCards.length, 5); i++) {
    const job = uniqueJobs[i];

    console.log(`➡️ Checking if already exists: ${job.title}`);
    const exists = await checkIfJobExists(job.link);
    if (exists) {
      console.log(`⏩ Skipping (Already in Notion): ${job.title}`);
      continue;
    }

    console.log(`➡️ Clicking & Scraping: ${job.title}`);

    try {
      // Click the card to load the right panel
      await jobCards[i].click();

      // Wait for the right panel description to update
      await page.waitForSelector("#jobDescriptionText", { timeout: 8000 });

      // Small buffer to let content fully render
      await page.waitForTimeout(1000);

      // Extract description from right panel
      const description = await page.$eval("#jobDescriptionText", (el: any) => el.innerText).catch(() => "");

      const fullJob = {
        ...job,
        description: description.trim(),
      };

      await addJobToNotion(fullJob);
      await new Promise((r) => setTimeout(r, 300));

      results.push(fullJob);

      console.log("✅ Collected:", fullJob.title);
    } catch (err) {
      console.log("❌ Failed:", job?.title);
    }
  }

  console.log("\n🎉 FINAL RESULTS:\n");
  console.log(JSON.stringify(results, null, 2));
})();
