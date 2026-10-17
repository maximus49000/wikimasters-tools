// Allège les 6 modèles pleine résolution (Mixamo, ~18 Mo chacun) en GLB légers + PNG 512 px,
// et écrit le manifeste lu par le jeu. Les repères du visage viennent de faces-source.json
// (calculés au banc sur les modèles pleine résolution) et sont recopiés tels quels.
// Usage : npm run citizens:models [-- <dossier des modèles d'origine>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ici = dirname(fileURLToPath(import.meta.url));
const sortie = resolve(ici, '../../relay/public/persos');
const sources = resolve(
  process.argv[2] ?? 'C:/Users/maxim/Downloads/Wikimasters tools/.superpowers/autosprite',
);

/** Triangles visés par modèle. */
const CIBLE_TRIANGLES = 8000;
const ERREUR = 0.001;
const TEXTURE_PX = 512;

/** base → dossier d'origine, taille en mètres, âge. */
const BASES = {
  'homme-fort': { dossier: 'base-generique', metres: 1.7 },
  'homme-maigre': { dossier: 'base-homme-maigre', metres: 1.82 },
  'femme-frele': { dossier: 'base-femme-frele', metres: 1.62 },
  papy: { dossier: 'base-papy', metres: 1.66, aged: true },
  mamie: { dossier: 'base-mamie', metres: 1.54, aged: true },
  enfant: { dossier: 'base-enfant', metres: 1.25, child: true },
};

const visages = JSON.parse(readFileSync(join(ici, 'faces-source.json'), 'utf8')).bases;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
mkdirSync(sortie, { recursive: true });

const compteTriangles = (doc) => {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return n;
};

const manifeste = { version: 1, bases: {} };
for (const [nom, def] of Object.entries(BASES)) {
  const doc = await io.read(join(sources, def.dossier, 'model.glb'));
  const avant = compteTriangles(doc);

  await doc.transform(weld());
  const welded = compteTriangles(doc);
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: CIBLE_TRIANGLES / welded, error: ERREUR }));
  await doc.transform(prune());

  // Texture : extraite en PNG à part (512 px), puis retirée du GLB (le jeu charge le PNG séparément).
  const textures = doc.getRoot().listTextures();
  if (textures.length === 0) throw new Error(`${nom} : aucune texture`);
  const image = textures[0].getImage();
  await sharp(image).resize(TEXTURE_PX, TEXTURE_PX, { fit: 'fill' }).png({ compressionLevel: 9 }).toFile(join(sortie, `${nom}.png`));
  for (const mat of doc.getRoot().listMaterials()) mat.setBaseColorTexture(null);
  for (const t of doc.getRoot().listTextures()) t.dispose();

  await io.write(join(sortie, `${nom}.glb`), doc);
  console.log(`${nom} : ${Math.round(avant)} -> ${Math.round(compteTriangles(doc))} triangles`);

  manifeste.bases[nom] = {
    glb: `${nom}.glb`,
    png: `${nom}.png`,
    metres: def.metres,
    ...(def.aged ? { aged: true } : {}),
    ...(def.child ? { child: true } : {}),
    face: visages[nom],
  };
}
writeFileSync(join(sortie, 'manifest.json'), JSON.stringify(manifeste, null, 2) + '\n');
console.log('manifest.json écrit');
