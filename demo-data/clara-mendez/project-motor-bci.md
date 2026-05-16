---
type: project
tier: shared
owner: clara-mendez
title: "Intracortical BCI for restoring motor function in cervical spinal cord injury"
---

# Intracortical BCI — Cervical SCI

## Goal
Decode intended hand/wrist movements from Utah array recordings in M1 (hand knob area) in two human participants with cervical spinal cord injury. Control a robotic hand in real-time with <150ms latency.

## Participants
- P1: C5 complete SCI, implanted 14 months ago, 96-channel array in left M1
- P2: C6 incomplete SCI, implanted 3 months ago, 96-channel array + 48-channel in PMd

## Decoder
RNN (GRU-based) trained on attempted movement data. Retrained daily with 5 minutes of calibration. Currently hitting 7 of 8 grasp types reliably in offline evaluation.

## Current performance
- P1 online: 6/8 grasp types, 82% accuracy, 140ms latency
- P2 online: data collection phase, not yet decoding

## Key challenge
Signal drift — electrode impedance changes day to day, causing the decoder to fail without daily recalibration. Working on a domain adaptation approach to reduce calibration burden.

## Collaboration
Alice (neural geometry analysis of population activity during movement prep), David (rotational dynamics framework for movement generation)
