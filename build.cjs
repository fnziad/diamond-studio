const fs = require('node:fs');
const esbuild = require('esbuild');
const js = esbuild.buildSync({entryPoints:['viewer.js'],bundle:true,write:false,minify:true,format:'iife',target:'es2022',legalComments:'eof'}).outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const html = fs.readFileSync('viewer.template.html','utf8');
const css = fs.readFileSync('viewer.css','utf8');
fs.writeFileSync('index.html',html.replace('__CSS__',()=>css).replace('__JS__',()=>js));
