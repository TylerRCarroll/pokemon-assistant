/** Case- and punctuation-insensitive substring match ("mr mime" finds "Mr. Mime") */
export function matches(name: string, query: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(name).includes(norm(query));
}
