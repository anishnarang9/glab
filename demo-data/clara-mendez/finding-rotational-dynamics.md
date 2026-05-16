---
type: finding
tier: shared
owner: clara-mendez
title: "Rotational dynamics present in M1 population during movement preparation"
---

# Finding: Rotational Dynamics in M1 During Movement Prep

Ran jPCA on P1's movement preparation data (200ms pre-movement window, 8 conditions). 

**Result:** first two jPCA planes explain 67% of variance in the time-varying neural trajectory. The rotational structure is clearly present. R² for best-fit skew-symmetric matrix: 0.71.

This replicates Churchland et al. 2012 (monkey M1) in a human BCI participant, which is not obvious — the SCI changes the functional organization of M1 in ways we don't fully understand.

**What's interesting:** the rotation frequency differs across grasp types. Precision grip rotates at ~12 Hz; power grasp at ~8 Hz. Is the frequency carrying information about movement parameters?

**Told David** — he got very excited. Says this is consistent with his oscillatory dynamics model and wants to collaborate on a mechanistic explanation.

**For the BCI:** if rotational frequency encodes grasp type, we could decode from the frequency rather than the trajectory endpoint, which might be more robust to day-to-day drift. Will test this hypothesis next session.
