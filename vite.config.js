// BASE_PATH (e.g. /SpiderMan/) lets the build be served from a sub-path (GitHub Pages project sites). The game's code loads
// its files from root-relative '/assets/...' strings: the plugin below rewrites those to the base at build time. Default '/'.
const base = process.env.BASE_PATH || '/';
const rebase = {
  name: 'rebase-assets',
  enforce: 'pre',
  transform(code, id) {
    if (base === '/' || !/[\/]src[\/].*\.js$/.test(id)) return null;
    const out = code.replace(/(['"`])\/assets\//g, `$1${base}assets/`);
    return out === code ? null : { code: out, map: null };
  },
};
export default { base, plugins: [rebase], build: { target: 'esnext', chunkSizeWarningLimit: 2500 } };
