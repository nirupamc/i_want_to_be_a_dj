// Validate the registry's actually-needed GLB names against the real GLB.
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
const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");

// Names the registry actually looks up. Mirrors controlRegistry.ts.
const required = [
  "LeftJogWheelPivot", "RightJogWheelPivot",
  "LeftTempoFader", "RightTempoFader",
  "ChannelFader1", "ChannelFader2", "Crossfader",
  "Trim1Pivot", "High1Pivot", "Mid1Pivot", "Low1Pivot", "CFX1Pivot",
  "Trim2Pivot", "High2Pivot", "Mid2Pivot", "Low2Pivot", "CFX2Pivot",
  "MasterLevelPivot", "MicLevelPivot", "HeadphonesMixPivot", "HeadphonesLevelPivot",
  "BeatFxLevelDepthPivot", "BrowseEncoderPivot", "BeatFxChannelSelect",
  "LeftPlayPause", "LeftCue", "LeftShift", "LeftBeatSync", "LeftIn", "LeftOut",
  "LeftFourBeatExit", "LeftCueLoopCallLeft", "LeftCueLoopCallRight",
  "LeftHotCueMode", "LeftPadFX1Mode", "LeftBeatJumpMode", "LeftSamplerMode",
  "RightPlayPause", "RightCue", "RightShift", "RightBeatSync", "RightIn", "RightOut",
  "RightFourBeatExit", "RightCueLoopCallLeft", "RightCueLoopCallRight",
  "RightHotCueMode", "RightPadFX1Mode", "RightBeatJumpMode", "RightSamplerMode",
  "ChannelCue1", "ChannelCue2", "MasterCue",
  "Load1", "Load2",
  "BeatFxOnOff", "BeatFxSelect", "BeatLeft", "BeatRight",
  "SmartCFX", "SmartFader"
];
for (let i = 1; i <= 8; i++) {
  required.push(`LeftPad${String(i).padStart(2, "0")}`);
  required.push(`RightPad${String(i).padStart(2, "0")}`);
}
for (const knob of ["Trim", "High", "Mid", "Low", "CFX"]) {
  required.push(`${knob}1TopCap`);
  required.push(`${knob}2TopCap`);
}
for (const knob of ["MasterLevel", "MicLevel", "HeadphonesMix", "HeadphonesLevel", "BeatFxLevelDepth"]) {
  required.push(`${knob}TopCap`);
}
for (let i = 1; i <= 8; i++) {
  required.push(`LeftPad${String(i).padStart(2, "0")}Top`);
  required.push(`RightPad${String(i).padStart(2, "0")}Top`);
}

const seen = new Set();
gltf.scene.traverse((o) => { if (o.name) seen.add(o.name); });
const missing = required.filter((n) => !seen.has(n));
const present = required.length - missing.length;
console.log(`required=${required.length} present=${present} missing=${missing.length}`);
if (missing.length) {
  console.log("MISSING NAMES:");
  for (const m of missing) console.log(" -", m);
} else {
  console.log("ALL REQUIRED GLB NAMES PRESENT");
}
