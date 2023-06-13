#!/usr/bin/env node

const gdal = require('gdal-async');

if (process.argv.length < 4) {
  console.log(`Usage: dem-iron input_dem output_dem [threshold=4]`);
  process.exit();
}

// input DEM
const dataset = gdal.open(process.argv[2]);

// minimal length of the run to smooth; prevents blurring
const threshold = Number.parseInt(process.argv[4]) || 4;

const { x: width, y: height } = dataset.rasterSize;

console.log('Dataset', dataset);

// output DEM
const dataset1 = gdal.open(process.argv[3], 'w', 'GTiff', width, height, 1, 'Float32');
dataset1.srs = dataset.srs;
dataset1.geoTransform = dataset.geoTransform;

const dst = new Float32Array(width * height);

let src = dataset.bands.get(1).pixels.read(0, 0, width, height);

for (const vertical of [false, true]) {
  const addr = (x, y) => vertical ? x * height + y : (y * width + x);
  const maxX = vertical ? width : height;
  const maxY = vertical ? height : width;

  for (let y = 0; y < maxY; y++) {
    let v1 = src[addr(0, y)];
    let v2 = v1;

    for (let x = 0; x < maxX;) {
      let xx;
      for (xx = x + 1; xx < maxX && src[addr(x, y)] == src[addr(xx, y)]; xx++);

      const v3 = xx === maxX ? v2 : src[addr(xx, y)];

      const interpolate = (xx - x >= threshold)
        && ((v2 - v1) * (v2 - v3) < 0); // ignore change in the direction not to alter water surfaces

      for (let q = x; q < xx; q++) {
        const diff1 = interpolate ? ((v1 + (v2 - v1) * (q + 0.5 - x) / (xx - x) + v2 + (v3 - v2) * (q + 0.5 - x) / (xx - x)) / 2) - v2 : 0;

        if (vertical) {
          const diff2 = dst[addr(q, y)];
          const diff = Math.abs(diff1) > Math.abs(diff2) ? diff1 : diff2;
          dst[addr(q, y)] = v2 + diff;
        } else {
          dst[addr(q, y)] = diff1;
        }
      }

      v1 = v2;
      v2 = v3;
      x = xx;
    }
  }
}

dataset1.bands.get(1).pixels.write(0, 0, width, height, dst);

dataset1.close();
