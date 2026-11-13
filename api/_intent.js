// What does a plain (non-slash) group message want? Pure and unit-tested (scripts/ops/intent.test.mjs).
// Owners chat in the same group, so most messages are for each other: we answer only when the text clearly asks the bot
// something, and send only real Pepsi scheme messages to the (slow) scheme reader.
//   { kind: 'today' | 'yesterday' | 'week' | 'due' | 'stock' | 'sleeping' | 'reorder' | 'money' | 'menu' | 'sale_help', q? }
//   { kind: 'salesreport', period }   sales report PDF (period: till | month | lastmonth | week | lastweek | today)
//   { kind: 'scheme' }   looks like a Pepsi scheme/offer message (or was forwarded)
//   { kind: 'ask' }      a question for the bot -> AI answer from live numbers
//   { kind: 'unsure' }   long text, can't tell -> ask with two buttons
//   { kind: 'ignore' }   chit-chat between owners

const FILLER = /\b(ka|ki|ke|ko|kiska|kiski|kiske|kis|kaun|sab|sabse|zyada|jyada|kitna|kitni|kitne|hai|hain|h|kya|batao|bata|bolo|dikhao|check|karo|please|plz|bhai|ji|abhi|wala|wali|ab|tak|me|mein|se|aur|the|of|is|how|much|what|show|me)\b/gi
const clean = (s) => s.replace(/[?!.,:;]+/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim()

const SCHEME_WORDS = /\b(scheme|skim|offer|discount|disc|off|per\s*(case|cs|peti|box|crate)|\/\s*(case|cs|peti)|valid|validity|ptr|slab|free|qps|target|w\.?e\.?f|from\s+\d|till|upto|up\s*to|ctn|carton)\b/i
const PEPSI_WORDS = /\b(pepsi|7\s?up|mirinda|dew|mountain|sting|slice|tropicana|aquafina|nimbooz|lipton|gatorade|rgb|pet|can|csd|ml|ltr|litre|liter)\b/i
const ADDRESSED = /^(bot|kd\s*bot|kdbot|hey bot|ok bot)\b|@\w*bot\b/i
const QUESTION = /\?|\b(kya|kitna|kitni|kitne|kaun|kaunsa|kaunsi|kab|kaise|kyun|kyon|kahan|batao|bata do|bataiye|how|what|which|when|why|who)\b/i

export function detectIntent(text, { forwarded = false, replyToBot = false } = {}) {
  const t = String(text ?? '').trim()
  if (!t) return { kind: 'ignore' }
  const low = t.toLowerCase()
  const addressed = ADDRESSED.test(t) || replyToBot
  const body = low.replace(ADDRESSED, '').trim()

  // A Pepsi message pasted or forwarded: scheme words + a number + a Pepsi product, or forwarded with numbers.
  const hasNum = /\d/.test(t)
  if ((forwarded && hasNum && (SCHEME_WORDS.test(t) || PEPSI_WORDS.test(t))) || (hasNum && SCHEME_WORDS.test(t) && PEPSI_WORDS.test(t) && !QUESTION.test(body)))
    return { kind: 'scheme' }

  // Fast, free intents (Hinglish keywords).
  if (/^(menu|help|madad|start|commands?)$/.test(body)) return { kind: 'menu' }
  if (/\b(udhaa?r|udhar|baa?ki|bakaya|due|dues|outstanding|lena hai|paisa lena)\b/.test(body)) {
    const q = clean(body.replace(/\b(udhaa?r|udhar|baa?ki|bakaya|dues?|outstanding|lena hai|paisa lena|sabse zyada|sabka|kis dukan|dukan|shop|list|total)\b/g, ' '))
    return { kind: 'due', q: q.length >= 2 ? q : null }
  }
  // Company money held by a partner: "shobhit ke paas kitna paisa", "kiske paas paisa hai"
  if (/\b(paisa|paise|rupay|rupaye|money)\b/.test(body) && /\b(ke paas|kiske paas|kis ke paas|ke account|personal account|account me)\b/.test(body)) return { kind: 'money' }
  if (/\b(kya mangana|kya mangaye|kya mangwana|reorder|pepsi ko order|order bhej|order bana|order list|mangana hai)\b/.test(body)) return { kind: 'reorder' }
  if (/\b(sleeping|so rahi|so gayi|order nahi (kar|de|aa)|band (ho )?gayi|chup)\b/.test(body)) return { kind: 'sleeping' }
  if (/\b(stock|maal kitna|kitna maal|bacha|bachi|khatam)\b/.test(body)) {
    const q = clean(body.replace(/\b(stock|maal|kitna|bacha|bachi|khatam|hua|ho gaya|low|kam|wala|items?)\b/g, ' '))
    return { kind: 'stock', q: q.length >= 2 ? q : null }
  }
  // Sales report PDF: "sales report", "bikri report", "report pdf", "pdf bhejo", "is mahine ki sales report"
  if (/\b(sales report|bikri (ki )?report|bikri report|report pdf|pdf report|sales pdf|pdf bhej\w*|pdf do|pdf chahiye|poori report|full report)\b/.test(body)) {
    const period = /\b(pichhle|pichle|last) (mahine|month)\b/.test(body) ? 'lastmonth' : /\b(mahina|mahine|month)\b/.test(body) ? 'month'
      : /\b(pichhle|pichle|last) (hafte|week)\b/.test(body) ? 'lastweek' : /\b(hafta|hafte|week|7 din)\b/.test(body) ? 'week' : /\b(aaj|today)\b/.test(body) ? 'today' : 'till'
    return { kind: 'salesreport', period }
  }
  if (/\b(hafta|hafte|week|weekly|7 din|saat din)\b/.test(body)) return { kind: 'week' }
  if (/\b(kal ka|kal ki|yesterday)\b.*\b(hisaab|hisab|report|bikri|sale|kitna|kitni)\b|\b(hisaab|hisab|report|bikri)\b.*\b(kal ka|kal ki|yesterday)\b/.test(body)) return { kind: 'yesterday' }
  if (/\b(aaj|today|abhi tak)\b.*\b(hisaab|hisab|report|bikri|sale|kitna|kitni|peti|collection|vasooli)\b|^(hisaab|hisab|report|aaj ka hisaab)$/.test(body)) return { kind: 'today' }
  if (/\b(sale (kaise|likh)|bikri likh|becha|bechi|sale add|sale entry)\b/.test(body)) return { kind: 'sale_help' }

  if (addressed && body.length > 1) return { kind: 'ask' }
  if (QUESTION.test(body) && body.length <= 300 && /\b(sale|bikri|peti|crate|stock|maal|dukan|shop|order|udhaa?r|paisa|cash|upi|margin|profit|munafa|truck|route|driver|scheme|pepsi|sting|dew|slice|rate|price)\b/.test(body))
    return { kind: 'ask' }
  if (t.length > 160 && hasNum) return { kind: 'unsure' }
  return { kind: 'ignore' }
}
