import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Users,
  X,
  Search,
  Loader2,
  ArrowLeft,
  Bell,
  Phone,
  ChevronRight,
  Edit2,
  Zap,
  Target,
  CheckCircle,
  AlertCircle,
  Lock,
  Download,
  History,
  IndianRupee,
  TrendingUp,
  Clock,
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  ShoppingBag,
  FileText,
  Send
} from 'lucide-react';

interface Shopkeeper {
  id: string;
  name: string;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
  operator_name?: string;
}

interface WatchlistItem {
  id: string;
  shopkeeper_id: string;
  product_name: string;
  keywords: string[];
  operator_name?: string;
}

interface Match {
  id: string;
  shopkeeper_id: string;
  product_name: string;
  matched_keyword: string;
  original_text: string;
  telegram_link?: string;
  created_at: string;
  operator_name?: string;
  shopkeeper?: { name: string };
}

interface Order {
  id: string;
  shopkeeper_id: string;
  product_name: string;
  deal_price: number;
  selling_price: number;
  status: 'ordered' | 'delivered' | 'paid';
  created_at: string;
  operator_name?: string;
  shopkeeper?: { name: string };
}

const TEMPLATE_KEYWORDS = ["Dove", "Maggi", "Pampers", "Atta", "Surf Excel", "Cooking Oil", "Rice", "Sugar", "Shampoo", "Soap"];

