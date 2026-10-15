[out:json][timeout:90];
(
 way["leisure"~"^(park|garden|stadium)$"](12.955,77.560,13.010,77.620);
 way["natural"="water"](12.955,77.560,13.010,77.620);
 way["landuse"~"^(grass|recreation_ground|military)$"](12.955,77.560,13.010,77.620);
);
out geom qt;
