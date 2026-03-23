import { Stagehand } from "@browserbasehq/stagehand";

async function run() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0] || (await stagehand.context.newPage());
  console.log("Has act?", typeof (page as any).act === "function");
  console.log("Has observe?", typeof (page as any).observe === "function");
  console.log("context has act?", typeof (stagehand.context as any).act);
  // are there other ways?
  console.log("stagehand page property:", typeof (stagehand as any).page);
  await stagehand.close();
}
run().catch(console.error);
