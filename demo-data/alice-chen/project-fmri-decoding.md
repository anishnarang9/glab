---
type: project
tier: shared
owner: alice-chen
title: "High-res fMRI decoding of visual object categories"
---

# High-res fMRI Decoding — Visual Object Categories

## Goal
Decode which of 50 object categories a subject is viewing from 7T BOLD signals in ventral visual cortex (V1–LOC). Target: >85% top-1 accuracy on held-out subjects.

## Approach
Linear SVM on voxel beta estimates (GLM per run, fMRIPrep 23.1 preprocessing). Also running RSA to compare neural geometry against CLIP and ResNet-50 feature spaces.

## Status
- 8 subjects scanned, 6 preprocessed
- LOC decoder: 71% on 50-way (chance = 2%)
- RSA: strong alignment with CLIP mid-layers (r=0.61)

## Open questions
- Does cross-subject decoding hold? (testing next week)
- Which layers of CLIP best predict IT cortex — need to run full layer sweep
- FFA face responses are weirdly noise-robust, worth a separate analysis
