---
type: paper_ref
tier: shared
owner: clara-mendez
title: "Paper notes: Willett et al. 2023 — high-performance speech BCI"
---

# Paper Notes: Willett et al. 2023 — A High-Performance Speech Neuroprosthesis

**Citation:** Willett et al., Nature 2023

## Key result
62 words/minute with 23.8% word error rate, handwriting BCI at 90 characters/minute. Using same Utah array setup as ours but in speech/handwriting motor cortex.

## What they figured out that we should steal
1. **Population geometry matters more than single-unit decoding.** They use dimensionality reduction (t-SNE for visualization, PCA for decoding) aggressively. We're still doing channel-by-channel analysis for some parts of our pipeline — should fully commit to population-level.

2. **Calibration via imagined movement works.** They don't need actual movement for calibration (participant is paralyzed). For P2 (incomplete SCI), we're mixing actual and imagined — might be confusing the decoder.

3. **Day-to-day model drift:** their solution is continual learning with a small replay buffer. Very relevant to our drift problem.

## Differences from our work
- Speech/handwriting vs. hand grasps (different cortical regions, different dynamics)
- Their participant has more stable electrodes (shorter implant duration)
- They don't need real-time control in the same physical sense we do

## Action items
- Implement continual learning / replay buffer for drift — agent is drafting the code
- Test imagined-only calibration on P2 at next session
- Reach out to Willett group about sharing drift mitigation code
