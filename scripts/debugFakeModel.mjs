import * as THREE from "three";

const root = new THREE.Object3D();
root.name = "ControllerRoot";
for (const side of ["Left", "Right"]) {
  const deck = new THREE.Object3D(); deck.name = `${side}Deck`; root.add(deck);
  const j = new THREE.Object3D(); j.name = `${side}JogWheelPivot`; deck.add(j);
  const t = new THREE.Object3D(); t.name = `${side}TempoFader`; deck.add(t);
}
const mixer = new THREE.Object3D(); mixer.name = "Mixer"; root.add(mixer);
mixer.add(new THREE.Object3D()).name = "BrowseEncoderPivot";
mixer.add(new THREE.Object3D()).name = "BeatFxChannelSelect";
const l1 = new THREE.Object3D(); l1.name = "Load1"; mixer.add(l1);
const lm = new THREE.Object3D(); lm.name = "Load1Mesh"; l1.add(lm);
const lb = new THREE.Mesh(new THREE.BoxGeometry(0.01), new THREE.MeshBasicMaterial()); lb.name = "Load1Body"; lm.add(lb);

console.log("Load1?", !!root.getObjectByName("Load1"));
console.log("BrowseEncoder?", !!root.getObjectByName("BrowseEncoderPivot"));
console.log("BeatFxChannelSelect?", !!root.getObjectByName("BeatFxChannelSelect"));
