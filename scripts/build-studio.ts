import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir + "/..";
const distDir = join(root, "dist");
const electronOut = join(distDir, "electron");
const rendererOut = join(distDir, "studio");
const rendererAssetsOut = join(rendererOut, "assets");

mkdirSync(electronOut, { recursive: true });
mkdirSync(rendererOut, { recursive: true });
mkdirSync(rendererAssetsOut, { recursive: true });

const builds = await Promise.all([
  Bun.build({
    entrypoints: [join(root, "electron/main.ts")],
    outdir: electronOut,
    target: "node",
    format: "esm",
    sourcemap: "external",
    minify: false,
    external: ["electron"],
  }),
  Bun.build({
    entrypoints: [join(root, "electron/preload.ts")],
    target: "node",
    format: "cjs",
    sourcemap: "external",
    minify: false,
    external: ["electron"],
    write: false,
  }),
  Bun.build({
    entrypoints: [join(root, "studio/renderer/index.tsx")],
    outdir: rendererOut,
    target: "browser",
    format: "esm",
    sourcemap: "external",
    minify: false,
  }),
]);

for (const result of builds) {
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}

const preloadBuild = builds[1];
const preloadBundle = preloadBuild?.outputs.find((output) => output.path.endsWith("preload.js"));
const preloadSourceMap = preloadBuild?.outputs.find((output) => output.path.endsWith("preload.js.map"));

if (!preloadBundle || !preloadSourceMap) {
  throw new Error("Unable to materialize the Electron preload bundle.");
}

await Bun.write(join(electronOut, "preload.cjs"), preloadBundle);
await Bun.write(join(electronOut, "preload.cjs.map"), preloadSourceMap);

await Bun.write(
  join(rendererOut, "index.html"),
  await Bun.file(join(root, "studio/renderer/index.html")).text()
);
await Bun.write(
  join(rendererOut, "styles.css"),
  await Bun.file(join(root, "studio/renderer/styles.css")).text()
);

copyFileSync(
  join(root, "studio/renderer/assets/amanda.png"),
  join(rendererAssetsOut, "amanda.png")
);
