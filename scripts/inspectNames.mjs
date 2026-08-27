import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

if (typeof globalThis.self === "undefined") globalThis.self = globalThis;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GLB = path.join(ROOT, "public", "models", "ddj-flx4", "ddj-flx4-controller.glb");
const buf = fs.readFileSync(GLB);
const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
loader.setDRACOLoader(draco);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await loader.parseAsync(ab, "");
const scene = gltf.scene;

const out = [];
const byName = new Map();
scene.traverse((o) => {
  if (!o.name) return;
  if (!byName.has(o.name)) byName.set(o.name, []);
  byName.get(o.name).push(o);
});

for (const [name, objs] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const obj = objs[0];
  const parent = obj.parent ? obj.parent.name || "<anon>" : "<root>";
  const pos = `(${obj.position.x.toFixed(3)}, ${obj.position.y.toFixed(3)}, ${obj.position.z.toFixed(3)})`;
  const rot = `(${obj.rotation.x.toFixed(3)}, ${obj.rotation.y.toFixed(3)}, ${obj.rotation.z.toFixed(3)})`;
  out.push(`${name} | type=${obj.type} | parent=${parent} | c=${obj.children.length} | pos=${pos} | rot=${rot}`);
}

console.log(`unique=${byName.size} total=${[...byName.values()].reduce((a, b) => a + b.length, 0)}`);
const out2 = out.join("\n") + "\n";
fs.writeFileSync(path.join(ROOT, "docs", "3d", "HIERARCHY_NAMES.txt"), out2);
console.log("Wrote docs/3d/HIERARCHY_NAMES.txt");
