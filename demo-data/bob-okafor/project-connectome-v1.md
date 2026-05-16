---
type: project
tier: shared
owner: bob-okafor
title: "Dense connectome reconstruction in mouse primary visual cortex"
---

# Dense Connectome Reconstruction — Mouse V1

## Goal
Map all synaptic connections in a 100µm³ volume of mouse V1 layer 4 using serial-section electron microscopy. Identify cell types, quantify E/I synapse ratios per cell type, and test whether connectivity patterns predict functional properties measured with calcium imaging.

## Pipeline
1. EM acquisition (Zeiss MultiSEM, 8nm/px XY)
2. Automated segmentation (CAVE + Flood-Filling Networks)
3. Synapse detection (SynapseNet v2)
4. Manual proofreading (FlyWire-style interface)
5. Functional correlation (matched 2P calcium imaging from same tissue block)

## Status
- Volume acquired: 90µm × 90µm × 80µm ✓
- Segmentation: 73% complete, ~2 weeks remaining
- Proofreading: 340 of ~800 cells proofread
- Functional matching: 67 cells matched to calcium traces so far

## Key question
Do excitatory neurons with higher in-degree (more inputs) show stronger orientation selectivity? Prior work suggests yes but never at dense connectome resolution.
