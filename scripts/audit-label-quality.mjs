// Audit label texture quality and identify softness causes
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

if (typeof globalThis.self === "undefined") globalThis.self = globalThis;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GLB = path.join(ROOT, "public", "models", "ddj-flx4", "ddj-flx4-controller.glb");

const buf = fs.readFileSync(GLB);
const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await loader.parseAsync(ab, "");

const scene = gltf.scene;
const labelNodes = [];
const textures = new Map();

scene.traverse((obj) => {
  const name = obj.name?.toLowerCase() || "";
  if (/label|text|fidelity/.test(name)) {
    const mesh = obj;
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of materials) {
      const info = {
        node: obj.name,
        type: obj.type,
        materialName: mat.name || mat.type,
        materialType: mat.type,
        hasMap: !!mat.map,
        hasEmissiveMap: !!mat.emissiveMap,
        color: mat.color ? `#${mat.color.getHexString()}` : null,
        emissive: mat.emissive ? `#${mat.emissive.getHexString()}` : null,
        emissiveIntensity: mat.emissiveIntensity ?? null,
        roughness: mat.roughness ?? null,
        metalness: mat.metalness ?? null,
        transparent: mat.transparent ?? false,
        opacity: mat.opacity ?? 1,
      };

      if (mat.map) {
        const tex = mat.map;
        const img = tex.image;
        const size = img?.width && img?.height ? `${img.width}×${img.height}` : "unknown";
        const texKey = tex.uuid;
        if (!textures.has(texKey)) {
          textures.set(texKey, {
            uuid: tex.uuid,
            size,
            format: tex.format,
            type: tex.type,
            encoding: tex.encoding,
            colorSpace: tex.colorSpace,
            anisotropy: tex.anisotropy,
            minFilter: tex.minFilter,
            magFilter: tex.magFilter,
            wrapS: tex.wrapS,
            wrapT: tex.wrapT,
            generateMipmaps: tex.generateMipmaps,
            usedBy: []
          });
        }
        textures.get(texKey).usedBy.push(obj.name);
        info.textureUuid = tex.uuid;
        info.textureSize = size;
      }

      labelNodes.push(info);
    }
  }
});

console.log(`\n=== LABEL/TEXT NODE AUDIT ===\n`);
console.log(`Found ${labelNodes.length} label-related nodes\n`);

// Group by priority
const priority1 = labelNodes.filter(n => 
  /hotcue|padfx|beatjump|sampler|trim|high|low|mid|cfx|beatfx|load|browse|play|cue/i.test(n.node)
);
const priority2 = labelNodes.filter(n => 
  /deck|channel|level|depth|onoff|select|beat(?!fx)/i.test(n.node) && !priority1.includes(n)
);
const priority3 = labelNodes.filter(n => !priority1.includes(n) && !priority2.includes(n));

console.log(`Priority 1 (pad, mixer, FX, transport): ${priority1.length}`);
console.log(`Priority 2 (deck, utility): ${priority2.length}`);
console.log(`Priority 3 (auxiliary): ${priority3.length}\n`);

// Analyze texture situation
console.log(`=== TEXTURE ANALYSIS ===\n`);
console.log(`Unique textures used by labels: ${textures.size}\n`);

if (textures.size > 0) {
  for (const [uuid, tex] of textures) {
    console.log(`Texture ${uuid.slice(0, 8)}...`);
    console.log(`  Size: ${tex.size}`);
    console.log(`  Anisotropy: ${tex.anisotropy}`);
    console.log(`  MinFilter: ${tex.minFilter}`);
    console.log(`  MagFilter: ${tex.magFilter}`);
    console.log(`  ColorSpace: ${tex.colorSpace}`);
    console.log(`  Mipmaps: ${tex.generateMipmaps}`);
    console.log(`  Used by ${tex.usedBy.length} nodes: ${tex.usedBy.slice(0, 3).join(", ")}${tex.usedBy.length > 3 ? "..." : ""}`);
    console.log();
  }
} else {
  console.log(`No textures found — labels are pure geometry meshes.\n`);
}

// Sample priority nodes
console.log(`=== PRIORITY 1 LABEL SAMPLE (first 10) ===\n`);
for (const node of priority1.slice(0, 10)) {
  console.log(`${node.node}:`);
  console.log(`  Material: ${node.materialName} (${node.materialType})`);
  console.log(`  Color: ${node.color}, Emissive: ${node.emissive} @ ${node.emissiveIntensity}`);
  console.log(`  Texture: ${node.hasMap ? `YES (${node.textureSize})` : "NO"}`);
  console.log();
}

// Diagnosis
console.log(`\n=== ROOT CAUSE DIAGNOSIS ===\n`);

if (textures.size === 0) {
  console.log(`✗ Labels are PURE GEOMETRY (no textures)`);
  console.log(`  → Softness cause: geometry mesh resolution + anti-aliasing + viewing angle`);
  console.log(`  → Solution: Cannot improve texture quality (no textures)`);
  console.log(`  → Best fix: Improve lighting contrast + emissive strength + add readability assist`);
} else {
  console.log(`✓ Labels use ${textures.size} texture(s)`);
  for (const [uuid, tex] of textures) {
    const [w, h] = tex.size.split('×').map(Number);
    if (w && w < 512) {
      console.log(`  ✗ Texture resolution LOW: ${tex.size}`);
      console.log(`    → Need higher-res texture or assist layer`);
    }
    if (tex.anisotropy < 8) {
      console.log(`  ✗ Anisotropy LOW: ${tex.anisotropy}`);
      console.log(`    → Can improve with anisotropy boost`);
    }
  }
}

console.log(`\nRecommendation:`);
console.log(`  1. Verify texture atlas resolution in GLB`);
console.log(`  2. Boost anisotropy to max for label textures specifically`);
console.log(`  3. Use sharper minFilter (NearestMipmapLinear or Linear without mips)`);
console.log(`  4. Increase emissive strength + contrast`);
console.log(`  5. Add polished readability assist overlay for smallest labels`);
