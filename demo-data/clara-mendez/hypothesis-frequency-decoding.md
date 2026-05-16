---
type: hypothesis
tier: shared
owner: clara-mendez
title: "Hypothesis: jPCA rotation frequency encodes grasp type and is more drift-robust than trajectory endpoint"
---

# Hypothesis: Rotation Frequency as Drift-Robust Grasp Decoder

## Motivation
Found that different grasp types show different jPCA rotation frequencies (precision ~12Hz, power ~8Hz). Electrode drift changes the *direction* of neural trajectories but may preserve the *frequency* of rotation, because frequency is a property of the dynamics, not the absolute neural state.

## Hypothesis
A decoder based on jPCA rotation frequency will degrade less over days (without recalibration) than our current GRU decoder that uses trajectory shape.

## Experimental test
1. Train frequency-based decoder at day 0
2. Collect data from P1 over 5 consecutive days without recalibration
3. Compare accuracy decay: frequency decoder vs. current GRU

**Prediction:** frequency decoder shows <5% accuracy loss over 5 days; current GRU shows ~15-20% loss (based on our observed drift rate).

## Risk
If drift changes the oscillation structure (not just trajectory direction), frequency decoding will fail too. Need to run the control analysis first.

## David's input
He says his oscillatory dynamics model predicts rotation frequency is set by intrinsic membrane time constants, which are unaffected by electrode drift. That's the mechanistic support for this hypothesis.
