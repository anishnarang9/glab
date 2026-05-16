---
type: paper_ref
tier: shared
owner: david-kim
title: "Paper notes: Brunel 2000 — dynamics of sparsely connected networks"
---

# Paper Notes: Brunel (2000) — Dynamics of Sparsely Connected Networks of Excitatory and Inhibitory Spiking Neurons

**Citation:** Brunel N. (2000) Journal of Computational Neuroscience

## Why it's foundational
The Brunel 2000 paper analytically derives the phase diagram of a random recurrent spiking network — showing 4 regimes: synchronous regular, asynchronous irregular, synchronous irregular, and fast oscillations. Every mean-field cortical model since references this.

## What's relevant to our work
Their asynchronous irregular (AI) regime is where most cortex is thought to operate in vivo. But the transition between AI and synchronous irregular (SI) is exactly where I think we should look for signatures of criticality.

The key parameter is `g = J_I / J_E` (relative inhibitory vs. excitatory coupling strength). 

Using Bob's measured E/I ratios:
- Spiny stellate: g ≈ 0.24 (well inside AI regime)
- PV+ interneurons: g ≈ 0.53 (suspiciously close to the AI/SI boundary at g≈0.5)

**This is potentially a big deal.** If PV+ interneurons in L4 are operating near the AI/SI transition, small perturbations could flip the network into a synchronous state. This could explain context-dependent gamma oscillations.

## What the paper doesn't address
- Structured connectivity (assumes random — Bob's data shows it's not)
- Adaptive currents (important for burst dynamics)
- Multiple layers (only considers one homogeneous population)

## Plan
Extend Brunel framework to include structured connectivity (from Bob's adjacency matrix) and test whether the transition point shifts.
