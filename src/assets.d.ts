// Binary assets are bundled into the Worker as Data modules (see the "rules"
// block in wrangler.jsonc / wrangler.staging.jsonc), which hands them over as
// an ArrayBuffer at import time. Bundled rather than hotlinked or stored in
// R2: no external dependency, no credentials needed to deploy, and the files
// are version-controlled alongside the page that uses them.
declare module "*.jpg" {
  const content: ArrayBuffer;
  export default content;
}
