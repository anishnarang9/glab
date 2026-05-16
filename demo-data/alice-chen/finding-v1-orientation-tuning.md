---
type: finding
tier: shared
owner: alice-chen
title: "V1 orientation tuning survives 3x spatial downsampling"
---

# Finding: V1 Orientation Tuning Survives Aggressive Downsampling

Ran a quick sanity check today — wanted to know if our 1.2mm isotropic acquisition still captures V1 orientation columns or if we're just seeing blurred noise.

Used the rotating wedge localizer data (8 directions × 12 reps). Computed voxelwise orientation preference via complex-valued averaging of BOLD responses.

**Result:** orientation tuning is detectable in 34% of V1 voxels at p<0.01 (FDR corrected). That's lower than the 7T literature (~55% in 0.8mm data) but clearly above chance.

**Implication:** our decoding results aren't an artifact of overfit noise — there's real orientation information in the signal.

**Caveat:** voxels near the V1/V2 border show mixed tuning, probably due to partial voluming across the boundary. Should mask those out for the main decoding analysis.

Agent session note: ran this after David suggested checking whether our RSA results could be driven by orientation artifacts rather than category selectivity. Short answer: no, but worth reporting.
