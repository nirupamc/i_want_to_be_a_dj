// GLB hierarchy inspector — runs under Node with three's GLTFLoader.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Provide browser globals that GLTFLoader expects when running under Node.
if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GLB = path.join(ROOT, "public", "models", "ddj-flx4", "ddj-flx4-controller.glb");

const buf = fs.readFileSync(GLB);
console.log(`GLB size: ${(buf.byteLength / 1024).toFixed(1)} KiB`);

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await loader.parseAsync(ab, "");

const scene = gltf.scene;
console.log(`Scene root name: "${scene.name}"`);
console.log(`Children: ${scene.children.length}`);

const lines = [];
let total = 0;
let interactive = 0;
const interactiveIds = [];

const KNOWN_KINDS = [
  /jog/i,
  /fader/i,
  /crossfader/i,
  /knob/i,
  /trim/i,
  /encoder/i,
  /tempo/i,
  /play/i,
  /cue/i,
  /sync/i,
  /shift/i,
  /pad/i,
  /loop/i,
  /beat/i,
  /hotCue/i,
  /beatJump/i,
  /sampler/i,
  /load/i,
  /browse/i,
  /fx/i,
  /onOff/i,
  /select/i,
  /headphone/i,
  /mic/i,
  /master/i,
  /channel/i,
  /smart/i,
  /fader/i,
];

function isInteractive(name) {
  if (!name) return false;
  return KNOWN_KINDS.some((r) => r.test(name));
}

scene.traverse((obj) => {
  total += 1;
  if (isInteractive(obj.name)) interactive += 1;
  const p = obj.parent ? obj.parent.name || "<anon>" : "<root>";
  const pos = `(${obj.position.x.toFixed(3)}, ${obj.position.y.toFixed(3)}, ${obj.position.z.toFixed(3)})`;
  const rot = `(${obj.rotation.x.toFixed(3)}, ${obj.rotation.y.toFixed(3)}, ${obj.rotation.z.toFixed(3)})`;
  const sca = `(${obj.scale.x.toFixed(3)}, ${obj.scale.y.toFixed(3)}, ${obj.scale.z.toFixed(3)})`;
  const geom = obj.geometry ? "G" : "·";
  const mat = obj.material ? (obj.material.name || obj.material.type) : "·";
  const bbox = obj.geometry?.boundingBox
    ? `bbox=(${obj.geometry.boundingBox.min.x.toFixed(2)}..${obj.geometry.boundingBox.max.x.toFixed(2)})`
    : "";
  lines.push(`${obj.name || "<noname>"} | ${obj.type} | parent=${p} | c=${obj.children.length} | pos=${pos} | rot=${rot} | scl=${sca} | ${geom} | mat=${mat} ${bbox}`);
  if (isInteractive(obj.name)) interactiveIds.push(obj.name);
});

const reportPath = path.join(ROOT, "docs", "3d", "HIERARCHY_AUDIT.md");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const md = [];
md.push("# GLB Hierarchy Audit — M12A");
md.push(`GLB: \`public/models/ddj-flx4/ddj-flx4-controller.glb\` (${(buf.byteLength / 1024).toFixed(1)} KiB)`);
md.push("");
md.push(`Total nodes traversed: **${total}**`);
md.push(`Likely-interactive named nodes: **${interactive}**`);
md.push("");
md.push("## All named objects (depth-first, abbreviated)");
md.push("");
md.push("```");
for (const l of lines) if (!l.startsWith("<noname>")) md.push(l);
md.push("```");
md.push("");
md.push("## Likely-interactive (name heuristic)");
md.push("");
for (const n of interactiveIds) md.push(`- ${n}`);
fs.writeFileSync(reportPath, md.join("\n"));

console.log(`Total nodes: ${total}`);
console.log(`Likely interactive: ${interactive}`);
console.log(`Report: ${reportPath}`);

// Print all unique top-level names
const byName = new Map();
scene.traverse((o) => { if (o.name) byName.set(o.name, (byName.get(o.name) || 0) + 1); });
console.log(`Unique named nodes: ${byName.size}`);
const sorted = [...byName.keys()].sort();
for (const n of sorted) console.log(`  ${n} (${byName.get(n)})`);
