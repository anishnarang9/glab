---
type: note
tags: [lab, meeting, research]
date: 2026-05-12
---

# Lab Meeting Prep — May 12

Presenting the cross-subject decoding results for the first time. Need to keep it to 15 min + questions.

## Slide outline
1. Motivation (30 sec) — why cross-subject matters for clinical translation
2. Dataset recap (1 min) — 8 subjects, 50 categories, 7T
3. Within-subject results (2 min) — 71% in LOC, the V1 orientation sanity check
4. Cross-subject attempt 1 (3 min) — direct transfer fails (43%)
5. Shared subspace approach (4 min) — hyperalignment, 67% after alignment
6. CLIP alignment (2 min) — r=0.61, the multimodal hypothesis
7. Next steps (1 min)

## Potential tough questions
- "Why not use NSD?" → our stimuli are controlled for low-level features in a way NSD isn't
- "Is hyperalignment just PCA?" → no, it's Procrustes rotation in a shared space, mathematically different
- "What's the ceiling?" → noise ceiling is ~79%, we're at 67% aligned, there's room

## Things to not say
Don't oversell the CLIP result — it's correlational, not causal. David will call it out if I do.
