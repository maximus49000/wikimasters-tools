// ISBN-10 d'un ISBN-13 en 978 (la page produit d'Amazon.fr s'adresse par ISBN-10) ; undefined hors du préfixe 978 ou si la valeur est mal formée.
export function isbn10Of(isbn13: string): string | undefined {
  if (!/^978\d{10}$/.test(isbn13)) return undefined;
  const body = isbn13.slice(3, 12);
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? 'X' : String(check));
}
