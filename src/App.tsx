import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  MessageCircle,
  Truck,
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
    "⚡ Fortune Oil 1L ₹128 (MRP ₹142)",
    "💰 Surf Excel 1kg ₹98 (MRP ₹115)",
    "🔥 Parle-G 800g ₹72 (MRP ₹85)",
    "⚡ Tata Salt 1kg ₹18 (MRP ₹28)",
    "💰 Aashirvaad Atta 5kg ₹245 (MRP ₹295)",
    "🔥 Vim Bar 3-pack ₹38 (MRP ₹48)",
    "⚡ Dettol Soap 4-pack ₹165 (MRP ₹196)",
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
          <Bot size={14} /> AI-Powered Price Tracking
        </div>
        <h1>
          Supplier se <span className="highlight-green">sasta maal</span>,<br />
          seedha aapki <span className="highlight-orange">dukaan</span> pe
        </h1>
        <p className="hero-sub">
          Humara AI system rozana 100+ products ke prices track karta hai Zepto, Blinkit, JioMart & Amazon pe. Ya apni zaroorat batao — hum dhundh ke denge.
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
          Aaj Ki Price List Mangao
        </motion.a>
        <div className="hero-badges">
          <div className="hero-badge">
            <CheckCircle2 size={16} /> Free Delivery
          </div>
          <div className="hero-badge">
            <CheckCircle2 size={16} /> Koi Signup Fee Nahi
          </div>
          <div className="hero-badge">
            <CheckCircle2 size={16} /> COD / Online Payment
          </div>
          <div className="hero-badge">
            <CheckCircle2 size={16} /> 10 Min se 48hr Delivery
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
          <div className="stat-number">100+</div>
          <div className="stat-label">Products Tracked by AI Daily</div>
        </div>
        <div>
          <div className="stat-number">20%</div>
          <div className="stat-label">Average Savings</div>
        </div>
        <div>
          <div className="stat-number">10min</div>
          <div className="stat-label">Fastest Delivery (via Zepto/Blinkit)</div>
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
      <p className="section-sub">Har kirana owner in problems se guzarta hai — par ab solution hai</p>
      <div className="problem-grid">
        {[
          { emoji: "💸", title: "Supplier fixed rate pe bechta hai", desc: "Woh kabhi discount nahi deta, chahe market mein kitna bhi sasta ho. Aapka margin wahi ka wahi." },
          { emoji: "📱", title: "Online sasta hai, par kaise khareedein?", desc: "Blinkit pe ₹98, aap ₹115 mein lete ho. Par online order karke delivery manage karna mushkil hai." },
          { emoji: "😤", title: "Competition zyada, margin kam", desc: "Bagal wali dukaan ne rate gira diya, ab aap bhi girate ho. Profit zero." },
          { emoji: "⏰", title: "Time hi nahi milta", desc: "Subah se raat tak dukaan pe baithna padta hai. Deals dhundhne ka waqt kahan hai?" },
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
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📢</div>
          <div style={{ background: 'var(--green)', color: 'white', display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase' }}>Way 1</div>
          <h3 style={{ fontSize: '1.3rem', marginBottom: '0.75rem' }}>Hum Deals Bhejte Hain</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Rozana WhatsApp pe best deals aati hain — photo ke saath. Jo pasand aaye, reply karo aur order ho jaaye.
          </p>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {['Daily deals on WhatsApp', 'Photo + price attached', 'Bas reply karo = order done'].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
                  <CheckCircle2 size={15} color="var(--green)" /> {item}
                </div>
              ))}
            </div>
            <a
              href="https://wa.me/918871565551?text=Hi%2C%20I%20want%20to%20join%20the%20Daily%20Deals%20group"
              className="btn-whatsapp"
              style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', justifyContent: 'center' }}
              target="_blank"
              rel="noopener"
            >
              Join Deals Group
            </a>
          </div>
        </motion.div>

        <motion.div
          style={{ background: 'var(--orange-light)', border: '2px solid var(--orange)', borderRadius: 'var(--radius)', padding: '2.5rem 2rem', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
          <div style={{ background: 'var(--orange)', color: 'white', display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase' }}>Way 2</div>
          <h3 style={{ fontSize: '1.3rem', marginBottom: '0.75rem' }}>Aap Batao, Hum Dhundhein</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Apne top 10 best-selling products ya out-of-stock items ki list do. Hum AI se best price dhundh ke denge.
          </p>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {['Apni product list bhejo', 'Stock khatam hua? Hum laate hain', 'Best price guaranteed'].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
                  <CheckCircle2 size={15} color="var(--orange)" /> {item}
                </div>
              ))}
            </div>
            <a
              href="https://wa.me/918871565551?text=Hi%2C%20I%20want%20to%20share%20my%20product%20list%20to%20save%20money"
              className="btn-whatsapp"
              style={{ background: 'var(--orange)', padding: '0.6rem 1rem', fontSize: '0.9rem', justifyContent: 'center' }}
              target="_blank"
              rel="noopener"
            >
              Share Product List
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
    { emoji: "🍜", name: "Maggi Noodles (12pk)", supplier: "₹168", ours: "₹145", save: "₹23" },
    { emoji: "🫗", name: "Fortune Oil (1L)", supplier: "₹142", ours: "₹128", save: "₹14" },
    { emoji: "🧼", name: "Surf Excel (1kg)", supplier: "₹115", ours: "₹98", save: "₹17" },
    { emoji: "🍪", name: "Parle-G (800g)", supplier: "₹85", ours: "₹72", save: "₹13" },
    { emoji: "🧂", name: "Tata Salt (1kg)", supplier: "₹28", ours: "₹18", save: "₹10" },
    { emoji: "🌾", name: "Aashirvaad Atta (5kg)", supplier: "₹295", ours: "₹245", save: "₹50" },
    { emoji: "🧴", name: "Vim Bar (3-pack)", supplier: "₹48", ours: "₹38", save: "₹10" },
    { emoji: "🧼", name: "Dettol Soap (4-pack)", supplier: "₹196", ours: "₹165", save: "₹31" },
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
                  {p.name}
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
            Sirf 8 products pe <strong style={{ color: 'var(--green)' }}>₹168 saved</strong> — sochiye daily kitna bach sakta hai
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
          { num: "1", icon: <Bot size={20} />, title: "AI Prices Track Karta Hai", desc: "Humara AI automation system Zepto, Blinkit, JioMart, Amazon pe har product ka price 24/7 monitor karta hai" },
          { num: "2", icon: <MessageCircle size={20} />, title: "Deal ya Zaroorat — Dono Chalega", desc: "Hum daily deals bhejte hain WhatsApp pe. Ya aap apni product list / out-of-stock items bhejo — hum dhundh denge" },
          { num: "3", icon: <CheckCircle2 size={20} />, title: "Aap Order Karo", desc: "Bas reply karo kitna chahiye — koi app download, koi login nahi" },
          { num: "4", icon: <Truck size={20} />, title: "Dukaan Pe Delivery", desc: "10 minute se lekar 48 ghante mein delivery — source ke hisaab se. COD ya online payment, jo aapko suit kare." },
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
            text: "Pehle supplier se fixed rate pe leta tha. Ab MarginMart se 15-20% sasta mil jaata hai. Aur unka AI system itna fast hai — Zepto se order karo toh 10 minute mein aa jaata hai. Mahine ka ₹8,000-10,000 extra bach raha hai."
          },
          {
            name: "Sunil Sharma",
            loc: "Grocery Shop, Rohini",
            initial: "S",
            text: "WhatsApp pe daily deals aati hain. Jo chahiye wo reply kar deta hoon. Next day dukaan pe mil jaata hai. Bahut simple hai."
          },
          {
            name: "Priya Verma",
            loc: "General Store, Janakpuri",
            initial: "P",
            text: "Mujhe sabse accha yeh laga ki koi udhaar ka jhanjhat nahi. Cash on delivery hai. Aur prices sach mein kam hain."
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

// ─── App ───
export default function App() {
  return (
    <>
      <Ticker />
      <Navbar />
      <Hero />
      <StatsBar />
      <ProblemSection />
      <TwoWays />
      <PriceTable />
      <HowItWorks />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
      <FloatingWA />
    </>
  )
}
