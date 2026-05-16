-- Demo researchers — run after schema.sql
insert into researchers (name, email) values
  ('Alice Chen',    'alice@lab.demo'),
  ('Bob Okafor',    'bob@lab.demo'),
  ('Clara Mendez',  'clara@lab.demo'),
  ('David Kim',     'david@lab.demo')
on conflict (email) do nothing;
