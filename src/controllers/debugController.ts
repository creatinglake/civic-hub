// Debug controller — creates sample data for testing
// NOT for production use. All actions go through normal business logic.

import { Request, Response } from "express";
import { createProcess, executeAction, clearProcesses } from "../services/processService.js";
import { clearEvents, getEventCount } from "../events/eventStore.js";

// --- Vote seed scenarios ---

const VOTE_SCENARIOS = [
  {
    process: {
      definition: { type: "civic.vote", version: "0.1" },
      title: "Should we build a community garden?",
      description: "Advisory vote on creating a new community garden in Riverside Park.",
      createdBy: "user:alice",
      state: { options: ["yes", "no", "abstain"] },
    },
    actions: [
      { type: "vote.submit", actor: "user:alice", payload: { option: "yes" } },
      { type: "vote.submit", actor: "user:bob", payload: { option: "yes" } },
      { type: "vote.submit", actor: "user:carol", payload: { option: "no" } },
      { type: "vote.submit", actor: "user:dave", payload: { option: "abstain" } },
      { type: "vote.submit", actor: "user:eve", payload: { option: "yes" } },
      { type: "vote.close", actor: "user:alice", payload: {} },
    ],
  },
  {
    process: {
      definition: { type: "civic.vote", version: "0.1" },
      title: "Approve budget allocation for park improvements?",
      description: "Vote to allocate $50,000 from the community fund for playground equipment and trail repairs.",
      createdBy: "user:bob",
      state: { options: ["approve", "reject", "abstain"] },
    },
    actions: [
      { type: "vote.submit", actor: "user:alice", payload: { option: "approve" } },
      { type: "vote.submit", actor: "user:carol", payload: { option: "approve" } },
      { type: "vote.submit", actor: "user:dave", payload: { option: "reject" } },
    ],
  },
  {
    process: {
      definition: { type: "civic.vote", version: "0.1" },
      title: "Change town hall meeting schedule?",
      description: "Should we move the monthly town hall from Tuesday evenings to Saturday mornings?",
      createdBy: "user:carol",
      state: { options: ["tuesday", "saturday", "no preference"] },
    },
    actions: [
      { type: "vote.submit", actor: "user:alice", payload: { option: "saturday" } },
      { type: "vote.submit", actor: "user:bob", payload: { option: "tuesday" } },
      { type: "vote.submit", actor: "user:dave", payload: { option: "saturday" } },
      { type: "vote.submit", actor: "user:eve", payload: { option: "no preference" } },
      { type: "vote.submit", actor: "user:frank", payload: { option: "saturday" } },
    ],
  },
];

// --- Proposal seed scenarios ---

const PROPOSAL_SCENARIOS = [
  {
    // This one will reach threshold (3 supporters) and auto-promote to a vote
    process: {
      definition: { type: "civic.proposal", version: "0.1" },
      title: "Install solar panels on community center",
      description: "Proposal to fund and install solar panels on the community center roof to reduce energy costs.",
      createdBy: "user:alice",
      state: { proposed_options: ["approve", "reject", "defer"], support_threshold: 3 },
    },
    actions: [
      { type: "proposal.support", actor: "user:bob", payload: {} },
      { type: "proposal.support", actor: "user:carol", payload: {} },
      { type: "proposal.support", actor: "user:dave", payload: {} }, // hits threshold → promotes to vote
    ],
  },
  {
    // This one stays open — not enough support yet
    process: {
      definition: { type: "civic.proposal", version: "0.1" },
      title: "Create a community bike-share program",
      description: "Proposal to establish a small bike-share program with 10 bikes at key locations around town.",
      createdBy: "user:eve",
      state: { proposed_options: ["yes", "no"], support_threshold: 5 },
    },
    actions: [
      { type: "proposal.support", actor: "user:alice", payload: {} },
      { type: "proposal.support", actor: "user:bob", payload: {} },
    ],
  },
];

export function handleSeed(_req: Request, res: Response): void {
  console.log("\n[seed] Clearing existing data...");
  clearProcesses();
  clearEvents();

  console.log("[seed] Seeding system...");

  const createdProcesses: Record<string, unknown>[] = [];

  // Seed votes
  for (const scenario of VOTE_SCENARIOS) {
    const process = createProcess(scenario.process);

    for (const action of scenario.actions) {
      executeAction(process.id, action);
    }

    createdProcesses.push({
      id: process.id,
      type: process.definition.type,
      title: process.title,
      status: process.status,
    });
  }

  // Seed proposals
  for (const scenario of PROPOSAL_SCENARIOS) {
    const process = createProcess(scenario.process);

    for (const action of scenario.actions) {
      executeAction(process.id, action);
    }

    createdProcesses.push({
      id: process.id,
      type: process.definition.type,
      title: process.title,
      status: process.status,
    });
  }

  const eventCount = getEventCount();

  console.log(`[seed] Created ${createdProcesses.length} processes, ${eventCount} events\n`);

  res.json({
    message: "Seed data created",
    processes: createdProcesses,
    event_count: eventCount,
  });
}
