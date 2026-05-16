// P3 — Anthropic client + streaming + JSON-mode helper for the judge
// Exports: streamChat(messages), judgeRelationship(paper, project)

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type Message = { role: "user" | "assistant"; content: string };

export function streamChat(messages: Message[]) {
  return client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages,
  });
}

export type RelationshipResult = {
  relationship: "validates" | "suggests_change" | "extends" | "scoops" | "orthogonal";
  rationale: string;
  confidence: number;
};

export async function judgeRelationship(
  paper: { title: string; abstract: string },
  project: { title: string | null; content: string }
): Promise<RelationshipResult> {
  const prompt = `You are evaluating whether a new research paper is relevant to an active project, and HOW. Output JSON with this shape:

{
  "relationship": "validates" | "suggests_change" | "extends" | "scoops" | "orthogonal",
  "rationale": "<1-2 sentence specific explanation>",
  "confidence": <0.0 to 1.0>
}

Definitions:
- validates: paper's findings support the project's hypothesis or methodology
- suggests_change: paper suggests a methodological or directional pivot
- extends: paper builds on the project's space; useful to read and cite
- scoops: paper appears to have done something very similar to the project's goal
- orthogonal: paper shares vocabulary but not substance; skip

PAPER:
Title: ${paper.title}
Abstract: ${paper.abstract}

PROJECT:
${project.title ?? "Untitled"}
${project.content}

Be specific in the rationale. Quote phrases. If unsure, lower confidence — do not default to "orthogonal".
Output only valid JSON, no markdown.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  try {
    return JSON.parse(text) as RelationshipResult;
  } catch {
    return { relationship: "orthogonal", rationale: "Could not parse judge response.", confidence: 0.1 };
  }
}
