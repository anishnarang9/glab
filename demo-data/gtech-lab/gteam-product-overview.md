# GTeam — Product Overview

## What is GTeam?

GTeam is the shared brain for GTech Neuroscience Lab. It connects every researcher's personal knowledge base into one searchable, always-current lab brain — so the whole team can find anything, new hires can onboard in minutes, and no one loses a week to something a teammate already figured out.

## The Problem We Solve

Researchers are brilliant at generating knowledge. They are terrible at sharing it. Notes live on laptops. Papers get read and forgotten. Findings from one project never reach the person who needs them on another. When someone new joins the lab, they spend months piecing together context that already exists — just scattered across four people's hard drives.

GTeam fixes this.

## How It Works

### Step 1 — Personal GBrains
Every researcher in the lab has a personal GBrain: an AI assistant (powered by the GBrain/OpenClaw stack) that follows them as they work and captures everything they do — notes from experiments, papers they read, hypotheses they form, findings they record — all as markdown files stored locally.

### Step 2 — Selective Pull
GTeam reads each researcher's personal GBrain and uses semantic AI to filter out the noise. Personal files (grocery lists, travel plans, random notes) stay private. Lab-relevant work — experiment logs, findings, project notes, paper references — gets promoted into the central shared database. Researchers can also manually tag files as shared.

### Step 3 — Paper Agents
Every night, GTeam's agents scan the publication pages of leading neuroscience labs (Kanwisher, DiCarlo, Churchland, Seung, Shenoy, Brunel, and others) for new papers. Each paper is matched to the relevant researcher's active projects using vector similarity and an LLM judge that labels the relationship: validates, suggests_change, extends, scoops, or orthogonal.

### Step 4 — The Shared Brain
The result is a single, searchable, always-updated knowledge base for the lab. It contains:
- Every researcher's shared notes, findings, projects, and hypotheses
- GTech Lab's mission, protocols, and active project status
- A curated feed of new papers matched to each researcher

## What You Can Do With It

**Onboard instantly.** A new researcher can ask GTeam anything: "What is Alice working on?", "What methods does the lab use for fMRI preprocessing?", "Who should I talk to about connectomics?" — and get a rich, accurate answer drawn from the whole team's knowledge.

**Stay current without drowning.** Each researcher gets a daily digest of new papers from the field, annotated with exactly how each paper relates to their active work. No more missing the paper that scoops your project.

**See what the team is building.** The team dashboard shows every researcher's active projects, latest findings, and current blockers — updated automatically as their GBrain captures new work.

## Who Is In the Lab

- **Alice Chen** — fMRI, visual cortex, neural decoding, CLIP alignment
- **Bob Okafor** — connectomics, electron microscopy, synaptic circuit mapping
- **Clara Mendez** — motor BCI, Utah array recording, rotational population dynamics
- **David Kim** — computational theory, mean-field models, criticality, oscillations

## Tech Stack

GTeam is built on TypeScript, Bun, Next.js, and Supabase with pgvector. Embeddings use Voyage AI (voyage-3-lite, 1024 dimensions). The LLM layer runs on Anthropic Claude for onboarding Q&A and paper-to-project relationship judgment. Paper scraping uses The Hog web scraper API. Email digests are delivered via Resend.

## Current Status

GTeam is a working prototype built for GTech Neuroscience Lab. The central database contains shared artifacts from all four researchers, five GTech Lab institutional documents, and a growing corpus of papers from leading neuroscience labs. The onboarding Q&A, team dashboard, and paper matching pipeline are all live.
