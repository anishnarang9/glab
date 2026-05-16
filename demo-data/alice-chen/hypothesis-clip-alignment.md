---
type: hypothesis
tier: shared
owner: alice-chen
title: "Hypothesis: IT cortex geometry matches CLIP text-image joint space, not vision-only models"
---

# Hypothesis: IT Alignment is Specific to Multimodal CLIP, Not Generic Vision

## Background
Our RSA shows IT cortex RDMs correlate with CLIP mid-layer representations (r=0.61). But we haven't tested whether this is specific to CLIP's multimodal training or whether any large vision model would show the same.

## Hypothesis
The alignment between IT cortex and CLIP is specifically driven by CLIP's joint text-image training objective, not just scale or architecture. A vision-only ViT of equivalent size trained on ImageNet-21k will show significantly weaker alignment.

## Prediction
- CLIP ViT-L/14: r > 0.55 with IT RDMs
- ImageNet ViT-L/14 (same architecture, no language): r < 0.40
- DINO ViT-L (self-supervised, no labels): somewhere in between

## Test plan
1. Extract features from CLIP, ImageNet-ViT, DINO at matched layers
2. Compute pairwise RSA with our 50-category neural RDMs
3. Bootstrap confidence intervals on the difference

## Why it matters
If true: language grounding is what makes CLIP-like models match human visual representations. Supports theories of concept-level coding in IT (not just visual features).

If false: it's just scale/architecture, and our decoding results say nothing special about language.

Discussed with David — he thinks it'll be partially true, with DINO as the interesting middle case.
