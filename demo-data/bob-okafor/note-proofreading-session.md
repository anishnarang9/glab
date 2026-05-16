---
type: note
tier: shared
owner: bob-okafor
title: "Proofreading workflow — agent-assisted merge/split error correction"
---

# Agent-Assisted Proofreading Session

Spent today working with the agent to triage merge and split errors in the segmentation.

**Workflow we landed on:**
1. Agent flags likely errors using a shape-irregularity heuristic (long thin protrusions that cross cell boundaries = likely merge error)
2. I review flagged segments in Neuroglancer and classify: confirm error / false positive
3. Agent queues confirmed errors for the proofreading interface

**Stats from today:**
- 847 segments flagged by heuristic
- I reviewed 203 (2.5h of work)
- 141 confirmed merge errors, 62 false positives (70% precision)
- 38 split errors caught separately via orphan axon detection

**Bottleneck:** the heuristic generates too many false positives in the neuropil-dense regions near layer 4/5 border. Agent suggested training a small classifier on my accept/reject decisions — going to try that tomorrow.

**Estimated time to finish proofreading at current rate:** 3 more weeks. Need to go faster. Considering recruiting one undergrad to help.
