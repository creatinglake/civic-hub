// Seed a word cloud process with sample submissions for testing.
// Run: node --env-file=.env --import tsx scripts/seedWordcloud.ts

import { createProcess, executeAction } from "../src/services/processService.js";

const PROCESS_ID = "proc-wordcloud-test";

async function seed() {
  console.log("Creating word cloud process...");

  const process = await createProcess({
    id: PROCESS_ID,
    definition: { type: "civic.wordcloud", version: "0.1" },
    title: "What do you love about Floyd?",
    description: "Share what makes Floyd County special to you.",
    createdBy: "admin",
    state: {
      prompts: [
        { id: "p1", text: "In a few words, what do you love about Floyd?" },
      ],
      lifecycle_mode: "evergreen",
    },
  });

  console.log(`Created: ${process.id} (${process.status})`);

  // Activate it
  console.log("Activating...");
  await executeAction(process.id, {
    type: "process.activate",
    actor: "admin",
    payload: {},
  });
  console.log("Active!");

  // Submit sample responses
  const samples = [
    { actor: "user-1", text: "Mountains and music" },
    { actor: "user-2", text: "Small town community" },
    { actor: "user-3", text: "Beautiful mountains" },
    { actor: "user-4", text: "The community spirit" },
    { actor: "user-5", text: "Friday night jamboree" },
    { actor: "user-6", text: "Local farms and community" },
    { actor: "user-7", text: "Peace and quiet mountains" },
    { actor: "user-8", text: "Small town charm" },
    { actor: "user-9", text: "Blue Ridge mountains" },
    { actor: "user-10", text: "Friendly neighbors and community" },
    { actor: "user-11", text: "Nature and hiking trails" },
    { actor: "user-12", text: "Music heritage and traditions" },
    { actor: "user-13", text: "Farm to table food" },
    { actor: "user-14", text: "Stars at night" },
    { actor: "user-15", text: "Community events and gatherings" },
  ];

  for (const s of samples) {
    try {
      await executeAction(process.id, {
        type: "process.submit",
        actor: s.actor,
        payload: { prompt_id: "p1", text: s.text },
      });
      console.log(`  Submitted: "${s.text}" (${s.actor})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  Failed: "${s.text}" — ${msg}`);
    }
  }

  console.log(`\nDone! View at: http://localhost:5173/wordcloud/${PROCESS_ID}`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
