begin;

insert into private.vehicle_templates
  (id, maker, model, segment, market_value, year_min, year_max, mileage_min, mileage_max, market_tier)
values
  ('308-ii', 'Peugeot', '308 II', 'Compacte', 15100, 2017, 2020, 55000, 130000, 'standard'),
  ('corsa-f', 'Opel', 'Corsa F', 'Citadine', 13300, 2019, 2022, 35000, 100000, 'standard'),
  ('qashqai-ii', 'Nissan', 'Qashqai II', 'SUV compact', 16900, 2017, 2020, 60000, 140000, 'standard'),
  ('i30-iii', 'Hyundai', 'i30 III', 'Compacte', 14800, 2017, 2021, 50000, 125000, 'standard'),
  ('classe-a-w176', 'Mercedes-Benz', 'Classe A W176', 'Compacte premium', 20400, 2016, 2018, 65000, 135000, 'premium'),
  ('volvo-v40', 'Volvo', 'V40', 'Compacte premium', 18600, 2016, 2019, 65000, 145000, 'premium'),
  ('lexus-ct-200h', 'Lexus', 'CT 200h', 'Hybride premium', 19800, 2016, 2020, 70000, 155000, 'premium'),
  ('abarth-595-competizione', 'Abarth', '595 Competizione', 'Citadine sportive', 21100, 2016, 2020, 45000, 105000, 'premium'),
  ('mercedes-190e-23-16', 'Mercedes-Benz', '190 E 2.3-16', 'Berline homologation', 56000, 1984, 1988, 110000, 240000, 'collector'),
  ('honda-nsx-na1', 'Honda', 'NSX NA1', 'Supercar de collection', 92000, 1991, 1996, 65000, 150000, 'collector'),
  ('skyline-gtr-r32', 'Nissan', 'Skyline GT-R R32', 'Sportive japonaise', 78000, 1989, 1994, 85000, 180000, 'collector'),
  ('lotus-esprit-v8', 'Lotus', 'Esprit V8', 'GT de collection', 72000, 1996, 2004, 50000, 125000, 'collector')
on conflict (id) do update set
  maker = excluded.maker,
  model = excluded.model,
  segment = excluded.segment,
  market_value = excluded.market_value,
  year_min = excluded.year_min,
  year_max = excluded.year_max,
  mileage_min = excluded.mileage_min,
  mileage_max = excluded.mileage_max,
  market_tier = excluded.market_tier;

commit;
