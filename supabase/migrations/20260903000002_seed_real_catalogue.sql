-- Replaces the generic Lovable-scaffold demo catalogue (Atlas/Meridian/
-- Continent) with HABÄNE's real 8-product line, matching the storefront's
-- own local content exactly (see Habane_current/assets/app.js's `products`
-- object) — same names, prices and categories, so the storefront's
-- name-normalization match (openProduct / product.html's ?slug= handler)
-- correctly pairs live API data with the local pack-list/blueprint content.
--
-- Image URLs are absolute (https://habaene.com/assets/new_products/...)
-- since the backend and frontend are separate origins.

UPDATE public.products SET is_active = false
WHERE code IN ('HB-SYS-01','HB-SYS-02','HB-CAR-01','HB-CAR-02','HB-LUG-01','HB-LUG-02');

INSERT INTO public.products
  (code, name, slug, subtitle, description, category, price, vat_rate, stock, badge,
   weight_kg, images, card_image, specs, colors, sizes, is_active)
VALUES
  ('HB-OBJ-01','Bag Tags','bag-tags','Premium Bag Tags',
   'Engineered for precision. The new Bag Tags brings intelligent design to your daily routine.',
   'system',89.00,0.19,40,'Flagship',0.05,
   ARRAY['https://habaene.com/assets/new_products/Bag_Tags/bag_tags_1.png','https://habaene.com/assets/new_products/Bag_Tags/bag_tags_2.png','https://habaene.com/assets/new_products/Bag_Tags/bag_tags_3.png','https://habaene.com/assets/new_products/Bag_Tags/bag_tags_4.png','https://habaene.com/assets/new_products/Bag_Tags/bag_tags_5.png','https://habaene.com/assets/new_products/Bag_Tags/bag_tags_6.png','https://habaene.com/assets/new_products/Bag_Tags/bag_tags_7.png','https://habaene.com/assets/new_products/Bag_Tags/bag_tags_8.jpeg','https://habaene.com/assets/new_products/Bag_Tags/bag_tags_9.jpeg'],
   'https://habaene.com/assets/new_products/Bag_Tags/bag_tags_1.png',
   '{"Material":"Premium materials","Warranty":"Lifetime"}'::jsonb,
   '[{"name":"Standard","hex":"#000000"}]'::jsonb, '["Standard"]'::jsonb, true),

  ('HB-OBJ-02','Electric Water Bottles','electric-water-bottles','Premium Electric Water Bottles',
   'Engineered for precision. The new Electric Water Bottles brings intelligent design to your daily routine.',
   'system',99.00,0.19,40,'City Object',0.35,
   ARRAY['https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_1.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_2.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_3.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_4.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_5.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_6.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_7.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_8.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_9.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_10.png','https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_11.png'],
   'https://habaene.com/assets/new_products/Electric_Water_Bottles/electric_water_bottles_1.png',
   '{"Material":"Premium materials","Warranty":"Lifetime"}'::jsonb,
   '[{"name":"Standard","hex":"#000000"}]'::jsonb, '["Standard"]'::jsonb, true),

  ('HB-OBJ-03','Fans','fans','Premium Fans',
   'Engineered for precision. The new Fans brings intelligent design to your daily routine.',
   'system',109.00,0.19,40,'Travel kit',0.25,
   ARRAY['https://habaene.com/assets/new_products/Fans/fans_1.png','https://habaene.com/assets/new_products/Fans/fans_2.png','https://habaene.com/assets/new_products/Fans/fans_3.png','https://habaene.com/assets/new_products/Fans/fans_4.png','https://habaene.com/assets/new_products/Fans/fans_5.png','https://habaene.com/assets/new_products/Fans/fans_6.png','https://habaene.com/assets/new_products/Fans/fans_7.png','https://habaene.com/assets/new_products/Fans/fans_8.png','https://habaene.com/assets/new_products/Fans/fans_9.png','https://habaene.com/assets/new_products/Fans/fans_10.png'],
   'https://habaene.com/assets/new_products/Fans/fans_1.png',
   '{"Material":"Premium materials","Warranty":"Lifetime"}'::jsonb,
   '[{"name":"Standard","hex":"#000000"}]'::jsonb, '["Standard"]'::jsonb, true),

  ('HB-OBJ-04','Luggage Tracker','luggage-tracker','Premium Luggage Tracker',
   'Engineered for precision. The new Luggage Tracker brings intelligent design to your daily routine.',
   'system',119.00,0.19,40,'Tech Layer',0.03,
   ARRAY['https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_1.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_2.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_3.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_4.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_5.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_6.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_7.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_8.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_9.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_10.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_11.png','https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_12.png'],
   'https://habaene.com/assets/new_products/Luggage_Tracker/luggage_tracker_1.png',
   '{"Material":"Premium materials","Warranty":"Lifetime"}'::jsonb,
   '[{"name":"Standard","hex":"#000000"}]'::jsonb, '["Standard"]'::jsonb, true),

  ('HB-OBJ-05','Passport Cover','passport-cover','Premium Passport Cover',
   'Engineered for precision. The new Passport Cover brings intelligent design to your daily routine.',
   'system',129.00,0.19,40,'Extended',0.08,
   ARRAY['https://habaene.com/assets/new_products/Passport_Cover/passport_cover_1.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_2.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_3.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_4.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_5.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_6.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_7.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_8.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_9.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_10.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_11.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_12.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_13.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_14.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_15.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_16.png','https://habaene.com/assets/new_products/Passport_Cover/passport_cover_17.png'],
   'https://habaene.com/assets/new_products/Passport_Cover/passport_cover_1.png',
   '{"Material":"Premium materials","Warranty":"Lifetime"}'::jsonb,
   '[{"name":"Standard","hex":"#000000"}]'::jsonb, '["Standard"]'::jsonb, true),

  ('HB-OBJ-06','Sling Bag','sling-bag','Premium Sling Bag',
   'Engineered for precision. The new Sling Bag brings intelligent design to your daily routine.',
   'system',139.00,0.19,40,'Daily system',0.45,
   ARRAY['https://habaene.com/assets/new_products/Sling_Bag/sling_bag_1.png','https://habaene.com/assets/new_products/Sling_Bag/sling_bag_2.png','https://habaene.com/assets/new_products/Sling_Bag/sling_bag_3.png'],
   'https://habaene.com/assets/new_products/Sling_Bag/sling_bag_1.png',
   '{"Material":"Premium materials","Warranty":"Lifetime"}'::jsonb,
   '[{"name":"Standard","hex":"#000000"}]'::jsonb, '["Standard"]'::jsonb, true),

  ('HB-OBJ-07','Smart Umbrella','smart-umbrella','Premium Smart Umbrella',
   'Engineered for precision. The new Smart Umbrella brings intelligent design to your daily routine.',
   'system',149.00,0.19,40,'Module',0.35,
   ARRAY['https://habaene.com/assets/new_products/Smart_Umbrella/smart_umbrella_1.png','https://habaene.com/assets/new_products/Smart_Umbrella/smart_umbrella_2.png','https://habaene.com/assets/new_products/Smart_Umbrella/smart_umbrella_3.png','https://habaene.com/assets/new_products/Smart_Umbrella/smart_umbrella_4.png','https://habaene.com/assets/new_products/Smart_Umbrella/smart_umbrella_5.png','https://habaene.com/assets/new_products/Smart_Umbrella/smart_umbrella_6.png'],
   'https://habaene.com/assets/new_products/Smart_Umbrella/smart_umbrella_1.png',
   '{"Material":"Premium materials","Warranty":"Lifetime"}'::jsonb,
   '[{"name":"Standard","hex":"#000000"}]'::jsonb, '["Standard"]'::jsonb, true),

  ('HB-OBJ-08','Suitcases','suitcases','Premium Suitcases',
   'Engineered for precision. The new Suitcases brings intelligent design to your daily routine.',
   'system',159.00,0.19,25,'Space system',3.80,
   ARRAY['https://habaene.com/assets/new_products/Suitcases/suitcases_1.png','https://habaene.com/assets/new_products/Suitcases/suitcases_2.png','https://habaene.com/assets/new_products/Suitcases/suitcases_3.png','https://habaene.com/assets/new_products/Suitcases/suitcases_4.png','https://habaene.com/assets/new_products/Suitcases/suitcases_5.png','https://habaene.com/assets/new_products/Suitcases/suitcases_6.png','https://habaene.com/assets/new_products/Suitcases/suitcases_7.png','https://habaene.com/assets/new_products/Suitcases/suitcases_8.png','https://habaene.com/assets/new_products/Suitcases/suitcases_9.png','https://habaene.com/assets/new_products/Suitcases/suitcases_10.png'],
   'https://habaene.com/assets/new_products/Suitcases/suitcases_1.png',
   '{"Material":"Premium materials","Warranty":"Lifetime"}'::jsonb,
   '[{"name":"Standard","hex":"#000000"}]'::jsonb, '["Standard"]'::jsonb, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description, category = EXCLUDED.category, price = EXCLUDED.price,
  vat_rate = EXCLUDED.vat_rate, badge = EXCLUDED.badge, weight_kg = EXCLUDED.weight_kg,
  images = EXCLUDED.images, card_image = EXCLUDED.card_image, specs = EXCLUDED.specs,
  colors = EXCLUDED.colors, sizes = EXCLUDED.sizes, is_active = true;
