---
type: note
tier: shared
owner: david-kim
title: "Meeting notes: Clara's rotational dynamics finding — theoretical interpretation"
---

# Meeting with Clara — Rotational Dynamics in M1

Clara showed me the jPCA results from P1. Rotational structure is clear. What's more interesting: different grasp types rotate at different frequencies (precision ~12Hz, power ~8Hz).

**My theoretical interpretation:**

In my oscillatory dynamics model, rotation frequency in a recurrent network is set by:
`ω = sqrt(J_E * J_I) - (g_E + g_I)/2τ`

where J are connection strengths and g are leak conductances. If different grasp types recruit different subpopulations with different E/I ratios, they'd naturally rotate at different frequencies.

**What this predicts:**
- Grasp types that recruit more PV+ inhibition should rotate faster (higher J_I)
- The frequency ratio (12/8 = 1.5) should correspond to the E/I ratio difference between recruited populations
- This is testable if Clara can classify which neurons are active during each grasp type

**The drift-robust decoding angle:**
Clara's hypothesis that rotation frequency is more stable than trajectory shape is consistent with my model — frequency is set by intrinsic network parameters (membrane time constants, connection strengths) that don't change with electrode drift. This is a strong theoretical prediction, not just an empirical hope.

**Action items for me:**
- Derive the frequency-E/I relationship analytically
- Send Clara the formula so she can check against her data
- Write this up as a theoretical prediction section for her BCI paper
