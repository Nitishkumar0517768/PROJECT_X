const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
  metafile: true,
};

// Copy webview assets to dist
function copyWebviewAssets() {
  const srcDir = path.join(__dirname, 'webview');
  const destDir = path.join(__dirname, 'dist', 'webview');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  if (fs.existsSync(srcDir)) {
    const files = fs.readdirSync(srcDir);
    for (const file of files) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
  }
  console.log('[BlindCode] Webview assets copied.');
}

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      copyWebviewAssets();
      console.log('[BlindCode] Watching for changes...');
    } else {
      const result = await esbuild.build(buildOptions);
      copyWebviewAssets();
      const text = await esbuild.analyzeMetafile(result.metafile);
      console.log('[BlindCode] Build complete.');
      console.log(text);
    }
  } catch (err) {
    console.error('[BlindCode] Build failed:', err);
    process.exit(1);
  }
}

build();
