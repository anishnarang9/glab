---
type: note
tags: [analysis, code, research]
date: 2026-05-11
---

# Hyperalignment Analysis v4 — Notes

Third rewrite of the cross-subject alignment pipeline. Finally feel good about it.

## What changed from v3
- Fixed a subtle bug: was fitting the Procrustes rotation on the test set accidentally (data leakage). Cross-subject accuracy was inflated by ~8%. Current 67% is the real number.
- Switched from whole-brain ROI to LOC-only (1,847 voxels). Whole-brain was noisy and slower.
- Added bootstrap CI (n=1000 iterations, sample subjects with replacement): 67% ± 4.2%

## Pipeline summary
```
1. Per-subject: run GLM → beta estimates (50 conditions × n_voxels)
2. Per-subject: PCA to 50 dims (preserving 85% variance)
3. Across subjects: Procrustes rotation to shared template (leave-one-out)
4. Decoder: linear SVM trained on aligned betas, test on left-out subject
```

## Known issues
- Template choice matters — using the first subject as template is arbitrary. Should try Procrustes mean (iterative) as template. Will take 4x longer to run.
- 6-subject analysis (leaving S04, S07 out pending QC). When they're done, re-run.
- Haven't tried ridge regression instead of SVM. Might squeeze out a few more percent.

## Compute time
Full pipeline: ~2.5h on the lab cluster (8 cores). Fine for now.
