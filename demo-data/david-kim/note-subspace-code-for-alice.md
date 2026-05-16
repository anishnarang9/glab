---
type: note
tier: shared
owner: david-kim
title: "Subspace comparison code — sent to Alice for RSA analysis"
---

# Subspace Comparison Code — For Alice's RSA

Wrote and sent Alice the subspace angle comparison code we discussed. Documenting what it does here for my own reference.

## What the code does
Instead of comparing RDMs (pairwise distance matrices), this compares the *principal subspaces* of two representations directly.

Method: given two matrices X (n_stimuli × n_neural_dims) and Y (n_stimuli × n_model_dims):
1. Center both matrices
2. Compute SVD of X and Y separately → get principal components U_X, U_Y
3. Compute canonical correlation angles between the top-k subspaces of U_X and U_Y
4. Summary statistic: mean cosine of canonical angles (1 = identical subspaces, 0 = orthogonal)

## Why it's better than RDM correlation for Alice's question
RDM correlation: tells you if pairwise distances are similar (geometric similarity)
Subspace angle: tells you if the *axes of variation* are aligned (structural similarity)

For the CLIP vs. ImageNet comparison, the RDMs might be similar just because both models separate faces from objects. Subspace angle will reveal whether the actual dimensions of variation align — which is the more theoretically meaningful question.

## Code location
Sent as `subspace_comparison.py` — agent helped me clean it up and add docstrings before sending. Alice should be able to drop it into her analysis pipeline directly.

## What I expect to find
CLIP subspace will align better with IT cortex than ImageNet-ViT. The top dimensions of CLIP should correspond to semantic categories (faces, animals, vehicles), which is what IT is known to encode.
