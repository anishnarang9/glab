-- Demo researchers — run after schema.sql
insert into researchers (name, email) values
  ('Alice Chen',    'alice@lab.demo'),
  ('Bob Okafor',    'bob@lab.demo'),
  ('Clara Mendez',  'clara@lab.demo'),
  ('David Kim',     'david@lab.demo')
on conflict (email) do nothing;

-- Default Central GBrain for the demo lab.
insert into brains (name, subject, mission)
values (
  'LabBrain',
  'research lab knowledge',
  'Maintain evidence-backed shared truth for the lab and record every meaningful update as a brain commit.'
)
on conflict (name) do update
set
  subject = excluded.subject,
  mission = excluded.mission;

insert into brain_sources (brain_id, kind, label, config, cadence)
select
  brains.id,
  'researcher_shared_artifacts',
  'Researcher shared artifacts',
  '{}'::jsonb,
  'manual'
from brains
where brains.name = 'LabBrain'
on conflict (brain_id, kind, label) do nothing;

insert into brain_sources (brain_id, kind, label, config, cadence)
select
  brains.id,
  'arxiv_query',
  'arXiv cs.LG',
  '{"query":"cat:cs.LG","max_results":25}'::jsonb,
  'daily'
from brains
where brains.name = 'LabBrain'
on conflict (brain_id, kind, label) do update
set
  config = excluded.config,
  cadence = excluded.cadence,
  enabled = true;

insert into openclaw_instances (brain_id, name, role, status, access_scope)
select
  brains.id,
  'Glab Head GBrain OpenClaw',
  'head_gbrain_operator',
  'active',
  '{"read":["brains","brain_sources","evidence_items","truth_claims","brain_commits"],"write":["ingestion_runs","openclaw_decisions","truth_revisions","truth_evidence_edges","brain_commits"]}'::jsonb
from brains
where brains.name = 'LabBrain'
on conflict (brain_id, name) do update
set
  role = excluded.role,
  status = excluded.status,
  access_scope = excluded.access_scope;
