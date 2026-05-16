---
type: note
tier: shared
owner: alice-chen
title: "fMRIPrep surface recon failures — debugging session"
---

# fMRIPrep Surface Recon Failures

Two subjects (S04, S07) failing at the FreeSurfer surface reconstruction step. Error:

```
mris_make_surfaces: could not find ribbon.mgz
```

Spent ~2h debugging with agent. Root cause: T1w scan for S04 had a metal artifact from dental work that caused skull-stripping to fail silently — FreeSurfer proceeded with a bad brain mask.

**Fix applied:**
- Re-ran skull-stripping with ANTs instead of the default bet
- Manually edited the brain mask in ITK-SNAP for the worst slices
- Resubmitted fMRIPrep with `--skull-strip-fixed-seed`

S07 was different — a fieldmap file was named incorrectly in the BIDS structure (run-01 instead of run-1). One character. Four hours of my life.

**Lesson:** add a BIDS validator step to the preprocessing script before submitting to the cluster. Agent helped me write a pre-flight check script.

**Status:** both subjects now through surface recon, waiting on final output.
