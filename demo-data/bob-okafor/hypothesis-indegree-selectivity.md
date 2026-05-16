---
type: hypothesis
tier: shared
owner: bob-okafor
title: "Hypothesis: in-degree predicts orientation selectivity in L4 spiny stellate cells"
---

# Hypothesis: Higher In-Degree → Sharper Orientation Tuning

## Background
We have 67 cells with matched structural (connectome) + functional (calcium imaging) data. Enough to test some structure-function hypotheses.

## Hypothesis
L4 spiny stellate cells with more total synaptic inputs (higher in-degree) will show sharper orientation selectivity (lower circular variance of tuning curves), because more convergent input allows better signal averaging and lateral inhibition.

## Prediction
Pearson r between in-degree and 1-circular_variance > 0.3 (p < 0.05) across the 67 matched cells.

## Counter-prediction (null)
In-degree is determined by cell body size (bigger cells = more surface = more synapses) and doesn't reflect functional organization. Correlation ≈ 0.

## Test
Already have the data. Just need to run the correlation. Agent is pulling the in-degree values now.

## Prior work
Scholl et al. 2021 (cat V1, light microscopy) found r≈0.25. We expect to replicate or exceed this with better data.
