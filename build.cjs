const fs = require("node:fs");
const esbuild = require("esbuild");

const css = fs.readFileSync("viewer.css", "utf8");
for (const [entry, template, output] of [
  ["viewer.js", "viewer.template.html", "index.html"],
  ["diamond-inspector.js", "diamond-inspector.template.html", "diamond-inspector.html"],
]) {
  const result = esbuild.buildSync({
    entryPoints: [entry], bundle: true, write: false, minify: true,
    format: "iife", target: "es2022", legalComments: "eof",
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = fs.readFileSync(template, "utf8");
  fs.writeFileSync(output, html.replace("__CSS__", () => css).replace("__JS__", () => js));
}
