import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  MessageCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Phone,
  AlertTriangle,
  Bot
} from 'lucide-react'
import './index.css'

/* ============================================
   MARGINMART — High-Conversion Landing Page
   Target: Local Kirana Shopkeepers
   Goal: Get them to WhatsApp us
   ============================================ */

const WA_LINK = "https://wa.me/918871565551?text=Hi%2C%20I%20want%20today's%20price%20list"

// ─── Ticker ───
const Ticker = () => {
  const items = [
    "🔥 Maggi 12-pack ₹145 (MRP ₹168)",
    "👟 Skechers Sneakers 40% OFF on Amazon",
    "🌸 Engage Perfume Set ₹299 (MRP ₹599)",
    "⚡ Fortune Oil 1L ₹128 (MRP ₹142)",
    "👗 Myntra Fashion — Up to 60% OFF",
    "💰 Surf Excel 1kg ₹98 (MRP ₹115)",
    "🎧 Boat Earphones ₹799 (MRP ₹1499)",
    "🛍️ Ajio Brand Sale — Extra 30% OFF",
    "🔥 Parle-G 800g ₹72 (MRP ₹85)",
    "🫖 Electric Kettle ₹449 (MRP ₹999)",
    "⚡ Dettol Soap 4-pack ₹165 (MRP ₹196)",
    "💰 Aashirvaad Atta 5kg ₹245 (MRP ₹295)",
    "👖 Levis Jeans Flat 50% OFF — Flipkart",
    "🧴 Mamaearth Kit ₹399 (MRP ₹799)",
  ]
  const doubled = [...items, ...items]

  return (
    <div className="ticker-wrap">
      <div className="ticker-content">
        {doubled.map((item, i) => (
          <span className="ticker-item" key={i}>{item}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Navbar ───
const Navbar = () => (
  <nav className="navbar">
    <div className="container navbar-inner">
      <div className="logo">
        <div className="logo-icon">
          <TrendingUp size={20} />
        </div>
        <span>Margin<span className="logo-green">Mart</span></span>
      </div>
      <a href={WA_LINK} className="btn-whatsapp btn-whatsapp-nav" target="_blank" rel="noopener">
        <Phone size={16} />
        Contact Us
      </a>
    </div>
  </nav>
)

// ─── Hero ───
const Hero = () => (
  <section className="hero">
    <div className="container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.4rem 1rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--green)', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <Bot size={14} /> AI-Powered Deal Sourcing — 7 Platforms
        </div>
        <h1>
          Har category ka <span className="highlight-green">sasta maal</span>,<br />
          seedha aapki <span className="highlight-orange">dukaan</span> pe
        </h1>
        <p className="hero-sub">
          Grocery, Fashion, Electronics, Beauty — rozana WhatsApp Community pe deals aati hain product photo ke saath. Ya apni zaroorat batao — hum 7+ platforms scan karke best price dhundh denge.
        </p>
        <motion.a
          href={WA_LINK}
          className="btn-whatsapp btn-whatsapp-lg"
          target="_blank"
          rel="noopener"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <MessageCircle size={22} fill="white" />
          Aaj Ki Deals WhatsApp Pe Mangao
        </motion.a>
        <div className="hero-badges">
          <div className="hero-badge">
            <CheckCircle2 size={16} /> Koi Signup Fee Nahi
          </div>
          <div className="hero-badge">
            <CheckCircle2 size={16} /> COD / Online Payment
          </div>
          <div className="hero-badge">
            <CheckCircle2 size={16} /> 10+ Categories Covered
          </div>
          <div className="hero-badge">
            <CheckCircle2 size={16} /> AI-Verified Deals
          </div>
        </div>
      </motion.div>
    </div>
  </section>
)

// ─── Stats Bar ───
const StatsBar = () => (
  <section className="stats-bar">
    <div className="container">
      <div className="stats-grid">
        <div>
          <div className="stat-number">500+</div>
          <div className="stat-label">Deals Tracked by AI Daily</div>
        </div>
        <div>
          <div className="stat-number">7</div>
          <div className="stat-label">Platforms Monitored</div>
        </div>
        <div>
          <div className="stat-number">10+</div>
          <div className="stat-label">Product Categories</div>
        </div>
      </div>
    </div>
  </section>
)

// ─── Problem Section ───
const ProblemSection = () => (
  <section className="section">
    <div className="container">
      <h2 className="section-title">Yeh problems toh aapki bhi hain?</h2>
      <p className="section-sub">Chahe grocery ho, fashion ho, ya electronics — har chhote dukandaar ko yeh problems face karni padti hain</p>
      <div className="problem-grid">
        {[
          { emoji: "💸", title: "Supplier fixed rate pe bechta hai", desc: "Woh kabhi discount nahi deta, chahe Amazon ya Flipkart pe kitna bhi sasta ho. Aapka margin wahi ka wahi." },
          { emoji: "🛍️", title: "Online deals miss ho jaati hain", desc: "Amazon, Myntra, Ajio pe flash sales aati hain — aapko pata bhi nahi chalta. Deal khatam, mauka gaya." },
          { emoji: "😤", title: "Competition zyada, margin kam", desc: "Bagal wali dukaan ne rate gira diya, ab aap bhi girate ho. Grocery se lekar garments tak — har jagah same problem." },
          { emoji: "⏰", title: "Time hi nahi milta", desc: "Subah se raat tak dukaan pe baithna padta hai. 7 platforms pe deals dhundhne ka waqt kahan hai?" },
        ].map((item, i) => (
          <motion.div
            key={i}
            className="problem-card"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            viewport={{ once: true }}
          >
            <div className="problem-emoji">{item.emoji}</div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
)

// ─── Categories Section ───
const CategoriesSection = () => {
  const cats = [
    { emoji: "🛒", label: "Grocery & FMCG", sub: "Zepto, Blinkit, JioMart" },
    { emoji: "👗", label: "Fashion & Clothing", sub: "Myntra, Ajio, Flipkart" },
    { emoji: "📱", label: "Electronics & Gadgets", sub: "Amazon, Flipkart" },
    { emoji: "💄", label: "Beauty & Skincare", sub: "Nykaa, Amazon, Myntra" },
    { emoji: "👟", label: "Footwear", sub: "Amazon, Ajio, Myntra" },
    { emoji: "🏠", label: "Home & Kitchen", sub: "Amazon, Flipkart" },
    { emoji: "🧴", label: "Health & Hygiene", sub: "All Platforms" },
    { emoji: "🎒", label: "Bags & Accessories", sub: "Ajio, Myntra, Amazon" },
  ]
  return (
    <section className="section section-categories">
      <div className="container">
        <h2 className="section-title">10+ Categories, Ek Jagah Se</h2>
        <p className="section-sub">Sirf grocery nahi — har tarah ke products ke best deals, directly aapke WhatsApp pe</p>
        <div className="categories-grid">
          {cats.map((c, i) => (
            <motion.div
              key={i}
              className="category-card"
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.07 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
            >
              <div className="category-emoji">{c.emoji}</div>
              <div className="category-label">{c.label}</div>
              <div className="category-sub">{c.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Two Ways Section ───
const TwoWays = () => (
  <section className="section section-alt">
    <div className="container">
      <h2 className="section-title">2 Tarike se Kaam Karta Hai</h2>
      <p className="section-sub">Aap choose karo — dono free hain</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <motion.div
          style={{ background: 'var(--green-light)', border: '2px solid var(--green)', borderRadius: 'var(--radius)', padding: '2.5rem 2rem', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>👥</div>
          <div style={{ background: 'var(--green)', color: 'white', display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase' }}>Way 1</div>
          <h3 style={{ fontSize: '1.3rem', marginBottom: '0.75rem' }}>WhatsApp Community Join Karo</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Hamare WhatsApp Community mein shamil ho jao. Rozana product photos aur prices aate hain — jo deal pasand aaye, us message pe reply karo. Hum order place karke aapki dukaan pe deliver kar denge.
          </p>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {['Community mein join karo — free', 'Daily deals: photo + price milega', 'Deal pasand aaya? Bas reply karo', 'Hum order place karke deliver karenge'].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
                  <CheckCircle2 size={15} color="var(--green)" /> {item}
                </div>
              ))}
            </div>
            <a
              href="https://wa.me/918871565551?text=Hi%2C%20I%20want%20to%20join%20the%20MarginMart%20WhatsApp%20Community"
              className="btn-whatsapp"
              style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', justifyContent: 'center' }}
              target="_blank"
              rel="noopener"
            >
              Community Mein Join Karo
            </a>
          </div>
        </motion.div>

        <motion.div
          style={{ background: 'var(--orange-light)', border: '2px solid var(--orange)', borderRadius: 'var(--radius)', padding: '2.5rem 2rem', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
          <div style={{ background: 'var(--orange)', color: 'white', display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase' }}>Way 2</div>
          <h3 style={{ fontSize: '1.3rem', marginBottom: '0.75rem' }}>Apni Zaroorat Batao, Hum Dhundhein</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Jo product chahiye uska naam WhatsApp pe bhejo. Hum Amazon, Flipkart, Myntra, Ajio, Zepto, Blinkit aur JioMart — sabhi jagah scan karke sabse sasta option aapko batayenge.
          </p>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {['Product ka naam bhejo', 'Hum 7+ platforms scan karenge', 'Best price confirm hone ke baad order', 'Seedha dukaan pe delivery'].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
                  <CheckCircle2 size={15} color="var(--orange)" /> {item}
                </div>
              ))}
            </div>
            <a
              href="https://wa.me/918871565551?text=Hi%2C%20mujhe%20kuch%20products%20chahiye%2C%20kya%20aap%20best%20price%20dhundh%20sakte%20ho%3F"
              className="btn-whatsapp"
              style={{ background: 'var(--orange)', padding: '0.6rem 1rem', fontSize: '0.9rem', justifyContent: 'center' }}
              target="_blank"
              rel="noopener"
            >
              Apni Zaroorat Bhejo
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
)

// ─── Price Comparison Table ───
const PriceTable = () => {
  const products = [
    { emoji: "🍜", name: "Maggi Noodles (12pk)", supplier: "₹168", ours: "₹145", save: "₹23", cat: "Grocery" },
    { emoji: "👟", name: "Skechers Sneakers (Men's)", supplier: "₹3999", ours: "₹2399", save: "₹1600", cat: "Footwear" },
    { emoji: "🌸", name: "Engage Perfume Set", supplier: "₹599", ours: "₹299", save: "₹300", cat: "Beauty" },
    { emoji: "🎧", name: "boAt Earphones (BassHeads)", supplier: "₹1499", ours: "₹799", save: "₹700", cat: "Electronics" },
    { emoji: "👖", name: "Levis Women Jeans", supplier: "₹2999", ours: "₹1499", save: "₹1500", cat: "Fashion" },
    { emoji: "🫖", name: "Electric Kettle 1.5L", supplier: "₹999", ours: "₹449", save: "₹550", cat: "Home" },
    { emoji: "🧴", name: "Mamaearth Skincare Kit", supplier: "₹799", ours: "₹399", save: "₹400", cat: "Beauty" },
    { emoji: "🌾", name: "Aashirvaad Atta (5kg)", supplier: "₹295", ours: "₹245", save: "₹50", cat: "Grocery" },
  ]

  return (
    <section className="section section-alt">
      <div className="container">
        <h2 className="section-title">Kitna bachega? Khud dekho 👇</h2>
        <p className="section-sub">Real prices jo humne last week track kiye — aapke supplier se compare karo</p>

        <div className="price-table-wrapper">
          <motion.div
            className="price-table"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="price-table-header">
              <span>Product</span>
              <span>Supplier</span>
              <span>Our Price</span>
              <span>Savings</span>
            </div>
            {products.map((p, i) => (
              <div className="price-row" key={i}>
                <div className="product-name">
                  <span className="product-emoji">{p.emoji}</span>
                  <span>
                    {p.name}
                    <span className="cat-pill">{p.cat}</span>
                  </span>
                </div>
                <div className="old-price">{p.supplier}</div>
                <div className="new-price">{p.ours}</div>
                <div><span className="savings-badge">{p.save}</span></div>
              </div>
            ))}
          </motion.div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.95rem' }}>
            Sirf 8 items pe <strong style={{ color: 'var(--green)' }}>₹5,123 saved</strong> — grocery se lekar fashion tak, sab sasta
          </p>
          <a href={WA_LINK} className="btn-whatsapp" target="_blank" rel="noopener">
            <MessageCircle size={18} fill="white" />
            Full Price List WhatsApp pe Mangao
          </a>
        </div>
      </div>
    </section>
  )
}

// ─── How It Works ───
const HowItWorks = () => (
  <section className="section">
    <div className="container">
      <h2 className="section-title">Kaam kaise hota hai?</h2>
      <p className="section-sub">4 simple steps — aapko kuch nahi karna, bas order do</p>

      <div className="steps-grid">
        {[
          { num: "1", title: "Community Join Karo ya Requirement Bhejo", desc: "WhatsApp Community mein join karo daily deals ke liye — ya seedha apni product requirement hume message karo." },
          { num: "2", title: "Deal Dekho ya Hum Scan Karte Hain", desc: "Community mein rozana product photos + prices aate hain. Ya aapki requirement ke liye hum Amazon, Flipkart, Myntra, Ajio, Zepto, Blinkit, JioMart — sabhi check karte hain." },
          { num: "3", title: "Reply Karo — Order Ho Jaata Hai", desc: "Jo deal chahiye us message pe reply karo, ya hum best price confirm karne ke baad aapka order place karte hain. Koi app, koi login nahi." },
          { num: "4", title: "Dukaan Pe Delivery", desc: "COD ya online payment — jo suit kare. 10 minute se lekar 48 ghante mein delivery, source ke hisaab se." },
        ].map((step, i) => (
          <motion.div
            key={i}
            className="step-card"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12 }}
            viewport={{ once: true }}
          >
            <div className="step-number">{step.num}</div>
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
)

// ─── Testimonials ───
const Testimonials = () => (
  <section className="section section-alt">
    <div className="container">
      <h2 className="section-title">Dukandaar kya bol rahe hain</h2>
      <p className="section-sub">Jo log already use kar rahe hain unka experience</p>

      <div className="testimonial-grid">
        {[
          {
            name: "Ramesh Gupta",
            loc: "Kirana Store, Dwarka",
            initial: "R",
            text: "Pehle sirf grocery pe dhyan tha. Ab MarginMart se grocery ke saath electronics aur beauty products bhi saste milte hain. Mahine ka ₹12,000 extra bach raha hai across categories."
          },
          {
            name: "Neha Kapoor",
            loc: "Fashion Boutique, Lajpat Nagar",
            initial: "N",
            text: "Myntra aur Ajio pe jo deals aati hain woh mujhe pehle miss ho jaati thi. Ab WhatsApp pe seedha aa jaati hai. Maine apne boutique ke liye 40% saste mein stock kiya."
          },
          {
            name: "Priya Verma",
            loc: "General Store, Janakpuri",
            initial: "P",
            text: "Grocery se shuru ki thi, par ab electronics aur home products bhi yahan se leti hoon. COD hai toh risk bhi nahi. Sach mein useful service hai."
          },
        ].map((t, i) => (
          <motion.div
            key={i}
            className="testimonial-card"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            viewport={{ once: true }}
          >
            <div className="testimonial-stars">★★★★★</div>
            <p className="testimonial-text">"{t.text}"</p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">{t.initial}</div>
              <div>
                <div className="testimonial-name">{t.name}</div>
                <div className="testimonial-loc">{t.loc}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
)

// ─── Platforms Section ───
const PlatformsSection = () => {
  const platforms = [
    { name: "Amazon", emoji: "📦", color: "#FF9900" },
    { name: "Flipkart", emoji: "🛍️", color: "#2874F0" },
    { name: "Myntra", emoji: "👗", color: "#FF3F6C" },
    { name: "Ajio", emoji: "👠", color: "#E84E1B" },
    { name: "Zepto", emoji: "⚡", color: "#8B5CF6" },
    { name: "Blinkit", emoji: "💛", color: "#F59E0B" },
    { name: "JioMart", emoji: "🛒", color: "#0070C0" },
  ]
  return (
    <section className="section section-alt section-platforms">
      <div className="container">
        <h2 className="section-title">7 Platforms, Ek WhatsApp</h2>
        <p className="section-sub">Hum in sabhi platforms pe deals monitor karte hain — aapko sirf hume message karna hai</p>
        <div className="platforms-grid">
          {platforms.map((p, i) => (
            <motion.div
              key={i}
              className="platform-card"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              viewport={{ once: true }}
              whileHover={{ y: -3 }}
            >
              <div className="platform-emoji">{p.emoji}</div>
              <div className="platform-name" style={{ color: p.color }}>{p.name}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}


// ─── FAQ ───
const FAQ = () => {
  const [open, setOpen] = useState<number | null>(null)

  const faqs = [
    {
      q: "Kya mujhe apna existing supplier chhodna padega?",
      a: "Bilkul nahi. Hum keh rahe hain — apne supplier se bhi lo, par jo cheezein humse sasti mil rahi hain woh humse le lo. Dono saath chal sakta hai."
    },
    {
      q: "Minimum kitna order karna padega?",
      a: "Koi minimum order nahi hai. Aapko jo chahiye — 1 packet bhi ho ya 100 — hum deliver karenge."
    },
    {
      q: "Payment kaise hoga?",
      a: "Dono option hain — Cash on Delivery (COD) ya Online Payment (UPI/GPay). Jab maal aapki dukaan pe aaye, tab paisa do. Koi advance nahi lagta."
    },
    {
      q: "Delivery kitne time mein hoti hai?",
      a: "Yeh depend karta hai sourcing pe. Agar Zepto/Blinkit se mil raha hai toh 10 minute mein bhi aa sakta hai. Agar wholesale ya Amazon se source ho raha hai toh 24-48 ghante lagte hain. Har deal ke saath delivery time bata dete hain."
    },
    {
      q: "Yeh products original hain ya duplicate?",
      a: "100% original branded products. Yeh same products hain jo Blinkit aur JioMart pe milte hain — hum wahan se best deals pick karke aapko dete hain."
    },
    {
      q: "Koi signup fee ya subscription hai?",
      a: "Nahi, bilkul free hai. Koi hidden charges nahi. Aap sirf product ka price pay karo."
    },
    {
      q: "Kya main apni zaroorat ke products maang sakta hoon?",
      a: "Haan bilkul! Aap do tarike se use kar sakte ho: (1) Hum daily deals bhejte hain WhatsApp pe, ya (2) Aap apne top 10 best-selling products ya jo stock khatam ho gaya uski list bhejo — humara AI system best price dhundh ke aapko batayega."
    },
  ]

  return (
    <section className="section">
      <div className="container">
        <h2 className="section-title">Aksar Poochhe Jaane Wale Sawaal</h2>
        <p className="section-sub">Aapke mann mein jo bhi doubt ho, yahan dekho</p>

        <div className="faq-list">
          {faqs.map((faq, i) => (
            <div className="faq-item" key={i}>
              <button
                className="faq-question"
                onClick={() => setOpen(open === i ? null : i)}
              >
                {faq.q}
                {open === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {open === i && (
                <motion.div
                  className="faq-answer"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.2 }}
                >
                  {faq.a}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}


// ─── Savings Calculator ───
const SavingsCalculator = () => {
  const [spend, setSpend] = useState(50000)
  const savings = Math.round(spend * 0.18)
  const yearly = savings * 12

  return (
    <section className="section section-alt">
      <div className="container">
        <h2 className="section-title">Mahine mein kitna bachega? 🧮</h2>
        <p className="section-sub">Apna monthly stock purchase enter karo — hum batate hain kitna profit badhega</p>
        <motion.div
          className="calc-box"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="calc-label">Aapka monthly stock purchase (₹)</div>
          <div className="calc-slider-row">
            <span className="calc-min">₹10k</span>
            <input
              id="savings-slider"
              type="range"
              min={10000}
              max={500000}
              step={5000}
              value={spend}
              onChange={e => setSpend(Number(e.target.value))}
              className="calc-slider"
            />
            <span className="calc-max">₹5L</span>
          </div>
          <div className="calc-spend">₹{spend.toLocaleString('en-IN')}</div>
          <div className="calc-results">
            <div className="calc-result-card">
              <div className="calc-result-num" style={{ color: 'var(--green)' }}>
                ₹{savings.toLocaleString('en-IN')}
              </div>
              <div className="calc-result-label">Monthly Savings (avg 18%)</div>
            </div>
            <div className="calc-divider">×12</div>
            <div className="calc-result-card">
              <div className="calc-result-num" style={{ color: 'var(--orange)' }}>
                ₹{yearly.toLocaleString('en-IN')}
              </div>
              <div className="calc-result-label">Yearly Extra Profit</div>
            </div>
          </div>
          <a href={WA_LINK} className="btn-whatsapp" style={{ justifyContent: 'center', marginTop: '1.5rem' }} target="_blank" rel="noopener">
            <MessageCircle size={18} fill="white" />
            Yeh Savings Shuru Karo — WhatsApp Pe
          </a>
        </motion.div>
      </div>
    </section>
  )
}

// ─── Trust Bar ───
const TrustBar = () => (
  <section className="trust-bar">
    <div className="container">
      <div className="trust-grid">
        {[
          { emoji: "✅", text: "100% Original Products" },
          { emoji: "💵", text: "Cash on Delivery" },
          { emoji: "🔒", text: "No Advance Payment" },
          { emoji: "🤖", text: "AI-Verified Deals" },
          { emoji: "⭐", text: "500+ Happy Retailers" },
        ].map((t, i) => (
          <div key={i} className="trust-item">
            <span>{t.emoji}</span> {t.text}
          </div>
        ))}
      </div>
    </div>
  </section>
)

// ─── Social Proof Toast ───
const toasts = [
  { name: "Ramesh", loc: "Dwarka", item: "Grocery stock", saved: "₹2,400" },
  { name: "Neha", loc: "Lajpat Nagar", item: "Fashion items", saved: "₹3,800" },
  { name: "Sunil", loc: "Rohini", item: "Electronics", saved: "₹1,900" },
  { name: "Priya", loc: "Janakpuri", item: "Beauty kit", saved: "₹1,200" },
  { name: "Arjun", loc: "Karol Bagh", item: "Home appliances", saved: "₹4,500" },
]

const SocialProofToast = () => {
  const [visible, setVisible] = useState(false)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const show = () => {
      setIdx(i => (i + 1) % toasts.length)
      setVisible(true)
      setTimeout(() => setVisible(false), 4000)
    }
    const timer = setInterval(show, 7000)
    const initial = setTimeout(show, 3000)
    return () => { clearInterval(timer); clearTimeout(initial) }
  }, [])

  const t = toasts[idx]
  return (
    <motion.div
      className="social-toast"
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 20 }}
      transition={{ duration: 0.4 }}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
    >
      <div className="toast-avatar">{t.name[0]}</div>
      <div>
        <div className="toast-name">{t.name} from {t.loc}</div>
        <div className="toast-msg">{t.item} pe <strong>{t.saved}</strong> bachaya 🎉</div>
      </div>
    </motion.div>
  )
}

// ─── Final CTA ───
const FinalCTA = () => (
  <section className="final-cta">
    <div className="container">
      <motion.div
        className="final-cta-box"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <div className="urgency-tag">
          <AlertTriangle size={14} />
          Har area mein sirf 50 dukaan ko offer
        </div>
        <h2>Aaj hi apna profit badhao</h2>
        <p>WhatsApp pe message karo aur turant aaj ki price list lo. Koi charge nahi, koi commitment nahi.</p>
        <motion.a
          href={WA_LINK}
          className="btn-whatsapp btn-whatsapp-lg"
          target="_blank"
          rel="noopener"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <MessageCircle size={22} fill="white" />
          WhatsApp Pe Price List Lo
        </motion.a>
      </motion.div>
    </div>
  </section>
)

// ─── Footer ───
const Footer = () => (
  <footer className="footer">
    <div className="container">
      <div className="logo" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
        <div className="logo-icon">
          <TrendingUp size={18} />
        </div>
        <span>Margin<span className="logo-green">Mart</span></span>
      </div>
      <p>Aapka maal sasta, margin zyada.</p>
      <p style={{ marginTop: '0.5rem' }}>© 2026 MarginMart. All rights reserved.</p>
    </div>
  </footer>
)

// ─── Floating WhatsApp ───
const FloatingWA = () => (
  <a href={WA_LINK} className="floating-wa" target="_blank" rel="noopener" title="WhatsApp pe message karo">
    <MessageCircle size={28} fill="white" />
  </a>
)

// ─── Sticky Mobile CTA ───
const StickyCTA = () => (
  <div className="sticky-cta">
    <a href={WA_LINK} className="sticky-cta-btn" target="_blank" rel="noopener">
      <MessageCircle size={20} fill="white" />
      WhatsApp Pe Deals Lo — Free
    </a>
  </div>
)

// ─── App ───
export default function App() {
  return (
    <>
      <SocialProofToast />
      <Ticker />
      <Navbar />
      <TrustBar />
      <Hero />
      <StatsBar />
      <ProblemSection />
      <CategoriesSection />
      <TwoWays />
      <PriceTable />
      <SavingsCalculator />
      <HowItWorks />
      <PlatformsSection />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
      <FloatingWA />
      <StickyCTA />
    </>
  )
}
