---
type: note
tags: [paper, research, reading]
date: 2026-05-10
---

# Paper Notes: Contrastive Learning of Neural Representations (Schneider et al. 2025)

arxiv: 2501.XXXXX

## Core idea
Apply contrastive learning (InfoNCE loss) to neural population recordings — treat recordings of the same stimulus across different sessions as "positive pairs" and different stimuli as "negatives." Learns a session-invariant representation.

## Why I care
This is basically solving the drift/alignment problem we have, but from a representation learning angle rather than the Procrustes/hyperalignment angle I've been using.

## Results
- They show session-invariant embeddings for mouse V1 calcium imaging
- Cross-session classification improves from 58% → 84% with their method
- Works even when electrode positions shift significantly

## Concerns
- Mouse V1 calcium imaging → human fMRI is a big jump (different noise structure, much lower temporal resolution)
- Their "sessions" are same-day repeats; ours are across-week with hardware drift
- They use 10x more training data than we have

## What I want to try
Adapt their loss function to fMRI. Positive pairs = same stimulus, same subject, different runs. See if we can learn a run-invariant embedding within-subject first, then try across subjects.

Could combine with David's subspace framework — contrastive loss to learn the shared subspace instead of Procrustes.

Action: email first author, ask if they tried cross-subject.
