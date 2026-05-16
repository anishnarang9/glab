# GTech Lab — Protocols and Standards

## Data Management

All raw data lives on the lab NAS (192.168.1.10, mount: /mnt/labnas). Directory structure:
```
/mnt/labnas/
  fmri/        ← Alice: raw BOLD, preprocessed, GLM outputs
  em/          ← Bob: raw EM tiles, segmentation volumes, meshes
  ephys/       ← Clara: raw NEV/NS6, sorted spikes, trial structure
  simulations/ ← David: model parameters, simulation outputs
  shared/      ← cross-project figures, manuscripts, meeting notes
```

**Backups:** NAS is mirrored nightly to AWS S3 (bucket: gtech-neuro-backup). Raw data is never deleted. Processed data can be re-derived from raw.

**Naming convention:** `YYYY-MM-DD_subjectID_task_version` for all experiment files.

## Code and Version Control

- All code on GitHub: github.com/gtech-neurolab (private org)
- Every project has its own repo; lab-wide utilities in `gtech-neurolab/labutils`
- Branch naming: `feature/description`, `analysis/description`, `fix/description`
- No force-push to main. PRs require one reviewer (can be any lab member).
- Analysis code must be reproducible: pin all dependencies, seed all RNGs, document compute environment in `environment.yml` or `requirements.txt`

## Lab Meetings

- **Weekly lab meeting:** Mondays 2–4 PM, EBB 3120. Rotating presenter. Format: 20 min talk + 40 min discussion. Slides due Sunday night.
- **Journal club:** Wednesdays 12–1 PM. One person presents a recent paper (posted Thursday prior). 
- **1:1 with PI:** Biweekly. Bring a written agenda. Notes taken by researcher and shared on Slack within 24h.
- **Cross-lab call with Churchland and Brunel groups:** First Friday of each month, 10 AM Pacific.

## Authorship and Publication

- Papers are discussed in lab meeting before submission. Every co-author reads the full draft.
- Preprints posted to bioRxiv simultaneously with journal submission.
- Code and data released on GitHub + Zenodo at time of publication (not after).
- PI handles all press inquiries. Do not post about unpublished results on social media.

## Equipment Access

| Equipment | Location | Booking |
|-----------|----------|---------|
| 7T MRI scanner | MRRC, Emory | Book via MRRC portal, 2 weeks advance |
| FIB-SEM | IEN cleanroom | Book with Bob; requires 8h minimum block |
| Utah array surgery suite | EBB 1040 | Clara schedules; 48h notice |
| HPC cluster (PACE-Phoenix) | Remote | Request allocation via PACE portal |

## Safety and Compliance

- All animal protocols approved under IACUC protocol A2024-0112
- Human subjects: IRB protocol H23-0447 (MRI) and H24-0091 (BCI)
- Annual lab safety training required for all members (schedule with lab manager)
- Any adverse event must be reported to PI within 1 hour
