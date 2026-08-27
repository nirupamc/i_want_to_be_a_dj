// Backwards-compat shim. The original controlManifest.ts referenced a non-
// existent `../rig/controlTypes` module. M12A introduces a self-contained
// registry in `./controlRegistry.ts`. This file re-exports the new manifest
// builder so legacy import paths continue to work, while keeping the
// existing semantic ID schema (`deck.left.play`, `mixer.channel1.eq.high`, …).

import * as THREE from "three";
import { allExpectedIds, CONTROL_IDS, padId } from "./controlIds";
import type { ControlKind, RuntimeControl } from "./controlRegistry";
import { buildControlRegistry } from "./controlRegistry";

export { CONTROL_IDS, padId, allExpectedIds };
export type { ControlKind, RuntimeControl };

export interface ManifestEntry {
  id: string;
  kind: ControlKind;
  objectName: string;
}

export interface ControlManifest {
  schemaVersion: 1;
  rootName: string;
  total: number;
  ids: string[];
  entries: ManifestEntry[];
}

export function buildManifest(root: THREE.Object3D): ControlManifest {
  const { controls } = buildControlRegistry(root);
  const entries: ManifestEntry[] = [];
  for (const [id, c] of Object.entries(controls).sort(([a], [b]) => a.localeCompare(b))) {
    entries.push({ id, kind: c.kind, objectName: c.object.name ?? "" });
  }
  return {
    schemaVersion: 1,
    rootName: root.name || "ControllerRoot",
    total: entries.length,
    ids: entries.map((e) => e.id),
    entries
  };
}

export function diffManifestAgainstExpected(manifest: ControlManifest): { missing: string[]; unexpected: string[]; duplicates: string[] } {
  const expected = new Set(allExpectedIds());
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of manifest.ids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  const missing: string[] = allExpectedIds().filter((id) => !seen.has(id));
  const unexpected: string[] = manifest.ids.filter((id) => !expected.has(id));
  return { missing, unexpected, duplicates };
}

export const EXPECTED_IDS: ReadonlySet<string> = new Set(allExpectedIds());
