// Common typos seen in real shop names (Nov 2026 clean-up fixed 76 of them). Used to suggest a fix while typing.
const FIX: Record<string, string> = {
  needa: 'Needs', nesds: 'Needs', neess: 'Needs', neds: 'Needs', nees: 'Needs', genreal: 'General', genral: 'General',
  kirama: 'Kirana', kirna: 'Kirana', provisiom: 'Provision', stor: 'Store', stote: 'Store', syore: 'Store', stroe: 'Store',
  palce: 'Palace', bhojnaly: 'Bhojnalay', restaurent: 'Restaurant', resturant: 'Restaurant', conferensary: 'Confectionery',
  confectionnery: 'Confectionery', confectionary: 'Confectionery', trasers: 'Traders', tradres: 'Traders', cornee: 'Corner',
  cookis: 'Cookies', jotel: 'Hotel', hotal: 'Hotel', bakars: 'Bakers', fency: 'Fancy', hedrabadi: 'Hyderabadi', testy: 'Tasty',
  daliy: 'Daily', dialy: 'Daily', swets: 'Sweets',
}
/** The name with known typos fixed, or null when nothing needs fixing. Keeps every other word as typed. */
export function suggestName(name: string): string | null {
  let changed = false
  const out = name.replace(/[A-Za-z]+/g, (w) => {
    const g = FIX[w.toLowerCase()]
    if (!g) return w
    changed = true
    return w === w.toLowerCase() ? g.toLowerCase() : g
  })
  return changed ? out : null
}
