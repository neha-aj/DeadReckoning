[out:json][timeout:90];
(
 nwr["amenity"~"^(pharmacy|hospital|clinic|doctors|police|fire_station|drinking_water|fuel|place_of_worship|school|college|university|marketplace|shelter|community_centre|townhall|bus_station)$"](12.955,77.560,13.010,77.620);
 nwr["shop"~"^(supermarket|convenience|greengrocer|grocery|bakery|butcher|hardware|doityourself|clothes|shoes|outdoor|sports|electronics|mobile_phone|chemist|medical_supply|department_store|mall|general|kiosk|water|beverages)$"](12.955,77.560,13.010,77.620);
 nwr["railway"="station"](12.955,77.560,13.010,77.620);
 nwr["station"="subway"](12.955,77.560,13.010,77.620);
);
out center tags qt;
