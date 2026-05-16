---
type: note
tier: shared
owner: alice-chen
title: "Meeting notes: RSA framework discussion with David"
---

# Meeting with David Kim — RSA Framework

Quick 30-min sync today. Main takeaways:

**On our current RSA approach:**
David pointed out we're computing Pearson correlation on the upper triangle of the RDM, which treats all pairwise distances as independent. They're not — shared items create dependencies. Should use Mantel test with permutation instead, or at least report both.

**On comparing models:**
He suggested using a partial RSA (noise ceiling regression) to account for measurement noise before comparing models. Otherwise we'll underestimate how good CLIP is just because the neural data is noisy.

**New idea from David:**
What if we look at the *geometry* of the representations, not just pairwise distances? He has a framework for comparing principal angles between subspaces that might be more sensitive than RDM correlation. He's going to send me the code.

**Action items for me:**
- Re-run RSA with Mantel test
- Compute noise ceiling on our dataset
- Try David's subspace angle method once he sends the code

**Action items for David:**
- Send subspace comparison code
- Think about whether his mean-field theory predicts anything about the structure of IT representations