export default function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pin, setPin] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'shopkeepers' | 'simulator' | 'orders' | 'billing' | 'matches' | 'automation'>('overview');
  const [shopkeepers, setShopkeepers] = useState<Shopkeeper[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedShopkeeper, setSelectedShopkeeper] = useState<Shopkeeper | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedBillPartner, setSelectedBillPartner] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [operatorName, setOperatorName] = useState(localStorage.getItem('mm_operator_name') || '');
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [orderPartner, setOrderPartner] = useState<Shopkeeper | null>(null);

  const [loginError, setLoginError] = useState(false);
  const [monitorChannels, setMonitorChannels] = useState('deals');
  const [_isBotActive, setIsBotActive] = useState(false);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }

  // Order Form
  const [orderForm, setOrderForm] = useState({ product_name: '', deal_price: '', selling_price: '' });

  // Simulator State
  const [simText, setSimText] = useState('');
  const [simResults, setSimResults] = useState<{ name: string, match: string }[]>([]);

  // Shopkeeper Form
  const [formState, setFormState] = useState({ id: '', name: '', phone: '', address: '' });

  // Watchlist Editing
  const [newProduct, setNewProduct] = useState('');

  useEffect(() => {
    if (isAuthorized) {
      fetchShopkeepers();
      fetchOrders();
      fetchMatches();
      fetchTelegramConfig();
    }
  }, [isAuthorized]);

  async function checkPin() {
    const { data } = await supabase.from('admin_settings').select('value').eq('key', 'admin_pin').single();
    if (data && data.value === pin) {
      setIsAuthorized(true);
      showToast('Welcome back, Admin!');
    }
    else {
      setLoginError(true);
      showToast('ERROR: WRONG PIN', 'error');
      setPin('');
      setTimeout(() => setLoginError(false), 3000);
    }
  }

  async function fetchTelegramConfig() {
    const { data } = await supabase.from('telegram_configs').select('*');
    if (data) {
      const active = data.find(c => c.key === 'is_active')?.value === 'true';
      const channels = data.find(c => c.key === 'monitor_channels')?.value || 'deals';
      setIsBotActive(active);
      setMonitorChannels(channels);
    }
  }


  async function saveMonitorChannels() {
    setSaving(true);
    const { error } = await supabase.from('telegram_configs').upsert([
      { key: 'monitor_channels', value: monitorChannels }
    ]);
    if (error) showToast('Failed to save channels', 'error');
    else showToast('Spy Channels Updated!', 'success');
    setSaving(false);
  }

  async function fetchShopkeepers() {
    setLoading(true);
    const { data, error } = await supabase.from('shopkeepers').select('*').order('name');
    if (error) showToast('Failed to load partners', 'error');
    if (data) setShopkeepers(data);
    setLoading(false);
  }

  async function fetchOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*, shopkeeper:shopkeepers(name)')
      .order('created_at', { ascending: false });
    if (error) showToast('Failed to load orders', 'error');
    if (data) setOrders(data);
  }

  async function fetchMatches() {
    const { data, error } = await supabase
      .from('matches')
      .select('*, shopkeeper:shopkeepers(name)')
      .order('created_at', { ascending: false });
    if (error) showToast('Failed to load activity log', 'error');
    if (data) setMatches(data);
  }

  async function updateOrderStatus(orderId: string, status: 'ordered' | 'delivered' | 'paid') {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (!error) {
      fetchOrders();
      showToast(`Order status updated to ${status}`);
    } else {
      showToast('Failed to update status', 'error');
    }
  }

  async function handleSaveShopkeeper(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { id, name, phone, address } = formState;
    let res;
    if (id) res = await supabase.from('shopkeepers').update({ name, phone, address }).eq('id', id);
    else res = await supabase.from('shopkeepers').insert([{
      name, phone, address,
      operator_name: operatorName || 'Admin'
    }]);

    if (!res.error) {
      showToast(id ? 'Partner profile updated' : 'New partner added successfully');
      setShowAddModal(false); setShowEditModal(false); fetchShopkeepers();
    } else {
      showToast('Error saving partner data', 'error');
    }
    setSaving(false);
  }

  async function logOrder(e: React.FormEvent) {
    e.preventDefault();
    const partner = orderPartner || selectedShopkeeper;
    if (!partner) return;
    setSaving(true);
    const { error } = await supabase.from('orders').insert([{
      shopkeeper_id: partner.id,
      product_name: orderForm.product_name,
      deal_price: parseFloat(orderForm.deal_price),
      selling_price: parseFloat(orderForm.selling_price),
      status: 'ordered',
      operator_name: operatorName || 'Admin'
    }]);

    if (!error) {
      showToast(`Logged order for ${orderForm.product_name}`);
      setShowOrderModal(false); setOrderPartner(null);
      setOrderForm({ product_name: '', deal_price: '', selling_price: '' });
      fetchOrders();
    } else {
      showToast('Failed to log fulfillment', 'error');
    }
    setSaving(false);
  }

  async function fetchWatchlist(shopkeeperId: string) {
    const { data } = await supabase.from('watchlists').select('*').eq('shopkeeper_id', shopkeeperId);
    setWatchlist(data || []);
  }

  async function addToWatchlist(product: string) {
    if (!selectedShopkeeper || !product.trim()) return;


    const keywords = product.split(',').map(k => k.trim()).filter(k => k);
    const { error } = await supabase.from('watchlists').insert([{
      shopkeeper_id: selectedShopkeeper.id,
      product_name: keywords[0] || product.trim(),
      keywords: keywords,
      operator_name: operatorName || 'Admin'
    }]);

    if (!error) {
      showToast(`Added ${keywords[0]} to watchlist`);
      setNewProduct(''); fetchWatchlist(selectedShopkeeper.id);
    } else {
      showToast('Error adding product', 'error');
    }
  }

  async function removeFromWatchlist(id: string) {
    const { error } = await supabase.from('watchlists').delete().eq('id', id);
    if (!error) {
      showToast('Product removed from watchlist');
      if (selectedShopkeeper) fetchWatchlist(selectedShopkeeper.id);
    } else {
      showToast('Error removing product', 'error');
    }
  }

  async function runSimulator() {
    if (!simText.trim()) return;
    setLoading(true);
    const { data: allItems } = await supabase.from('watchlists').select('product_name, keywords, shopkeeper_id');
    const { data: allSk } = await supabase.from('shopkeepers').select('id, name');
    const matches: { name: string, match: string }[] = [];
    const text = simText.toLowerCase();

    allItems?.forEach(item => {
      const keysToMatch = (item.keywords && item.keywords.length > 0)
        ? item.keywords
        : [item.product_name];

      keysToMatch.forEach((key: string) => {
        if (text.includes(key.toLowerCase())) {
          const sk = allSk?.find(s => s.id === item.shopkeeper_id);
          if (sk) {
            // Avoid duplicate matches for same partner
            if (!matches.some(m => m.name === sk.name && m.match === key)) {
              matches.push({ name: sk.name, match: key });
            }
          }
        }
      });
    });
    setSimResults(matches); setLoading(false);
  }

  async function saveSimMatch(name: string, match: string) {
    const sk = shopkeepers.find(s => s.name === name);
    if (!sk) return;

    setSaving(true);
    const { error } = await supabase.from('matches').insert([{
      shopkeeper_id: sk.id,
      product_name: match,
      matched_keyword: match,
      original_text: simText,
      telegram_link: "https://t.me/simulated_deal",
      operator_name: operatorName || 'Admin'
    }]);

    if (!error) {
      fetchMatches();
      showToast(`Match for ${name} saved to log!`);
    } else {
      showToast('Error saving match', 'error');
    }
    setSaving(false);
  }

  const downloadCSV = () => {
    const headers = ['Name', 'Phone', 'Address', 'Created At'];
    const rows = shopkeepers.map(sk => [sk.name, sk.phone, sk.address, sk.created_at]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    window.open(encodeURI(csvContent));
  };

  const filteredShopkeepers = shopkeepers.filter(sk =>
    sk.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sk.phone.includes(searchQuery)
  );

  // Analytics Calculations
  const totalProfit = orders.reduce((sum, o) => sum + (o.selling_price - o.deal_price), 0);
  const pendingCollection = orders.filter(o => o.status !== 'paid').reduce((sum, o) => sum + o.selling_price, 0);


  // Operator Performance
  const operatorStats = orders.reduce((acc: any, o) => {
    const name = o.operator_name || 'System/Legacy';
    if (!acc[name]) acc[name] = 0;
    acc[name]++;
    return acc;
  }, {});

  return (
    <div className="admin-pro-theme">
      {/* Login Overlay */}
      {!isAuthorized ? (
        <div className="admin-login-overlay">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={loginError ? { x: [-10, 10, -10, 10, 0], scale: 1, opacity: 1 } : { scale: 1, opacity: 1 }} 
            transition={{ duration: 0.4 }}
            className="login-card"
          >
            <div className="login-icon"><Lock size={32} /></div>
            <h2>Admin Access</h2>
            <p>Enter details to manage MarginMart operations</p>
            <AnimatePresence>
              {loginError && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  style={{ color: '#ef4444', fontWeight: 900, marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9rem' }}
                >
                  ERROR: WRONG PASSWORD
                </motion.div>
              )}
            </AnimatePresence>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '320px', margin: '0 auto 1.5rem' }}>
              <input
                type="text"
                placeholder="Operator Name"
                value={operatorName}
                onChange={(e) => {
                  setOperatorName(e.target.value);
                  localStorage.setItem('mm_operator_name', e.target.value);
                }}
                className="form-input-premium"
                style={{ textAlign: 'center' }}
              />
              <div style={{ position: 'relative', width: '200px', margin: '0 auto' }}>
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'transparent',
                    caretColor: 'transparent',
                    letterSpacing: '42px',
                    paddingLeft: '15px',
                    fontSize: '2rem',
                    outline: 'none',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 2,
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} style={{
                      width: '40px',
                      height: '50px',
                      border: `2px solid ${pin.length > i ? 'var(--admin-accent)' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      background: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      color: '#1e293b',
                      fontWeight: 700,
                      transition: 'all 0.2s'
                    }}>
                      {pin.length > i ? '•' : ''}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={checkPin} className="btn-unlock" style={{ width: '100%', maxWidth: '320px', margin: '0 auto' }}>Unlock Dashboard</button>
            <button onClick={onBack} className="btn-cancel-login">Cancel</button>
          </motion.div>
        </div>
      ) : (
        <div className="admin-layout">
          {/* Sidebar */}
          <aside className="admin-sidebar">
            <div className="sidebar-logo">
              <Zap className="text-green-500" fill="currentColor" />
              <span>MarginMart <span className="pro-badge">ADMIN PRO</span></span>
            </div>
            <nav className="sidebar-nav">
              <button 
                className={`nav-item ${activeTab === 'automation' ? 'active' : ''}`}
                onClick={() => setActiveTab('automation')}
              >
                <Zap size={18} />
                <span>Automation</span>
              </button>
              <button className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                <LayoutDashboard size={20} /> Overview
              </button>
              <button className={`nav-item ${activeTab === 'shopkeepers' ? 'active' : ''}`} onClick={() => { setActiveTab('shopkeepers'); setSelectedShopkeeper(null); }}>
                <Users size={20} /> Partners
              </button>
              <button className={`nav-item ${activeTab === 'simulator' ? 'active' : ''}`} onClick={() => { setActiveTab('simulator'); setSelectedShopkeeper(null); }}>
                <Target size={20} /> Match Simulator
              </button>
              <button className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => { setActiveTab('orders'); setSelectedShopkeeper(null); }}>
                <History size={20} /> Order Logs
              </button>
              <button className={`nav-item ${activeTab === 'matches' ? 'active' : ''}`} onClick={() => { setActiveTab('matches'); setSelectedShopkeeper(null); }}>
                <Bell size={20} /> AI Detections
              </button>
              <button className={`nav-item ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => { setActiveTab('billing'); setSelectedShopkeeper(null); }}>
                <FileText size={20} /> Billing
              </button>
            </nav>
            <div className="sidebar-footer">
              <div className="operator-profile">
                <div className="sk-avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>{operatorName[0]}</div>
                <div>
                  <div className="operator-label">Operator</div>
                  <div className="operator-name-sidebar">{operatorName}</div>
                </div>
              </div>
              <button onClick={onBack} className="btn-logout">
                <LogOut size={16} /> Logout
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="admin-main">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' ? (
                <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <header className="page-header">
                    <div className="page-title"><h1>Business Overview</h1><p>Real-time health of your order network.</p></div>
                  </header>
                  <div className="stats-overview">
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="stat-card-mini">
                      <h4>Total Net Profit</h4>
                      <div className="val text-green">₹{totalProfit.toLocaleString()}</div>
                      <TrendingUp className="text-green" />
                    </motion.div>
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="stat-card-mini">
                      <h4>Pending Collection</h4>
                      <div className="val text-orange">₹{pendingCollection.toLocaleString()}</div>
                      <Clock className="text-orange" />
                    </motion.div>
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="stat-card-mini">
                      <h4>Active Partners</h4>
                      <div className="val">{shopkeepers.length}</div>
                      <Users />
                    </motion.div>
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="stat-card-mini">
                      <h4>Recent Matches</h4>
                      <div className="val text-green">{matches.length}</div>
                      <Bell className="text-green" />
                    </motion.div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', marginTop: '2rem' }}>
                    <div className="data-table-container">
                      <div className="table-controls"><h3>Recent Orders</h3></div>
                      {orders.slice(0, 5).map(o => (
                        <div key={o.id} className="sk-row" style={{ '--grid-cols': '2.4fr 1fr 1fr' } as any}>
                          <div className="sk-name-cell">
                            <h4>{o.shopkeeper?.name}</h4>
                            <p>{o.product_name} {o.operator_name && <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>• Handled by {o.operator_name}</span>}</p>
                          </div>
                          <div className={`status-badge ${o.status}`} style={{ fontSize: '0.6rem' }}>{o.status}</div>
                          <div style={{ textAlign: 'right', fontWeight: 700 }}>₹{o.selling_price}</div>
                        </div>
                      ))}
                    </div>

                    <div className="watchlist-card">
                      <div className="table-controls"><h3>Team Contribution</h3></div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
                        {Object.entries(operatorStats).map(([name, count]: [string, any]) => (
                          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#f8fafc', borderRadius: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <div className="sk-avatar" style={{ width: '36px', height: '36px', fontSize: '0.9rem', background: 'white', border: '1px solid #e2e8f0' }}>{name[0]}</div>
                              <div>
                                <h4 style={{ fontSize: '0.95rem', marginBottom: '4px' }}>{name}</h4>
                                <div style={{ height: '6px', width: '120px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(count / orders.length) * 100}%` }}
                                    style={{
                                      height: '100%',
                                      background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ fontSize: '1.2rem', color: '#1e293b' }}>{count}</strong>
                              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Orders</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === 'automation' ? (
                <motion.div key="automation" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <header className="page-header">
                    <div className="page-title">
                      <h1>Automation Center</h1>
                      <p>Manage real-time deal discovery and listeners</p>
                    </div>
                    <div className="header-actions">
                      <div className="status-pill pulse">
                        <div className="status-dot green"></div>
                        Listener: Active
                      </div>
                    </div>
                  </header>

                  <div className="automation-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
                    <div className="automation-card premium" style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                      <div className="card-icon telegram" style={{ width: '48px', height: '48px', background: '#e0f2fe', color: '#0ea5e9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                        <Send size={24} />
                      </div>
                      <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Telegram Listener (The Spy)</h3>
                      <p style={{ color: '#64748b', marginBottom: '2rem' }}>Real-time deal scraping from @deals and private groups.</p>
                      
                      <div className="setup-steps" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="setup-step" style={{ display: 'flex', gap: '1rem' }}>
                          <div className="step-num" style={{ width: '24px', height: '24px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>1</div>
                          <div className="step-content">
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Cloud Engine Endpoint (Render)</h4>
                            <code style={{ display: 'block', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem', border: '1px solid #e2e8f0', marginBottom: '0.5rem', overflowX: 'auto' }}>https://marginmart-bot.onrender.com</code>
                            <button className="btn-pro-ghost" style={{ fontSize: '0.8rem' }} onClick={() => {
                              navigator.clipboard.writeText('https://marginmart-bot.onrender.com');
                              showToast('Cloud Endpoint Copied!', 'success');
                            }}>Copy URL</button>
                          </div>
                        </div>
                        
                        <div className="setup-step" style={{ display: 'flex', gap: '1rem' }}>
                          <div className="step-num" style={{ width: '24px', height: '24px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>2</div>
                          <div className="step-content" style={{ width: '100%' }}>
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Target Spy Channels</h4>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                              Comma-separated list of Telegram @usernames to scrape in real-time.
                            </p>
                            <input 
                              type="text" 
                              placeholder="e.g. deals, prolooterzz, offerzone" 
                              className="admin-input" 
                              style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '0.5rem' }} 
                              value={monitorChannels}
                              onChange={e => setMonitorChannels(e.target.value)}
                            />
                            <button 
                                className="btn-pro-primary" 
                                style={{ width: '100%' }} 
                                onClick={saveMonitorChannels}
                                disabled={saving}
                              >
                                {saving ? 'Updating...' : 'Update Channels'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="automation-card" style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                      <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Matching Engine (Phase 1.4)</h3>
                      <div className="engine-status" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                        <div className="status-item" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span className="label" style={{ color: '#64748b', fontSize: '0.9rem' }}>Scan Frequency</span>
                          <span className="value" style={{ fontWeight: 700, color: '#0f172a' }}>Instant (Trigger-based)</span>
                        </div>
                        <div className="status-item" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span className="label" style={{ color: '#64748b', fontSize: '0.9rem' }}>Watchlist Items</span>
                          <span className="value" style={{ fontWeight: 700, color: '#0f172a' }}>{watchlist.length} Products</span>
                        </div>
                      </div>
                      <div className="engine-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div className="stat" style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '16px', textAlign: 'center' }}>
                          <span className="num" style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                            {matches.filter(m => new Date(m.created_at).toDateString() === new Date().toDateString()).length}
                          </span>
                          <span className="lbl" style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Matches Today</span>
                        </div>
                        <div className="stat" style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '16px', textAlign: 'center' }}>
                          <span className="num" style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#22c55e' }}>24</span>
                          <span className="lbl" style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Hours Uptime</span>
                        </div>
                      </div>

                      <div className="channel-analytics" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Match Sources Breakdown</h4>
                          <button 
                            onClick={fetchMatches}
                            className="btn-pro-ghost"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            title="Refresh Analytics"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                              <path d="M3 3v5h5"></path>
                              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
                              <path d="M16 21v-5h5"></path>
                            </svg>
                            Refresh
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {(() => {
                            const stats: Record<string, number> = {};
                            matches.forEach(m => {
                              let source = 'Legacy / Test Matches';
                              if (m.telegram_link) {
                                if (m.telegram_link.includes('t.me/c/')) {
                                  source = 'Private Group';
                                } else {
                                  const matchObj = m.telegram_link.match(/t\.me\/([^\/]+)/);
                                  if (matchObj) source = `@${matchObj[1]}`;
                                }
                              }
                              stats[source] = (stats[source] || 0) + 1;
                            });
                            
                            const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]);
                            if (sortedStats.length === 0) {
                              return <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No match data available yet.</p>;
                            }

                            return sortedStats.map(([source, count], idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>{source}</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0ea5e9' }}>{count} matches</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === 'matches' ? (
                <motion.div key="matches" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <header className="page-header"><div className="page-title"><h1>Detections Log</h1><p>Persistent record of matches found by the engine.</p></div></header>
                  <div className="data-table-container">
                    <div className="sk-row header-row" style={{ '--grid-cols': '2fr 1.5fr 1.5fr 1fr 100px' } as any}>
                      <span>Partner & Product</span>
                      <span>Detection Date</span>
                      <span>Operator</span>
                      <span>Matched Keyword</span>
                      <span style={{ textAlign: 'right' }}>Source</span>
                    </div>
                    {matches.map(match => (
                      <div key={match.id} className="sk-row" style={{ '--grid-cols': '2fr 1.5fr 1.5fr 1fr 100px' } as any}>
                        <div className="sk-name-cell">
                          <h4>{match.shopkeeper?.name}</h4>
                          <p>{match.product_name}</p>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(match.created_at).toLocaleString()}</div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="sk-avatar" style={{ width: '24px', height: '24px', fontSize: '0.6rem' }}>
                              {match.operator_name?.[0] || 'A'}
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                              {match.operator_name || 'Admin'}
                            </span>
                          </div>
                        </div>
                        <div><span className="status-pill active">{match.matched_keyword}</span></div>
                        <div style={{ textAlign: 'right' }}>
                          <button onClick={() => alert(match.original_text)} className="btn-pro-ghost">View Msg</button>
                        </div>
                      </div>
                    ))}
                    {matches.length === 0 && <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>No matches recorded yet.</div>}
                  </div>
                </motion.div>
              ) : activeTab === 'orders' ? (
                <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <header className="page-header"><div className="page-title"><h1>Order Logs</h1><p>Manage order status and payment collections.</p></div></header>
                  <div className="data-table-container">
                    <div className="sk-row header-row" style={{ '--grid-cols': '2fr 1fr 1fr 1.5fr 1fr' } as any}>
                      <span>Partner & Product</span>
                      <span>Order Date</span>
                      <span>Operator</span>
                      <span style={{ textAlign: 'center' }}>Status Update</span>
                      <span style={{ textAlign: 'right' }}>Financials</span>
                    </div>
                    {orders.map(order => (
                      <div key={order.id} className="sk-row" style={{ '--grid-cols': '2fr 1fr 1fr 1.5fr 1fr' } as any}>
                        <div className="sk-name-cell">
                          <h4>{order.shopkeeper?.name}</h4>
                          <p>{order.product_name}</p>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(order.created_at).toLocaleDateString()}</div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="sk-avatar" style={{ width: '24px', height: '24px', fontSize: '0.6rem' }}>
                              {order.operator_name?.[0] || 'A'}
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                              {order.operator_name || 'Admin'}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
                          <div className={`status-badge ${order.status}`}>
                            {order.status === 'ordered' ? 'Ordered' : order.status === 'delivered' ? 'Delivered' : 'Paid'}
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={() => updateOrderStatus(order.id, 'ordered')} className={`status-btn ordered ${order.status === 'ordered' ? 'active' : ''}`} title="Mark as Ordered"><Clock size={14} /></button>
                            <button onClick={() => updateOrderStatus(order.id, 'delivered')} className={`status-btn delivered ${order.status === 'delivered' ? 'active' : ''}`} title="Mark as Delivered"><ShoppingBag size={14} /></button>
                            <button onClick={() => updateOrderStatus(order.id, 'paid')} className={`status-btn paid ${order.status === 'paid' ? 'active' : ''}`} title="Mark as Paid"><CheckCircle2 size={14} /></button>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: '#15803d' }}>₹{order.selling_price}</div>
                          <div style={{ fontSize: '0.7rem', color: '#16a34a' }}>Profit: ₹{order.selling_price - order.deal_price}</div>
                          <div style={{ fontSize: '0.65rem', color: '#059669', opacity: 0.8 }}>
                            {(((order.selling_price - order.deal_price) / order.deal_price) * 100).toFixed(0)}% Margin
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : activeTab === 'billing' ? (
                <motion.div key="billing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <header className="page-header">
                    <div className="page-title">
                      <h1>Billing & Statements</h1>
                      <p>Review and generate weekly invoices for your partners.</p>
                    </div>
                  </header>

                  <div className="detail-view" style={{ gridTemplateColumns: '1fr 1.5fr' }}>
                    <div className="data-table-container">
                      <div className="table-controls">
                        <div className="search-input-wrap">
                          <Search size={18} />
                          <input type="text" placeholder="Search partner..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                      </div>
                      {shopkeepers.filter(sk => sk.name.toLowerCase().includes(searchQuery.toLowerCase())).map(sk => {
                        const partnerOrders = orders.filter(o => o.shopkeeper_id === sk.id && o.status !== 'paid');
                        const total = partnerOrders.reduce((sum, o) => sum + o.selling_price, 0);
                        return (
                          <div
                            key={sk.id}
                            className={`sk-row ${selectedBillPartner === sk.id ? 'active' : ''}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedBillPartner(sk.id)}
                          >
                            <div className="sk-name-cell">
                              <div className="sk-avatar">{sk.name[0]}</div>
                              <div>
                                <h4>{sk.name}</h4>
                                <p>{partnerOrders.length} Orders</p>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ color: 'var(--admin-accent)' }}>₹{total}</strong>
                              <ChevronRight size={16} style={{ marginLeft: '8px', opacity: 0.3 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="watchlist-card">
                      {selectedBillPartner ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                            <div>
                              <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{shopkeepers.find(s => s.id === selectedBillPartner)?.name}</h2>
                              <p style={{ color: 'var(--text-muted)' }}>Statement for current period</p>
                            </div>
                            <button className="btn-pro-primary" onClick={() => setShowInvoiceModal(true)}>
                              <Download size={18} /> Generate Invoice
                            </button>
                          </div>

                          <div className="data-table-container" style={{ boxShadow: 'none', border: '1px solid #f1f5f9' }}>
                            <div className="sk-row header-row" style={{ '--grid-cols': '2fr 1fr 1fr', padding: '1rem' } as any}>
                              <div>Item</div>
                              <div>Date</div>
                              <div style={{ textAlign: 'right' }}>Price</div>
                            </div>
                            {orders.filter(o => o.shopkeeper_id === selectedBillPartner && o.status !== 'paid').map(order => (
                              <div key={order.id} className="sk-row" style={{ '--grid-cols': '2fr 1fr 1fr', padding: '1rem' } as any}>
                                <div>
                                  <strong>{order.product_name}</strong>
                                  {order.operator_name && <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>By {order.operator_name}</div>}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleDateString()}</div>
                                <div style={{ textAlign: 'right', fontWeight: 600 }}>₹{order.selling_price}</div>
                              </div>
                            ))}
                            <div style={{ padding: '1.5rem', textAlign: 'right', borderTop: '2px solid #f1f5f9', background: '#f8fafc' }}>
                              <span style={{ color: 'var(--text-muted)', marginRight: '1rem' }}>Total Amount Due:</span>
                              <strong style={{ fontSize: '1.5rem', color: '#1e293b' }}>
                                ₹{orders.filter(o => o.shopkeeper_id === selectedBillPartner && o.status !== 'paid').reduce((sum, o) => sum + o.selling_price, 0)}
                              </strong>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                          <FileText size={48} style={{ margin: '0 auto 1.5rem', opacity: 0.2 }} />
                          <h3>Select a partner to view billing details</h3>
                          <p>Aggregated weekly reports and itemized invoices.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === 'simulator' ? (
                <motion.div key="simulator" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <header className="page-header">
                    <div className="page-title"><h1>Match Simulator</h1><p>Test matching logic with sample Telegram deals.</p></div>
                  </header>
                  <div className="watchlist-card" style={{ marginBottom: '2rem' }}>
                    <textarea className="form-input-premium" rows={6} placeholder="Paste Telegram text here..." value={simText} onChange={(e) => setSimText(e.target.value)} style={{ width: '100%', padding: '1.5rem', marginBottom: '1.5rem' }} />
                    <button onClick={runSimulator} className="btn-pro-primary" style={{ width: '100%', justifyContent: 'center', height: '56px' }}>Run Logic Test</button>
                  </div>
                  {simResults.length > 0 && (
                    <div className="data-table-container">
                      <div className="table-controls"><h3>Matching Results</h3></div>
                      {simResults.map((res, i) => (
                        <motion.div
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: i * 0.05 }}
                          key={i}
                          className="simulator-row"
                        >
                          <div className="sk-name-cell"><h4>{res.name}</h4></div>
                          <div style={{ textAlign: 'left' }}><span className="status-pill active">Matches: "{res.match}"</span></div>
                          <div style={{ textAlign: 'right' }}>
                            <button className="btn-pro-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => saveSimMatch(res.name, res.match)}>Save to Log</button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : selectedShopkeeper ? (
                <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="detail-view">
                  <div className="info-card">
                    <button onClick={() => setSelectedShopkeeper(null)} className="btn-pro-ghost" style={{ marginBottom: '1.5rem' }}><ArrowLeft size={16} /> Back</button>
                    <div className="sk-avatar-lg">{selectedShopkeeper.name.charAt(0)}</div>
                    <h2>{selectedShopkeeper.name}</h2>
                    {selectedShopkeeper.operator_name && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                        Onboarded by {selectedShopkeeper.operator_name}
                      </p>
                    )}
                    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <button className="btn-pro-primary" onClick={() => setShowOrderModal(true)}><ShoppingBag size={18} /> Log Order</button>
                      <button className="btn-pro-secondary" onClick={() => { setFormState(selectedShopkeeper); setShowEditModal(true); }}><Edit2 size={16} /> Edit Profile</button>
                    </div>
                  </div>

                  <div className="watchlist-card">
                    <div className="add-product-row">
                      <input type="text" className="form-input-premium" placeholder="Type product keyword..." value={newProduct} onChange={(e) => setNewProduct(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addToWatchlist(newProduct)} />
                      <button onClick={() => addToWatchlist(newProduct)} className="btn-pro-primary"><Plus size={18} /> Add</button>
                    </div>
                    <div style={{ marginBottom: '2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#64748b' }}>
                        <Zap size={14} className="text-orange-500" />
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Suggestions</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                        {TEMPLATE_KEYWORDS.map(k => (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            key={k}
                            onClick={() => addToWatchlist(k)}
                            className="btn-tag-suggestion"
                          >
                            <Plus size={12} /> {k}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <div className="tag-cloud" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#64748b' }}>
                        <ShoppingBag size={14} className="text-green-500" />
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Watchlist ({watchlist.length})</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <AnimatePresence>
                          {watchlist.map((item) => (
                            <React.Fragment key={item.id}>
                              {(item.keywords || [item.product_name]).map((kw, idx) => (
                                <motion.div
                                  layout
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  key={`${item.id}-${idx}`}
                                  className="product-tag"
                                >
                                  <span title={item.operator_name ? `Added by ${item.operator_name}` : ''}>{kw}</span>
                                  <button onClick={() => removeFromWatchlist(item.id)}><X size={14} /></button>
                                </motion.div>
                              ))}
                            </React.Fragment>
                          ))}
                        </AnimatePresence>
                        {watchlist.length === 0 && (
                          <div style={{ padding: '2rem', textAlign: 'center', width: '100%', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                            No items in watchlist. Use suggestions or type above.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <header className="page-header">
                    <div className="page-title"><h1>Partner Network</h1><p>Active shopkeepers and their watchlists.</p></div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button onClick={downloadCSV} className="btn-pro-secondary"><Download size={18} /> CSV</button>
                      <button onClick={() => { setFormState({ id: '', name: '', phone: '', address: '' }); setShowAddModal(true); }} className="btn-pro-primary"><Plus size={20} /> Add Partner</button>
                    </div>
                  </header>
                  <div className="data-table-container">
                    <div className="table-controls">
                      <div className="search-input-wrap"><Search size={18} /><input type="text" placeholder="Search partners..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
                    </div>
                    <div className="sk-row header-row" style={{ '--grid-cols': '1.5fr 1fr 100px 140px 100px' } as any}>
                      <span>Partner Info</span>
                      <span>Location</span>
                      <span>Status</span>
                      <span style={{ textAlign: 'center' }}>Fulfillment</span>
                      <span style={{ textAlign: 'right' }}>Manage</span>
                    </div>
                    <div className="table-body">
                      {loading ? <div className="loading-state"><Loader2 className="animate-spin" size={32} /></div> : filteredShopkeepers.map(sk => (
                        <div key={sk.id} className="sk-row" style={{ '--grid-cols': '1.5fr 1fr 100px 140px 100px' } as any}>
                          <div className="sk-name-cell">
                            <div className="sk-avatar">{sk.name.charAt(0)}</div>
                            <div>
                              <h4>{sk.name}</h4>
                              <p>{sk.phone} {sk.operator_name && <span style={{ opacity: 0.5 }}>• By {sk.operator_name}</span>}</p>
                            </div>
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{sk.address}</div>
                          <div><span className="status-pill active">Verified</span></div>
                          <div style={{ textAlign: 'center' }}>
                            <button className="btn-pro-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => { setOrderPartner(sk); setShowOrderModal(true); }}>
                              <ShoppingBag size={14} /> Log Order
                            </button>
                          </div>
                          <div style={{ textAlign: 'right' }}><button className="btn-pro-ghost" onClick={() => { setSelectedShopkeeper(sk); fetchWatchlist(sk.id); }}>Manage <ChevronRight size={16} /></button></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      )}

      {/* Invoice Modal */}
      <AnimatePresence>
        {showInvoiceModal && selectedBillPartner && (
          <div className="modal-overlay">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="invoice-modal"
            >
              <div className="invoice-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Weekly Statement</h3>
                  <p style={{ margin: 0, opacity: 0.6, fontSize: '0.8rem' }}>MarginMart Operations • {new Date().toLocaleDateString()}</p>
                </div>
                <button onClick={() => setShowInvoiceModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              <div className="invoice-body custom-scrollbar" id="invoice-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem', gap: '2rem' }}>
                  <div>
                    <h4 style={{ color: '#22c55e', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>BILL TO:</h4>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem', color: '#1e293b' }}>{shopkeepers.find(s => s.id === selectedBillPartner)?.name}</h2>
                    <div style={{ color: '#64748b', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <p style={{ margin: 0 }}>{shopkeepers.find(s => s.id === selectedBillPartner)?.address}</p>
                      <p style={{ margin: 0 }}>{shopkeepers.find(s => s.id === selectedBillPartner)?.phone}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="login-icon" style={{ margin: '0 0 1rem auto', width: '48px', height: '48px' }}><Zap size={24} /></div>
                    <h4 style={{ color: '#64748b', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 800 }}>MARGINMART</h4>
                    <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>Operations Dashboard</p>
                  </div>
                </div>

                <div className="invoice-table-header">
                  <div>Product Description</div>
                  <div>Order Date</div>
                  <div style={{ textAlign: 'right' }}>Price</div>
                </div>

                {orders.filter(o => o.status !== 'paid' && o.shopkeeper_id === selectedBillPartner).map(order => (
                  <div key={order.id} className="invoice-item-row">
                    <div style={{ fontWeight: 700, color: '#334155' }}>{order.product_name}</div>
                    <div style={{ color: '#64748b' }}>{new Date(order.created_at).toLocaleDateString()}</div>
                    <div style={{ textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>₹{order.selling_price.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              <div className="invoice-total-section">
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '2rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Amount Due</p>
                    <strong style={{ fontSize: '2.5rem', fontWeight: 900, color: '#1e293b', letterSpacing: '-0.04em' }}>
                      ₹{orders.filter(o => o.shopkeeper_id === selectedBillPartner && o.status !== 'paid').reduce((sum, o) => sum + o.selling_price, 0).toLocaleString()}
                    </strong>
                  </div>
                </div>
                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button className="btn-pro-secondary" onClick={() => window.print()}><Download size={18} /> Print PDF</button>
                  <button className="btn-pro-primary" onClick={() => {
                    const sk = shopkeepers.find(s => s.id === selectedBillPartner);
                    const total = orders.filter(o => o.shopkeeper_id === selectedBillPartner && o.status !== 'paid').reduce((sum, o) => sum + o.selling_price, 0);
                    const text = `Hi ${sk?.name}, your MarginMart statement for this week is ready. Total due: ₹${total}. Please check the attached invoice.`;
                    window.open(`https://wa.me/${sk?.phone}?text=${encodeURIComponent(text)}`);
                  }}>
                    <Phone size={18} /> Send to WhatsApp
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {(showAddModal || showEditModal) && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="modal">
              <div className="modal-header"><h2>Partner Profile</h2><button onClick={() => { setShowAddModal(false); setShowEditModal(false); }}><X size={24} /></button></div>
              <form onSubmit={handleSaveShopkeeper}>
                <div className="form-group"><label>Name</label><input required className="form-input-premium" value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} /></div>
                <div className="form-group"><label>WhatsApp</label><input required className="form-input-premium" value={formState.phone} onChange={(e) => setFormState({ ...formState, phone: e.target.value })} /></div>
                <div className="form-group"><label>Address</label><textarea required className="form-input-premium" rows={3} value={formState.address} onChange={(e) => setFormState({ ...formState, address: e.target.value })} /></div>
                <button type="submit" disabled={saving} className="btn-pro-primary" style={{ width: '100%' }}>{saving ? 'Saving...' : 'Save Profile'}</button>
              </form>
            </motion.div>
          </div>
        )}

        {showOrderModal && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="modal">
              <div className="modal-header"><h2>Log Order — {orderPartner?.name || selectedShopkeeper?.name}</h2><button onClick={() => { setShowOrderModal(false); setOrderPartner(null); }}><X size={24} /></button></div>
              <form onSubmit={logOrder}>
                <div className="form-group"><label>Product Name</label><input required className="form-input-premium" value={orderForm.product_name} onChange={(e) => setOrderForm({ ...orderForm, product_name: e.target.value })} /></div>
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div><label>Deal Price (₹)</label><input type="number" required className="form-input-premium" value={orderForm.deal_price} onChange={(e) => setOrderForm({ ...orderForm, deal_price: e.target.value })} /></div>
                  <div><label>Selling Price (₹)</label><input type="number" required className="form-input-premium" value={orderForm.selling_price} onChange={(e) => setOrderForm({ ...orderForm, selling_price: e.target.value })} /></div>
                </div>
                <div className="profit-preview">
                  <span>Est. Profit: </span>
                  <strong>₹{(parseFloat(orderForm.selling_price || '0') - parseFloat(orderForm.deal_price || '0')).toFixed(0)}</strong>
                </div>
                <button type="submit" disabled={saving} className="btn-pro-primary" style={{ width: '100%' }}><IndianRupee size={16} /> Log Order</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className={`toast-notification ${notification.type}`}
          >
            {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
