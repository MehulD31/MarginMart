// All money is stored as integer paise. Convert only at the edges.
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** ?775 for whole rupees, ?5.50 otherwise. */
export const formatPaise = (paise: number): string => (paise % 100 === 0 ? inrWhole : inr).format(paise / 100)

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100)
