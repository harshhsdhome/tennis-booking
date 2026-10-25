INSERT INTO courts (name) VALUES
  ('Court 1'),
  ('Court 2'),
  ('Court 3')
ON CONFLICT (name) DO NOTHING;
