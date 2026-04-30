// Athens (fictional) seed data — Slice 19b.
//
// Mirrors the structure of seedData.ts but populated with content for
// the fictional "Town of Athens, Virginia" used by the public demo
// deployment (demo-hub.civic.social). Same civic issues as Floyd's
// seed because the topics (waste disposal, surveillance cameras) are
// nationally relevant — only the jurisdictional and governance
// terminology change.
//
// Selected at runtime via CIVIC_SEED_FIXTURE=athens. Floyd remains
// the default so production behavior is unchanged.

import type { SeedScenario } from "./seedData.js";

// --- Athens Green Box Dumpster Sites (active vote) ---

export const ATHENS_GREEN_BOX: SeedScenario = {
  process: {
    id: "proc_greenbox_athens_001",
    definition: { type: "civic.vote", version: "0.1" },
    title: "Add More Secure Dumpster (Green Box) Sites",
    description:
      "Should the town of Athens invest in building additional fenced-in dumpster (green box) sites to improve access and reduce wildlife interference?",
    createdBy: "user:civic-admin",
    jurisdiction: "us-va-athens",
    state: {
      options: [
        "Yes \u2014 build additional fenced-in dumpster sites in key areas",
        "No \u2014 maintain current number and locations",
        "Unsure / need more information",
      ],
      support_threshold: 3,
      voting_duration_ms: 14 * 24 * 60 * 60 * 1000,
      activation_mode: "direct",
    },
    content: {
      core_question:
        "Should the town of Athens invest in building additional fenced-in dumpster (green box) sites to improve access and reduce wildlife interference?",
      sections: [
        {
          title: "Background",
          body: [
            "Athens residents rely on green box dumpster sites for waste disposal. In recent years, bears and other wildlife have increasingly accessed these dumpsters, creating mess, safety concerns, and additional maintenance costs.",
            "The town has built a fenced-in dumpster facility on Main Street that has significantly reduced wildlife access and improved cleanliness. However, for many residents, this location is not convenient, requiring longer travel times for regular waste disposal.",
            "Expanding secure, fenced-in dumpster sites across the town could improve accessibility while also addressing wildlife-related issues.",
          ],
        },
        {
          title: "Key considerations",
          body: [
            "Accessibility: Are current dumpster locations convenient for most residents?",
            "Wildlife impact: Do fenced-in sites meaningfully reduce bear interference?",
            "Cost: What is the cost of building and maintaining additional sites?",
            "Land use: Where would new sites be located?",
          ],
        },
        {
          title: "Potential locations (examples)",
          body: [
            "North Athens",
            "Near the historic district",
            "Additional site on the south end of town",
            "Near the town park entrance",
          ],
        },
        {
          title: "What your vote means",
          body: [
            "This vote provides a community signal to town officials about whether residents support expanding secure dumpster infrastructure.",
            "Results are advisory but intended to reflect the preferences of participating Athens residents.",
          ],
        },
      ],
      key_tradeoff:
        "Improved access and wildlife management vs. cost of new infrastructure",
      links: [],
      community_input: {
        prompt:
          "Do you have suggestions for locations, concerns, or alternatives?",
        label:
          "Optional: Share your thoughts (does not affect vote results)",
      },
      after_vote: {
        body: "This vote is advisory and does not directly determine policy. The goal is to provide a clear signal of community sentiment to town officials.",
        recipients: ["Athens Town Council"],
      },
    },
  },
  actions: [
    { type: "process.activate", actor: "user:civic-admin", payload: {} },
  ],
  inputs: [],
};

// --- Athens Flock Camera Issue (gathering-support proposal) ---

export const ATHENS_FLOCK_CAMERA: SeedScenario = {
  process: {
    id: "proc_flockcam_athens_001",
    definition: { type: "civic.vote", version: "0.1" },
    title: "Athens Flock Camera Use",
    description:
      "Should the town of Athens continue using Flock Safety license plate reader cameras?",
    createdBy: "user:civic-admin",
    jurisdiction: "us-va-athens",
    state: {
      options: [
        "Yes \u2014 continue using the cameras",
        "No \u2014 remove the cameras",
      ],
      support_threshold: 5,
      voting_duration_ms: 7 * 24 * 60 * 60 * 1000,
      activation_mode: "proposal_required",
    },
    content: {
      core_question:
        "Should the town of Athens continue using Flock Safety license plate reader cameras?",
      sections: [
        {
          title: "What are Flock cameras?",
          body: [
            "Flock Safety cameras are automated license plate readers (ALPRs) used by law enforcement to:",
            "Capture images of license plates",
            "Compare plates against databases (e.g. stolen vehicles, warrants)",
            "Assist in investigations",
            "They do not continuously record video, but they do capture license plate numbers, timestamps, and location data.",
          ],
        },
        {
          title: "Why are they used?",
          body: [
            "Supporters argue they:",
            "Help solve crimes (especially stolen vehicles)",
            "Provide useful investigative leads",
            "Extend law enforcement capabilities without constant patrol presence",
          ],
        },
        {
          title: "Concerns raised",
          body: [
            "Critics argue they:",
            "Create a form of ongoing surveillance",
            "Collect data on residents who are not suspected of wrongdoing",
            "May lack sufficient transparency or oversight",
            "Raise privacy and civil liberties concerns",
          ],
        },
        {
          title: "Local context",
          body: [
            "Flock cameras are typically deployed in coordination with local law enforcement.",
            "In Athens, their continued use would likely depend on decisions made by the Athens Police Department and the Town Council.",
            "This vote is intended to understand community sentiment and does not directly determine policy.",
          ],
        },
      ],
      key_tradeoff: "Public safety vs. privacy",
      links: [
        {
          label: "Flock Safety website",
          url: "https://www.flocksafety.com/",
        },
        {
          label: "ACLU: Automated License Plate Readers",
          url: "https://www.aclu.org/issues/privacy-technology/location-tracking/automated-license-plate-readers-alprs",
        },
        {
          label: "EFF: ALPR overview",
          url: "https://www.eff.org/pages/automated-license-plate-readers-alpr",
        },
      ],
      community_input: {
        prompt: "What concerns you most about this issue?",
        label:
          "Optional: Share your perspective (does not affect vote results)",
      },
      after_vote: {
        body: "The goal is to provide a clear signal of community sentiment between elections. This vote is advisory and does not directly determine policy.",
        recipients: ["Athens Town Council", "Athens Police Department"],
      },
    },
  },
  actions: [
    { type: "process.propose", actor: "user:civic-admin", payload: {} },
    { type: "process.support", actor: "user:athens-resident-1", payload: {} },
    { type: "process.support", actor: "user:athens-resident-2", payload: {} },
    { type: "process.support", actor: "user:athens-resident-3", payload: {} },
  ],
  inputs: [
    {
      author_id: "user:athens-resident-1",
      body: "I'm worried about the data retention policies. How long are plate images stored, and who has access?",
    },
    {
      author_id: "user:athens-resident-4",
      body: "These cameras helped recover my neighbor's stolen truck last year. They work.",
    },
    {
      author_id: "user:athens-resident-2",
      body: "I don't think most people even know these exist. We need more transparency before making a decision.",
    },
  ],
};
