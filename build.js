#!/usr/bin/env node
'use strict';
/**
 * Minify static assets in-place for production.
 * Run via: npm run build
 * Render invokes this automatically via buildCommand in render.yaml.
 */
const esbuild = require('esbuild');
const path = require('path');
const staticDir = path.join(__dirname, 'static');

async function build() {
  const jsFiles = ['app.js', 'liquid-glass.js'];
  await Promise.all(jsFiles.map(file =>
    esbuild.build({
      entryPoints: [path.join(staticDir, file)],
      outfile: path.join(staticDir, file),
      allowOverwrite: true,
      minify: true,
      target: ['es2020'],
      logLevel: 'info',
    })
  ));

  await esbuild.build({
    entryPoints: [path.join(staticDir, 'style.css')],
    outfile: path.join(staticDir, 'style.css'),
    allowOverwrite: true,
    minify: true,
    logLevel: 'info',
  });

  console.log('Build complete.');
}

build().catch(err => { console.error(err); process.exit(1); });
