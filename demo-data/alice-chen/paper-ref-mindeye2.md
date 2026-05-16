---
type: paper_ref
tier: shared
owner: alice-chen
title: "Paper notes: MindEye2 (Scotti et al. 2024)"
---

# Paper Notes: MindEye2 — Shared-Subject Models Enable fMRI-to-Image Decoding

**Citation:** Scotti et al., 2024, NeurIPS

## Key idea
Train a CLIP-alignment model on fMRI→image reconstruction using a shared subject backbone + lightweight per-subject adapters. Single subject requires only 1h of scan time instead of 40h.

## Why relevant to our work
They're solving the same cross-subject generalization problem we're hitting. Their approach: learn a shared representation space across subjects, then fine-tune adapters per subject.

We could adapt this for our 50-way categorization task — instead of training a separate decoder per subject, learn a shared embedding and fine-tune.

## Numbers that matter
- 1-subject fine-tune: 94.2% retrieval accuracy (vs. 78.6% from scratch)
- Shared backbone trained on NSD dataset (8 subjects, 70k trials)

## Concerns
- NSD is way richer than our dataset (70k trials vs. ~2k per subject)
- Their task is retrieval, ours is classification — different difficulty profile
- Reconstruction quality is flashy but orthogonal to what we care about

## Action items
- Check if NSD betas are public and compatible with our ROI definitions
- Ask David if the RSA framework generalizes to their shared-subject setup
- Reach out to Scotti re: whether they've tried the 50-way classification variant
