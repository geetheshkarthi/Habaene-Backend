const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env before running the seed.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const products = [
  {
    code: 'OBJ / 01', passport_code: 'HB-P1-001', name: 'Bag Tags', slug: 'bag-tags', price: 89, category: 'system', badge: 'Flagship',
    card_image: 'assets/new_products/Bag_Tags/bag_tags_1.png', images: ["assets/new_products/Bag_Tags/bag_tags_1.png", "assets/new_products/Bag_Tags/bag_tags_2.png", "assets/new_products/Bag_Tags/bag_tags_3.png", "assets/new_products/Bag_Tags/bag_tags_4.png", "assets/new_products/Bag_Tags/bag_tags_5.png", "assets/new_products/Bag_Tags/bag_tags_6.png", "assets/new_products/Bag_Tags/bag_tags_7.png", "assets/new_products/Bag_Tags/bag_tags_8.jpeg", "assets/new_products/Bag_Tags/bag_tags_9.jpeg"],
    colors: [{name:'Standard',hex:'#000000'}], sizes: ['Standard'],
    subtitle: 'Premium Bag Tags',
    description: 'Engineered for precision. The new Bag Tags brings intelligent design to your daily routine.',
    specs: [['Material','Premium materials'],['Warranty','Lifetime']],
    weight_kg: 0.1, vat_rate: 0.19, stock: 100
  },
  {
    code: 'OBJ / 02', passport_code: 'HB-P2-001', name: 'Electric Water Bottles', slug: 'electric-water-bottles', price: 99, category: 'system', badge: 'City Object',
    card_image: 'assets/new_products/Electric_Water_Bottles/electric_water_bottles_1.png', images: ["assets/new_products/Electric_Water_Bottles/electric_water_bottles_1.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_2.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_3.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_4.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_5.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_6.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_7.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_8.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_9.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_10.png", "assets/new_products/Electric_Water_Bottles/electric_water_bottles_11.png"],
    colors: [{name:'Standard',hex:'#000000'}], sizes: ['Standard'],
    subtitle: 'Premium Electric Water Bottles',
    description: 'Engineered for precision. The new Electric Water Bottles brings intelligent design to your daily routine.',
    specs: [['Material','Premium materials'],['Warranty','Lifetime']],
    weight_kg: 0.5, vat_rate: 0.19, stock: 100
  },
  {
    code: 'OBJ / 03', passport_code: 'HB-P3-001', name: 'Fans', slug: 'fans', price: 109, category: 'system', badge: 'Travel kit',
    card_image: 'assets/new_products/Fans/fans_1.png', images: ["assets/new_products/Fans/fans_1.png", "assets/new_products/Fans/fans_2.png", "assets/new_products/Fans/fans_3.png", "assets/new_products/Fans/fans_4.png", "assets/new_products/Fans/fans_5.png", "assets/new_products/Fans/fans_6.png", "assets/new_products/Fans/fans_7.png", "assets/new_products/Fans/fans_8.png", "assets/new_products/Fans/fans_9.png", "assets/new_products/Fans/fans_10.png"],
    colors: [{name:'Standard',hex:'#000000'}], sizes: ['Standard'],
    subtitle: 'Premium Fans',
    description: 'Engineered for precision. The new Fans brings intelligent design to your daily routine.',
    specs: [['Material','Premium materials'],['Warranty','Lifetime']],
    weight_kg: 0.3, vat_rate: 0.19, stock: 100
  },
  {
    code: 'OBJ / 04', passport_code: 'HB-P4-001', name: 'Luggage Tracker', slug: 'luggage-tracker', price: 119, category: 'system', badge: 'Tech Layer',
    card_image: 'assets/new_products/Luggage_Tracker/luggage_tracker_1.png', images: ["assets/new_products/Luggage_Tracker/luggage_tracker_1.png", "assets/new_products/Luggage_Tracker/luggage_tracker_2.png", "assets/new_products/Luggage_Tracker/luggage_tracker_3.png", "assets/new_products/Luggage_Tracker/luggage_tracker_4.png", "assets/new_products/Luggage_Tracker/luggage_tracker_5.png", "assets/new_products/Luggage_Tracker/luggage_tracker_6.png", "assets/new_products/Luggage_Tracker/luggage_tracker_7.png", "assets/new_products/Luggage_Tracker/luggage_tracker_8.png", "assets/new_products/Luggage_Tracker/luggage_tracker_9.png", "assets/new_products/Luggage_Tracker/luggage_tracker_10.png", "assets/new_products/Luggage_Tracker/luggage_tracker_11.png", "assets/new_products/Luggage_Tracker/luggage_tracker_12.png"],
    colors: [{name:'Standard',hex:'#000000'}], sizes: ['Standard'],
    subtitle: 'Premium Luggage Tracker',
    description: 'Engineered for precision. The new Luggage Tracker brings intelligent design to your daily routine.',
    specs: [['Material','Premium materials'],['Warranty','Lifetime']],
    weight_kg: 0.1, vat_rate: 0.19, stock: 100
  },
  {
    code: 'OBJ / 05', passport_code: 'HB-P5-001', name: 'Passport Cover', slug: 'passport-cover', price: 129, category: 'system', badge: 'Extended',
    card_image: 'assets/new_products/Passport_Cover/passport_cover_1.png', images: ["assets/new_products/Passport_Cover/passport_cover_1.png", "assets/new_products/Passport_Cover/passport_cover_2.png", "assets/new_products/Passport_Cover/passport_cover_3.png", "assets/new_products/Passport_Cover/passport_cover_4.png", "assets/new_products/Passport_Cover/passport_cover_5.png", "assets/new_products/Passport_Cover/passport_cover_6.png", "assets/new_products/Passport_Cover/passport_cover_7.png", "assets/new_products/Passport_Cover/passport_cover_8.png", "assets/new_products/Passport_Cover/passport_cover_9.png", "assets/new_products/Passport_Cover/passport_cover_10.png", "assets/new_products/Passport_Cover/passport_cover_11.png", "assets/new_products/Passport_Cover/passport_cover_12.png", "assets/new_products/Passport_Cover/passport_cover_13.png", "assets/new_products/Passport_Cover/passport_cover_14.png", "assets/new_products/Passport_Cover/passport_cover_15.png", "assets/new_products/Passport_Cover/passport_cover_16.png", "assets/new_products/Passport_Cover/passport_cover_17.png"],
    colors: [{name:'Standard',hex:'#000000'}], sizes: ['Standard'],
    subtitle: 'Premium Passport Cover',
    description: 'Engineered for precision. The new Passport Cover brings intelligent design to your daily routine.',
    specs: [['Material','Premium materials'],['Warranty','Lifetime']],
    weight_kg: 0.1, vat_rate: 0.19, stock: 100
  },
  {
    code: 'OBJ / 06', passport_code: 'HB-P6-001', name: 'Sling Bag', slug: 'sling-bag', price: 139, category: 'system', badge: 'Daily system',
    card_image: 'assets/new_products/Sling_Bag/sling_bag_1.png', images: ["assets/new_products/Sling_Bag/sling_bag_1.png", "assets/new_products/Sling_Bag/sling_bag_2.png", "assets/new_products/Sling_Bag/sling_bag_3.png"],
    colors: [{name:'Standard',hex:'#000000'}], sizes: ['Standard'],
    subtitle: 'Premium Sling Bag',
    description: 'Engineered for precision. The new Sling Bag brings intelligent design to your daily routine.',
    specs: [['Material','Premium materials'],['Warranty','Lifetime']],
    weight_kg: 0.4, vat_rate: 0.19, stock: 100
  },
  {
    code: 'OBJ / 07', passport_code: 'HB-P7-001', name: 'Smart Umbrella', slug: 'smart-umbrella', price: 149, category: 'system', badge: 'Module',
    card_image: 'assets/new_products/Smart_Umbrella/smart_umbrella_1.png', images: ["assets/new_products/Smart_Umbrella/smart_umbrella_1.png", "assets/new_products/Smart_Umbrella/smart_umbrella_2.png", "assets/new_products/Smart_Umbrella/smart_umbrella_3.png", "assets/new_products/Smart_Umbrella/smart_umbrella_4.png", "assets/new_products/Smart_Umbrella/smart_umbrella_5.png", "assets/new_products/Smart_Umbrella/smart_umbrella_6.png"],
    colors: [{name:'Standard',hex:'#000000'}], sizes: ['Standard'],
    subtitle: 'Premium Smart Umbrella',
    description: 'Engineered for precision. The new Smart Umbrella brings intelligent design to your daily routine.',
    specs: [['Material','Premium materials'],['Warranty','Lifetime']],
    weight_kg: 0.4, vat_rate: 0.19, stock: 100
  },
  {
    code: 'OBJ / 08', passport_code: 'HB-P8-001', name: 'Suitcases', slug: 'suitcases', price: 159, category: 'system', badge: 'Space system',
    card_image: 'assets/new_products/Suitcases/suitcases_1.png', images: ["assets/new_products/Suitcases/suitcases_1.png", "assets/new_products/Suitcases/suitcases_2.png", "assets/new_products/Suitcases/suitcases_3.png", "assets/new_products/Suitcases/suitcases_4.png", "assets/new_products/Suitcases/suitcases_5.png", "assets/new_products/Suitcases/suitcases_6.png", "assets/new_products/Suitcases/suitcases_7.png", "assets/new_products/Suitcases/suitcases_8.png", "assets/new_products/Suitcases/suitcases_9.png", "assets/new_products/Suitcases/suitcases_10.png"],
    colors: [{name:'Standard',hex:'#000000'}], sizes: ['Standard'],
    subtitle: 'Premium Suitcases',
    description: 'Engineered for precision. The new Suitcases brings intelligent design to your daily routine.',
    specs: [['Material','Premium materials'],['Warranty','Lifetime']],
    weight_kg: 4.5, vat_rate: 0.19, stock: 100
  }
];

async function seed() {
  console.log("Deleting old products...");
  await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log("Inserting new HABÄNE products...");
  const { data, error } = await supabase.from('products').insert(products).select('id, name');
  if (error) {
    console.error("Error inserting products:", error);
  } else {
    console.log("Successfully inserted", data.length, "products!");
    console.log(data);
  }
}
seed();
