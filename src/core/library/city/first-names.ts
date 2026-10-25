// Prénoms des habitants de la ville (identité, lot 1) : prénoms français courants de chaque génération, chacun avec son sexe
// et la plage d'années de naissance où il est donné (un enfant né en 2020 ne s'appelle pas Gérard). Aucun prénom mixte
// (Camille, Claude, Sacha…) : le sexe se lit sur le prénom. Chaque prénom n'apparaît qu'une fois dans la table.

export type Sex = 'f' | 'm';
export type FirstName = { name: string; sex: Sex; from: number; to: number };

const GENERATIONS = [
  {
    from: 1935, to: 1965,
    f: ['Monique', 'Jacqueline', 'Françoise', 'Danielle', 'Michèle', 'Colette', 'Josiane', 'Simone', 'Yvette', 'Christiane', 'Odette', 'Ginette', 'Martine', 'Nicole', 'Jeanne', 'Huguette'],
    m: ['Gérard', 'Bernard', 'Michel', 'Jacques', 'Jean-Pierre', 'Alain', 'Daniel', 'Roger', 'René', 'Guy', 'Marcel', 'Serge', 'André', 'Patrick', 'Jean-Claude', 'Robert'],
  },
  {
    from: 1966, to: 1990,
    f: ['Nathalie', 'Isabelle', 'Sylvie', 'Sandrine', 'Valérie', 'Céline', 'Stéphanie', 'Karine', 'Aurélie', 'Virginie', 'Émilie', 'Sophie', 'Julie', 'Hélène', 'Laetitia', 'Yasmine'],
    m: ['Nicolas', 'Christophe', 'Stéphane', 'Sébastien', 'Frédéric', 'Laurent', 'Olivier', 'David', 'Julien', 'Karim', 'Thierry', 'Vincent', 'Jérôme', 'Samir', 'Marc', 'Cédric'],
  },
  {
    from: 1991, to: 2010,
    f: ['Manon', 'Sarah', 'Chloé', 'Léa', 'Marine', 'Laura', 'Pauline', 'Océane', 'Inès', 'Clara', 'Mathilde', 'Justine', 'Lucie', 'Anaïs', 'Marion', 'Morgane'],
    m: ['Lucas', 'Théo', 'Thomas', 'Hugo', 'Maxime', 'Alexandre', 'Kevin', 'Quentin', 'Antoine', 'Romain', 'Clément', 'Mehdi', 'Valentin', 'Florian', 'Baptiste', 'Enzo'],
  },
  {
    from: 2011, to: 2026,
    f: ['Emma', 'Jade', 'Louise', 'Alice', 'Lina', 'Rose', 'Ambre', 'Anna', 'Mia', 'Romy', 'Julia', 'Zoé', 'Léna', 'Iris', 'Nina', 'Agathe'],
    m: ['Gabriel', 'Raphaël', 'Léo', 'Louis', 'Adam', 'Arthur', 'Jules', 'Maël', 'Noah', 'Tom', 'Nathan', 'Paul', 'Liam', 'Aaron', 'Gabin', 'Timéo'],
  },
] as const;

export const FIRST_NAMES: readonly FirstName[] = GENERATIONS.flatMap((g) => [
  ...g.f.map((name): FirstName => ({ name, sex: 'f', from: g.from, to: g.to })),
  ...g.m.map((name): FirstName => ({ name, sex: 'm', from: g.from, to: g.to })),
]);

// Prénom tiré parmi ceux du sexe et de la génération de l'année de naissance, sans reprendre un prénom déjà pris dans le
// foyer. Génération épuisée (ou année hors table) : la génération la plus proche qui a encore un prénom libre.
export function firstNameFor(sex: Sex, birthYear: number, rng: () => number, taken: ReadonlySet<string>): string {
  const free = FIRST_NAMES.filter((n) => n.sex === sex && !taken.has(n.name));
  const gap = (n: FirstName) => (birthYear < n.from ? n.from - birthYear : birthYear > n.to ? birthYear - n.to : 0);
  const best = Math.min(...free.map(gap));
  const pool = free.filter((n) => gap(n) === best);
  return pool[Math.floor(rng() * pool.length)]!.name;
}
