import { z } from 'zod';

/** Repère d'un élément du visage dans le repère du crâne (s côté, u hauteur, w/h tailles), en tailles de tête. */
const Mark = z.object({ s: z.number(), u: z.number(), w: z.number(), h: z.number() });
const Rgb = z.tuple([z.number(), z.number(), z.number()]);

/** Repères du visage d'une base, calculés au banc sur le modèle pleine résolution. */
export const FaceMarksSchema = z.object({
  eyes: z.tuple([Mark, Mark]),
  brows: z.tuple([Mark, Mark]),
  mouthU: z.number(),
  /** Couleurs de peau échantillonnées (paupières / sourcils : gauche, droite). */
  lidSkin: z.tuple([Rgb, Rgb]),
  browSkin: z.tuple([Rgb, Rgb]),
  mouthSkin: Rgb,
  skull: z.object({ size: z.number() }).optional(),
});

/** Manifeste des modèles allégés servis par le relais (`persos/manifest.json`). */
export const ManifestSchema = z.object({
  version: z.literal(1),
  bases: z.record(
    z.string(),
    z.object({
      glb: z.string(),
      png: z.string(),
      /** Taille réelle du personnage en mètres. */
      metres: z.number().positive(),
      aged: z.literal(true).optional(),
      child: z.literal(true).optional(),
      face: FaceMarksSchema,
    }),
  ),
});

export type FaceMarks = z.infer<typeof FaceMarksSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
