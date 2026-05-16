import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, TrendingUp, Search, Plus, Filter, MoreHorizontal,
  Trash2, Edit2, CheckCircle, AlertCircle, X, ChevronRight, MessageSquare,
  Download, History, LayoutDashboard, ShoppingCart, CreditCard, PlusCircle,
  IndianRupee, Clock, Zap, Target, Bell, ArrowLeft, FileText, Loader2, ShoppingBag,
  CheckCircle2, LogOut, Send, RefreshCw, Lock, UserPlus, ChevronDown, BarChart3
} from 'lucide-react';
import PartnerCard from './mobile/PartnerCard';
import OrderCard from './mobile/OrderCard';
import { LogOrderModal } from './admin/modals/LogOrderModal';
import { PartnerFormModal } from './admin/modals/PartnerFormModal';
import { ConfirmModal } from './admin/modals/ConfirmModal';
import { MessageModal } from './admin/modals/MessageModal';
import { BillingDetail } from './admin/BillingDetail';
import { generateInvoice, fetchPartnerInvoices, type InvoiceRecord } from '../utils/invoiceGenerator';

const DetectionCard = ({ match, onViewMsg }: { match: Match; onViewMsg: (text: string) => void }) => (
  <div className="mobile-statement-item">
    <div className="item-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>
      {match.shopkeeper?.name}
    </div>
    <div className="item-meta" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
        <span style={{ fontWeight: 600 }}>Product:</span> {match.product_name}
      </div>
      <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className="status-pill active" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>"{match.matched_keyword}"</span>
        {match.telegram_link && (
          <span style={{ opacity: 0.8 }}>• {match.telegram_link.includes('deals') ? '@deals' : 'Private'}</span>
        )}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          {new Date(match.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
        <button onClick={() => onViewMsg(match.original_text || '')} className="btn-pro-ghost" style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '8px' }}>
          View Msg →
        </button>
      </div>
    </div>
  </div>
);

const SimulatorResultCard = ({ res, onViewMsg, onSave, isMobile }: { res: any, onViewMsg: (t: string) => void, onSave: () => void, isMobile: boolean }) => (
  <div className={isMobile ? "mobile-statement-item" : "simulator-row"}>
    <div className="sk-name-cell">
      <h4>{res.name}</h4>
      {isMobile && <p className="status-pill active" style={{ display: 'inline-block', marginTop: '0.5rem' }}>Matched: "{res.match}"</p>}
    </div>
    {!isMobile && <div style={{ textAlign: 'left' }}><span className="status-pill active">Matches: "{res.match}"</span></div>}
    <div style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
      <button className="btn-pro-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => onViewMsg(res.raw_message || '')}>View Text</button>
      <button className="btn-pro-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={onSave}>Save</button>
    </div>
  </div>
);

const EmptyState = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
  <div className="empty-state-premium">
    <div className="empty-icon-wrapper">
      <Icon size={40} />
    </div>
    <h3>{title}</h3>
    <p>{description}</p>
  </div>
);

import type { Shopkeeper, WatchlistItem, Match, Order } from '../types/database';

const TEMPLATE_KEYWORDS = ["Dove", "Maggi", "Pampers", "Atta", "Surf Excel", "Cooking Oil", "Rice", "Sugar", "Shampoo", "Soap"];

const STATUS_METADATA = {
  all: { label: 'All Status', icon: Filter, color: '#64748b', desc: 'View all orders' },
  ordered: { label: 'Pending', icon: Clock, color: '#3b82f6', desc: 'Order placed, pending delivery' },
  delivered: { label: 'Delivered', icon: ShoppingBag, color: '#f59e0b', desc: 'Items received by partner' },
  paid: { label: 'Paid', icon: CheckCircle2, color: '#22c55e', desc: 'Payment received & settled' }
};

// ─── Sitewide Brand Logo (matches landing page) ───────────────────────────────
const BrandLogo = ({ dark = true, badge }: { dark?: boolean; badge?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
    <div style={{
      width: 32, height: 32,
      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      borderRadius: '8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      boxShadow: '0 2px 8px rgba(34,197,94,0.35)'
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    </div>
    <div style={{ lineHeight: 1.1 }}>
      <div style={{ fontWeight: 900, fontSize: '1rem', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
        <span style={{ color: dark ? '#ffffff' : '#0f172a' }}>Margin</span>
        <span style={{ color: '#22c55e' }}>Mart</span>
      </div>
      {badge && <div style={{ fontSize: '0.52rem', fontWeight: 800, color: '#22c55e', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '1px' }}>{badge}</div>}
    </div>
  </div>
);

// Skeleton Loader Component
const SkeletonLoader = ({ count = 3, height = '80px' }) => (
  <div className="skeleton-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', padding: '1rem' }}>
    {Array(count).fill(0).map((_, i) => (
      <div
        key={i}
        className="skeleton-item"
        style={{
          height,
          width: '100%',
          background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
          backgroundSize: '200% 100%',
          animation: 'skeleton-loading 1.5s infinite',
          borderRadius: '12px'
        }}
      />
    ))}
  </div>
);

export default function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [isAuthorized, setIsAuthorized] = useState(() => sessionStorage.getItem('adminAuth') === 'true');
  const [pin, setPin] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'shopkeepers' | 'simulator' | 'orders' | 'billing' | 'matches' | 'automation'>('overview');
  const [shopkeepers, setShopkeepers] = useState<Shopkeeper[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedShopkeeper, setSelectedShopkeeper] = useState<Shopkeeper | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [totalWatchlistCount, setTotalWatchlistCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedBillPartner, setSelectedBillPartner] = useState<string | null>(null);
  const [viewingMessage, setViewingMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [operatorName, setOperatorName] = useState(localStorage.getItem('mm_operator_name') || '');
  const [isEditingOperator, setIsEditingOperator] = useState(!localStorage.getItem('mm_operator_name'));
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: (checked?: boolean) => void;
    checkboxLabel?: string;
    variant?: 'danger' | 'success' | 'primary';
  } | null>(null);

  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [isMobile] = useState(window.innerWidth < 768);

  const showConfirm = (message: string, onConfirm: (checked?: boolean) => void, checkboxLabel?: string, variant: 'danger' | 'success' | 'primary' = 'danger') => {
    setConfirmDialog({ message, onConfirm, checkboxLabel, variant });
  };
  const [orderPartner, setOrderPartner] = useState<Shopkeeper | null>(null);
  const [visibleOrderCount, setVisibleOrderCount] = useState(10);
  const [visibleMatchCount, setVisibleMatchCount] = useState(10);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'ordered' | 'delivered' | 'paid'>('all');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [statusSearchQuery, setStatusSearchQuery] = useState('');
  const [keyboardOpen] = useState(false);
  const [invoiceHistory, setInvoiceHistory] = useState<InvoiceRecord[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const [loginError, setLoginError] = useState(false);
  const [monitorChannels, setMonitorChannels] = useState<string[]>(['deals']);
  const [newChannelInput, setNewChannelInput] = useState('');
  const [isBotActive, setIsBotActive] = useState(false);
  const [isOnline] = useState(navigator.onLine);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const pullThreshold = 80;


  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    if (navigator.vibrate) navigator.vibrate(20);
    await Promise.all([fetchOrders(), fetchMatches(), fetchShopkeepers()]);
    setTimeout(() => setIsRefreshing(false), 800);
    showToast('Dashboard updated', 'success');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY > 0 && window.scrollY === 0) {
      const moveY = e.touches[0].clientY;
      const diff = moveY - startY;
      if (diff > 0) {
        setPullDistance(Math.min(diff * 0.5, pullThreshold + 20));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > pullThreshold) {
      handleRefresh();
    }
    setPullDistance(0);
    setStartY(0);
  };

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }

  // Order Form
  const [orderForm, setOrderForm] = useState({ product_name: '', deal_price: '', selling_price: '', quantity: '1', unit_rate: '', platform_fee: '0', mrp: '' });

  // Simulator State
  const [simText, setSimText] = useState('');
  const [simResults, setSimResults] = useState<{ name: string, match: string, shopkeeperId: string, raw_message?: string }[]>([]);

  // Shopkeeper Form
  const [formState, setFormState] = useState({ id: '', name: '', phone: '', address: '' });

  // Watchlist Editing
  const [newProduct, setNewProduct] = useState('');
  const [newSupplierRate, setNewSupplierRate] = useState('');
  const [newProductSize, setNewProductSize] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');

  useEffect(() => {
    if (isAuthorized) {
      fetchShopkeepers();
      fetchOrders();
      fetchMatches();
      fetchTelegramConfig();
      fetchTotalWatchlists();
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (isAuthorized) {
      if (activeTab === 'automation' || activeTab === 'matches') {
        fetchMatches();
      }
      if (activeTab === 'automation') {
        fetchTotalWatchlists();
      }
      // Clear detail view when switching tabs
      setSelectedBillPartner(null);
      setSelectedShopkeeper(null);
    }
  }, [activeTab, isAuthorized]);

  async function fetchTotalWatchlists() {
    const { count } = await supabase.from('watchlists').select('*', { count: 'exact', head: true });
    setTotalWatchlistCount(count || 0);
  }

  useEffect(() => {
    if (selectedBillPartner) {
      loadInvoiceHistory(selectedBillPartner);
    }
  }, [selectedBillPartner]);

  async function loadInvoiceHistory(partnerId: string) {
    setInvoiceLoading(true);
    try {
      const history = await fetchPartnerInvoices(partnerId);
      setInvoiceHistory(history || []);
    } catch (error) {
      console.error('Failed to load invoice history:', error);
    } finally {
      setInvoiceLoading(false);
    }
  }

  async function checkPin(currentPin?: string) {
    const pinToVerify = currentPin || pin;
    const { data } = await supabase.from('admin_settings').select('value').eq('key', 'admin_pin').single();
    if (data && data.value === pinToVerify) {
      setIsAuthorized(true);
      sessionStorage.setItem('adminAuth', 'true');
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
      setMonitorChannels(channels.split(',').map((c: string) => c.trim()).filter(Boolean));
    }
  }


  async function saveMonitorChannels() {
    setSaving(true);
    const { error } = await supabase.from('telegram_configs').upsert([
      { key: 'monitor_channels', value: monitorChannels.join(',') }
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

  const deleteShopkeeper = (id: string) => {
    showConfirm("Are you sure you want to delete this partner? This action cannot be undone.", async () => {
      try {
        const { error } = await supabase.from('shopkeepers').delete().eq('id', id);
        if (error) throw error;
        fetchShopkeepers();
        showToast('Partner deleted');
      } catch (e) {
        showToast('Error deleting partner', 'error');
      }
    });
  };

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
      if (navigator.vibrate) navigator.vibrate(40);
      fetchOrders();
      showToast(`Order status updated to ${status}`);
    } else {
      showToast('Failed to update status', 'error');
    }
  }

  async function deleteOrder(orderId: string) {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (!error) {
      fetchOrders();
      showToast('Order deleted');
      setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
    } else {
      showToast('Failed to delete order', 'error');
    }
  }

  async function bulkDeleteOrders() {
    if (selectedOrderIds.length === 0) return;
    showConfirm(`Are you sure you want to delete ${selectedOrderIds.length} orders?`, async () => {
      const { error } = await supabase.from('orders').delete().in('id', selectedOrderIds);
      if (!error) {
        fetchOrders();
        showToast(`${selectedOrderIds.length} orders deleted`);
        setSelectedOrderIds([]);
      } else {
        showToast('Bulk delete failed', 'error');
      }
    });
  }

  async function markAllAsPaid(shopkeeperId: string) {
    showConfirm("Are you sure you want to mark all pending orders as paid?", async () => {
      const { error } = await supabase.from('orders').update({ status: 'paid' }).eq('shopkeeper_id', shopkeeperId).neq('status', 'paid');
      if (!error) {
        fetchOrders();
        showToast('All orders marked as paid');
      } else {
        showToast('Error updating status', 'error');
      }
    });
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
      mrp: parseFloat(orderForm.mrp || '0'),
      quantity: parseFloat(orderForm.quantity || '1'),
      unit_rate: parseFloat(orderForm.unit_rate || '0'),
      platform_fee: parseFloat(orderForm.platform_fee || '0'),
      status: 'ordered',
      operator_name: operatorName || 'Admin'
    }]);

    if (!error) {
      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
      showToast(`Logged order for ${orderForm.product_name}`);
      setShowOrderModal(false); setOrderPartner(null);
      setOrderForm({ product_name: '', deal_price: '', selling_price: '', quantity: '1', unit_rate: '', platform_fee: '0', mrp: '' });
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
    const firstKeyword = (keywords[0] || product.trim()).toLowerCase();

    // Check for existing duplicate
    const alreadyExists = watchlist.some(item =>
      (item.keywords || [item.product_name]).some(
        kw => kw.toLowerCase() === firstKeyword
      )
    );

    if (alreadyExists) {
      showToast(`"${keywords[0]}" is already in the watchlist`, 'error');
      return;
    }

    const { error } = await supabase.from('watchlists').insert([{
      shopkeeper_id: selectedShopkeeper.id,
      product_name: keywords[0] || product.trim(),
      keywords: keywords,
      operator_name: operatorName || 'Admin',
      supplier_rate: newSupplierRate ? parseFloat(newSupplierRate) : null,
      product_size: newProductSize || null,
      description: newProductDesc || null
    }]);

    if (!error) {
      showToast(`Added ${keywords[0]} to watchlist`);
      setNewProduct('');
      setNewSupplierRate('');
      setNewProductSize('');
      setNewProductDesc('');
      fetchWatchlist(selectedShopkeeper.id);
    } else {
      showToast('Error adding product', 'error');
    }
  }

  async function clearWatchlist(shopkeeperId: string) {
    showConfirm("Are you sure you want to CLEAR the entire watchlist for this partner?", async () => {
      const { error } = await supabase.from('watchlists').delete().eq('shopkeeper_id', shopkeeperId);
      if (!error) {
        setWatchlist([]);
        showToast('Watchlist cleared');
      } else {
        showToast('Failed to clear watchlist', 'error');
      }
    });
  }

  async function removeFromWatchlist(id: string, productName: string) {
    showConfirm(`Remove "${productName}" from watchlist?`, async () => {
      const { error } = await supabase.from('watchlists').delete().eq('id', id);
      if (!error) {
        showToast('Product removed from watchlist');
        if (selectedShopkeeper) fetchWatchlist(selectedShopkeeper.id);
      } else {
        showToast('Error removing product', 'error');
      }
    });
  }

  async function runSimulator() {
    if (!simText.trim()) return;
    setSimLoading(true);
    const { data: allItems } = await supabase.from('watchlists').select('product_name, keywords, shopkeeper_id');
    const { data: allSk } = await supabase.from('shopkeepers').select('id, name');
    const simMatches: { name: string, match: string, shopkeeperId: string, raw_message?: string }[] = [];
    const text = simText.toLowerCase();

    allItems?.forEach(item => {
      const keysToMatch = (item.keywords && item.keywords.length > 0)
        ? item.keywords
        : [item.product_name];

      keysToMatch.forEach((key: string) => {
        // Robust whole-word matching using word boundaries
        // This prevents false positives like "rin" matching "grinder"
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Explicit non-alphanumeric boundary check to prevent false positives like "rin" in "grinder"
        const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escapedKey}(?:$|[^a-zA-Z0-9])`, 'i');
        
        if (regex.test(text)) {
          const sk = allSk?.find(s => s.id === item.shopkeeper_id);
          if (sk) {
            // Avoid duplicate matches for same partner
            if (!simMatches.some(m => m.name === sk.name && m.match === key)) {
              simMatches.push({ name: sk.name, match: key, shopkeeperId: sk.id, raw_message: simText });
            }
          }
        }
      });
    });
    setSimResults(simMatches); setSimLoading(false);
  }

  async function saveSimMatch(shopkeeperId: string, match: string) {
    setSaving(true);
    try {
      const { error } = await supabase.from('matches').insert([{
        shopkeeper_id: shopkeeperId,
        product_name: match,
        matched_keyword: match,
        original_text: simText,
        telegram_link: "https://t.me/simulated_deal",
        operator_name: operatorName || 'Admin'
      }]);
      if (error) throw error;
      fetchMatches();
      showToast('Match saved to log!');
    } catch (e) {
      showToast('Error saving match', 'error');
    } finally {
      setSaving(false);
    }
  }

  const buildStatementText = (shopkeeperId: string) => {
    const partnerOrders = orders.filter(o => o.shopkeeper_id === shopkeeperId && o.status !== 'paid');
    const partner = shopkeepers.find(s => s.id === shopkeeperId);
    let text = `*MarginMart Weekly Statement*\n`;
    text += `*Partner:* ${partner?.name}\n`;
    text += `*Date:* ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}\n`;
    text += `---------------------------\n\n`;

    let totalAmount = 0;
    let totalSavings = 0;

    partnerOrders.forEach(o => {
      const qty = o.quantity || 1;
      const rate = o.selling_price / qty;
      const mrpVal = o.mrp || 0;
      const savingPerPc = mrpVal > rate ? (mrpVal - rate) : 0;
      const savingPercent = mrpVal > 0 ? Math.round((savingPerPc / mrpVal) * 100) : 0;

      totalAmount += o.selling_price;
      totalSavings += (savingPerPc * qty);

      text += `• ${o.product_name}\n`;
      text += `  Qty: ${qty} | Rate: ₹${rate.toLocaleString('en-IN')}\n`;
      text += `  *Subtotal: ₹${o.selling_price.toLocaleString('en-IN')}*\n`;
      if (savingPerPc > 0) text += `  _(You saved ₹${(savingPerPc * qty).toLocaleString('en-IN')} | ${savingPercent}% Disc)_ \n`;
      text += `\n`;
    });

    text += `---------------------------\n`;
    text += `*TOTAL PAYABLE: ₹${totalAmount.toLocaleString('en-IN')}*\n`;
    if (totalSavings > 0) text += `*Total Profits/Savings: ₹${totalSavings.toLocaleString('en-IN')}*\n\n`;
    text += `_Please clear the payment at the earliest._\n`;
    text += `_Generated by ${operatorName || 'MarginMart Admin'}_`;
    return text;
  };

  const copyStatementText = (shopkeeperId: string) => {
    const text = buildStatementText(shopkeeperId);
    navigator.clipboard.writeText(text);
    showToast('Statement copied to clipboard!');
  };

  const shareStatement = async (shopkeeperId: string) => {
    const text = buildStatementText(shopkeeperId);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'MarginMart Statement', text });
      } catch (err) {
        copyStatementText(shopkeeperId);
      }
    } else {
      copyStatementText(shopkeeperId);
    }
  };

  const emailStatement = (shopkeeperId: string) => {
    const partner = shopkeepers.find(s => s.id === shopkeeperId);
    const text = buildStatementText(shopkeeperId);
    const subject = `MarginMart Statement - ${partner?.name}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };

  const downloadOrdersCSV = () => {
    const headers = ['Order ID', 'Product', 'Qty', 'MRP/Pc', 'Deal Price', 'Selling Price', 'Saving/pc', 'Our Profit', 'Shopkeeper', 'Status', 'Date'];
    const rows = orders.map(o => {
      const qty = o.quantity || 1;
      const rate = o.selling_price / qty;
      const savingPerPc = o.mrp ? (o.mrp - rate) : 0;
      return [
        o.id,
        `"${o.product_name.replace(/"/g, '""')}"`,
        qty,
        o.mrp || 0,
        o.deal_price,
        o.selling_price,
        savingPerPc,
        o.selling_price - o.deal_price,
        `"${shopkeepers.find(s => s.id === o.shopkeeper_id)?.name?.replace(/"/g, '""') || 'Unknown'}"`,
        o.status,
        new Date(o.created_at).toLocaleDateString()
      ];
    });
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MarginMart_Orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPartnersCSV = () => {
    const headers = ['Name', 'Phone', 'Address', 'Onboarded By', 'Joined Date'];
    const rows = shopkeepers.map(sk => [
      `"${sk.name.replace(/"/g, '""')}"`,
      `"${sk.phone}"`,
      `"${(sk.address || '').replace(/"/g, '""')}"`,
      `"${sk.operator_name || 'Admin'}"`,
      `"${new Date(sk.created_at).toLocaleDateString()}"`
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MarginMart_Partners_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = `Hello ${name}, this is MarginMart Admin.`;
    window.open(`https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const filteredShopkeepers = shopkeepers.filter(sk => {
    if (!searchQuery) return true;
    const qWords = searchQuery.toLowerCase().trim().split(/[\s,.-]+/);
    const targetWords = sk.name.toLowerCase().split(/[\s,.-]+/);
    const nameMatches = qWords.every(qw => targetWords.includes(qw));
    const phoneMatches = sk.phone.includes(searchQuery);
    return nameMatches || phoneMatches;
  });

  const filteredOrders = orders.filter(o => {
    const qWords = orderSearchQuery.toLowerCase().trim().split(/[\s,.-]+/);
    const productWords = o.product_name.toLowerCase().split(/[\s,.-]+/);
    const skWords = o.shopkeeper?.name.toLowerCase().split(/[\s,.-]+/) || [];
    
    const matchesSearch = !orderSearchQuery || 
      qWords.every(qw => productWords.includes(qw)) ||
      qWords.every(qw => skWords.includes(qw));
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Analytics Calculations
  const totalProfit = orders.reduce((sum, o) => sum + (o.selling_price - o.deal_price), 0);
  const pendingCollection = orders.filter(o => o.status !== 'paid').reduce((sum, o) => sum + o.selling_price, 0);
  const todayRevenue = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).reduce((sum, o) => sum + o.selling_price, 0);
  const totalRevenue = orders.reduce((sum, o) => sum + o.selling_price, 0);


  // Operator Performance
  const operatorStats = orders.reduce((acc: any, o) => {
    const name = o.operator_name || 'System/Legacy';
    if (!acc[name]) acc[name] = 0;
    acc[name]++;
    return acc;
  }, {});

  return (
    <div
      className={`admin-pro-theme ${keyboardOpen ? 'keyboard-open' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence>
        {isRefreshing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 60, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22c55e',
              fontSize: '0.8rem',
              fontWeight: 800,
              gap: '0.5rem',
              overflow: 'hidden'
            }}
          >
            <RefreshCw size={18} className="spin" />
            UPDATING...
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ background: '#ef4444', color: 'white', textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, padding: '0.5rem', position: 'sticky', top: 0, zIndex: 1000, textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Offline Mode • Changes may not sync
          </motion.div>
        )}
      </AnimatePresence>

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
              {!isEditingOperator && operatorName ? (
                <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operator</div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-main)' }}>{operatorName}</div>
                  <button
                    onClick={() => setIsEditingOperator(true)}
                    className="btn-pro-ghost"
                    style={{ fontSize: '0.65rem', marginTop: '4px', padding: '2px 12px', borderColor: 'rgba(0,0,0,0.1)' }}
                  >
                    Change Operator
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: '0.5rem' }}>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Enter Operator Name"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && operatorName.trim()) {
                        localStorage.setItem('mm_operator_name', operatorName);
                        setIsEditingOperator(false);
                      }
                    }}
                    className="form-input-premium"
                    style={{ textAlign: 'center', width: '100%' }}
                  />
                  <div style={{ fontSize: '0.65rem', textAlign: 'center', opacity: 0.5, marginTop: '4px' }}>Press Enter to save name</div>
                </div>
              )}
              <div style={{ position: 'relative', width: '200px', margin: '0 auto' }}>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                    setPin(val);
                    if (val.length === 4) {
                      checkPin(val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pin.length === 4) {
                      checkPin(pin);
                    }
                  }}
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
                    opacity: 0
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
            <button onClick={() => checkPin()} className="btn-unlock" style={{ width: '100%', maxWidth: '320px', margin: '0 auto' }}>Unlock Dashboard</button>
            <button onClick={onBack} className="btn-cancel-login">← Back to Site</button>
          </motion.div>
        </div>
      ) : (
        <div className="admin-pro-theme">
          <AnimatePresence>
            {isRefreshing && (
              <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 20, opacity: 1 }}
                exit={{ y: -50, opacity: 0 }}
                className="refresh-indicator"
                style={{
                  position: 'fixed',
                  top: '100px',
                  left: '50%',
                  x: '-50%',
                  zIndex: 2000,
                  background: 'white',
                  padding: '0.6rem 1.25rem',
                  borderRadius: '999px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: 'var(--admin-accent)',
                  border: '1px solid #f1f5f9'
                }}
              >
                <Loader2 className="animate-spin" size={18} /> Updating...
              </motion.div>
            )}
          </AnimatePresence>

          {isMobile && pullDistance > 0 && (
            <div
              className="pull-to-refresh-indicator"
              style={{
                height: `${pullDistance}px`,
                opacity: pullDistance / pullThreshold,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: 'var(--bg-main)',
                transition: pullDistance === 0 ? 'height 0.3s ease, opacity 0.3s ease' : 'none'
              }}
            >
              <div className={`refresh-icon-wrapper ${pullDistance > pullThreshold ? 'ready' : ''}`}>
                <Loader2 className={isRefreshing ? "animate-spin" : ""} size={20} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
              </div>
            </div>
          )}

          <div
            className={`admin-layout ${isMobile ? 'mobile' : ''}`}
            onTouchStart={isMobile ? handleTouchStart : undefined}
            onTouchMove={isMobile ? handleTouchMove : undefined}
            onTouchEnd={isMobile ? handleTouchEnd : undefined}
            style={pullDistance > 0 ? { transform: `translateY(${pullDistance}px)`, transition: 'none' } : { transition: 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)' }}
          >
            {/* Mobile Top Header - Simplified for Section 1.2 */}
            <div className="admin-mobile-header">
              <BrandLogo dark badge="Admin" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <button
                  onClick={() => { fetchOrders(); fetchMatches(); fetchShopkeepers(); showToast('Data Refreshed'); }}
                  className="btn-refresh-mobile"
                  aria-label="Refresh Data"
                >
                  <RefreshCw size={18} />
                </button>
                <button
                  onClick={() => { sessionStorage.removeItem('adminAuth'); setIsAuthorized(false); }}
                  className="btn-logout-mobile"
                  aria-label="Logout"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>

            {/* Sidebar - Desktop Only */}
            {!isMobile && (
              <aside className="admin-sidebar">
                <div className="sidebar-logo">
                  <BrandLogo dark badge="Admin Pro" />
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
                    <div className="sk-avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>{operatorName?.[0]?.toUpperCase() || '?'}</div>
                    <div>
                      <div className="operator-label">Operator</div>
                      <div className="operator-name-sidebar">{operatorName}</div>
                    </div>
                  </div>
                  <button onClick={() => { sessionStorage.removeItem('adminAuth'); setIsAuthorized(false); }} className="btn-logout">
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              </aside>
            )}

            {/* Main Content */}
            <main className="admin-main">
              <AnimatePresence mode="wait">
                {activeTab === 'overview' && (
                  <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <header className="page-header">
                      <div className="page-title"><h1>Business Overview</h1><p>Real-time health of your order network.</p></div>
                    </header>
                    <div className="stats-overview">
                      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="stat-card-mini">
                        <h4>Total Revenue</h4>
                        <div className="val" style={{ color: '#8b5cf6' }}>₹{totalRevenue.toLocaleString('en-IN')}</div>
                        <BarChart3 style={{ color: '#8b5cf6' }} size={20} />
                      </motion.div>
                      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="stat-card-mini">
                        <h4>Total Net Profit</h4>
                        <div className="val text-green">₹{totalProfit.toLocaleString('en-IN')}</div>
                        <TrendingUp className="text-green" />
                      </motion.div>
                      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="stat-card-mini">
                        <h4>Pending Collection</h4>
                        <div className="val text-orange">₹{pendingCollection.toLocaleString('en-IN')}</div>
                        <Clock className="text-orange" />
                      </motion.div>
                      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="stat-card-mini">
                        <h4>Today's Revenue</h4>
                        <div className="val text-green">₹{todayRevenue.toLocaleString('en-IN')}</div>
                        <IndianRupee className="text-green" size={20} />
                      </motion.div>
                      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="stat-card-mini">
                        <h4>Today's Orders</h4>
                        <div className="val">{orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length}</div>
                        <ShoppingBag />
                      </motion.div>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'clamp(200px, 60%, 1.5fr) 1fr',
                      gap: '2rem', marginTop: '2rem'
                    }} className="overview-two-col">
                      <div className="data-table-container" style={{ order: isMobile ? 1 : 0 }}>
                        <div className="table-controls"><h3>Recent Orders</h3></div>
                        {orders.length === 0 ? (
                          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>No orders yet</div>
                        ) : (
                          <div className={isMobile ? "mobile-list-container" : "table-body"}>
                            {orders.slice(0, 5).map(o => (
                              isMobile ? (
                                <div key={o.id} className="mobile-statement-item">
                                  <div className="item-header">
                                    <div className="item-title">{o.shopkeeper?.name}</div>
                                    <div className={`status-badge ${o.status}`} style={{ fontSize: '0.6rem' }}>{o.status}</div>
                                  </div>
                                  <div className="item-meta">
                                    <span style={{ fontWeight: 600 }}>{o.product_name}</span>
                                    <span style={{ fontWeight: 800 }}>₹{o.selling_price.toLocaleString()}</span>
                                    {o.operator_name && <span style={{ gridColumn: '1 / -1', opacity: 0.7, fontSize: '0.75rem', marginTop: '0.2rem' }}>Ordered by: {o.operator_name}</span>}
                                  </div>
                                </div>
                              ) : (
                                <div key={o.id} className="sk-row" style={{ '--grid-cols': '2.4fr 1fr 1fr' } as any}>
                                  <div className="sk-name-cell">
                                    <h4>{o.shopkeeper?.name}</h4>
                                    <p>{o.product_name} {o.operator_name && <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>• Handled by {o.operator_name}</span>}</p>
                                  </div>
                                  <div className={`status-badge ${o.status}`} style={{ fontSize: '0.6rem' }}>{o.status}</div>
                                  <div style={{ textAlign: 'right', fontWeight: 700 }}>₹{o.selling_price}</div>
                                </div>
                              )
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="watchlist-card" style={{ order: isMobile ? 2 : 0 }}>
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
                )}
                {activeTab === 'automation' && (
                  <motion.div
                    key="automation"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <header className="page-header">
                      <div className="page-title">
                        <h1>Automation Center</h1>
                        <p>Manage real-time deal discovery and listeners</p>
                      </div>
                      <div className="header-actions">
                        <div className={`status-pill ${isBotActive ? 'pulse active' : ''}`}>
                          <div className={`status-dot ${isBotActive ? 'green' : 'red'}`}></div>
                          Listener: {isBotActive ? 'Active' : 'Offline'}
                        </div>
                      </div>
                    </header>

                    <div className="automation-grid" style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))',
                      gap: '1.5rem', marginTop: '2rem'
                    }}>
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
                                Add Telegram @usernames to scrape in real-time.
                              </p>

                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                                {monitorChannels.map(channel => (
                                  <div key={channel} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.4rem 0.75rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                                    <span>@{channel.replace('@', '')}</span>
                                    <button
                                      onClick={() => setMonitorChannels(prev => prev.filter(c => c !== channel))}
                                      style={{ background: 'transparent', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                <input
                                  type="text"
                                  placeholder="Add new channel (e.g. deals)"
                                  className="admin-input"
                                  inputMode="text"
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  autoComplete="off"
                                  spellCheck={false}
                                  style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                  value={newChannelInput}
                                  onChange={e => setNewChannelInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && newChannelInput.trim()) {
                                      const cleaned = newChannelInput.trim().replace('@', '');
                                      if (!monitorChannels.includes(cleaned)) {
                                        setMonitorChannels(prev => [...prev, cleaned]);
                                      }
                                      setNewChannelInput('');
                                    }
                                  }}
                                />
                                <button
                                  className="btn-pro-ghost"
                                  style={{ padding: '0.75rem 1.25rem', borderRadius: '12px', background: '#f1f5f9', color: '#475569', fontWeight: 700 }}
                                  onClick={() => {
                                    if (newChannelInput.trim()) {
                                      const cleaned = newChannelInput.trim().replace('@', '');
                                      if (!monitorChannels.includes(cleaned)) {
                                        setMonitorChannels(prev => [...prev, cleaned]);
                                      }
                                      setNewChannelInput('');
                                    }
                                  }}
                                >
                                  Add
                                </button>
                              </div>
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
                            <span className="value" style={{ fontWeight: 700, color: '#0f172a' }}>{totalWatchlistCount} Products</span>
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
                            <span className="num" style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#22c55e' }}>24/7</span>
                            <span className="lbl" style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Monitoring Live</span>
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
                                  if (m.telegram_link.startsWith('private||')) {
                                    source = `🔒 ${m.telegram_link.split('private||')[1]}`;
                                  } else if (m.telegram_link.includes('t.me/c/')) {
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
                )}

                {activeTab === 'matches' && (
                  <motion.div
                    key="matches"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <header className="page-header"><div className="page-title"><h1>Detections Log</h1><p>Persistent record of matches found by the engine.</p></div></header>
                    <div className="data-table-container">
                      {!isMobile && (
                        <div className="sk-row header-row" style={{ '--grid-cols': '2fr 1.5fr 1fr 100px' } as any}>
                          <span>Partner & Product</span>
                          <span>Detection Date</span>
                          <span>Matched Keyword</span>
                          <span style={{ textAlign: 'right' }}>Source</span>
                        </div>
                      )}
                      {matches.length === 0 ? (
                        <EmptyState
                          icon={Zap}
                          title="No Detections Yet"
                          description="The engine will log matches here as soon as they are found in Telegram groups."
                        />
                      ) : (
                        <div className={isMobile ? "mobile-list-container" : ""}>
                          {matches.slice(0, visibleMatchCount).map(match => (
                            isMobile ? (
                              <DetectionCard key={match.id} match={match} onViewMsg={setViewingMessage} />
                            ) : (
                              <div key={match.id} className="sk-row" style={{ '--grid-cols': '2fr 1.5fr 1fr 100px' } as any}>
                                <div className="sk-name-cell">
                                  <h4>{match.shopkeeper?.name}</h4>
                                  <p>{match.product_name}</p>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(match.created_at).toLocaleString()}</div>
                                <div><span className="status-pill active">{match.matched_keyword}</span></div>
                                <div style={{ textAlign: 'right' }}>
                                  <button onClick={() => setViewingMessage(match.original_text || '')} className="btn-pro-ghost">View Msg</button>
                                </div>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                      {matches.length > visibleMatchCount && (
                        <div style={{ padding: '2rem', textAlign: 'center' }}>
                          <button
                            className="btn-pro-secondary"
                            onClick={() => setVisibleMatchCount(prev => prev + 20)}
                          >
                            Load More Matches
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'orders' && (
                  <motion.div
                    key="orders"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <header className="page-header">
                      <div className="page-title"><h1>Order Logs</h1><p>Manage order status and payment collections.</p></div>
                      <div className="header-actions orders-header-actions">
                        {selectedOrderIds.length > 0 && (
                          <button className="btn-pro-ghost" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={bulkDeleteOrders}>
                            <X size={16} /> Delete ({selectedOrderIds.length})
                          </button>
                        )}
                        <div className="status-dropdown-premium">
                          <button 
                            className={`status-dropdown-trigger ${isStatusDropdownOpen ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsStatusDropdownOpen(!isStatusDropdownOpen);
                            }}
                          >
                            <Filter size={16} color="#64748b" />
                            <span>{orderStatusFilter === 'all' ? 'All Orders' : STATUS_METADATA[orderStatusFilter as keyof typeof STATUS_METADATA].label}</span>
                            <ChevronDown size={16} style={{ transform: isStatusDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#94a3b8' }} />
                          </button>

                          {isStatusDropdownOpen && (
                            <motion.div
                              className="status-dropdown-list"
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            >
                              <div className="dropdown-header-label">Filter by Status</div>
                              <div className="dropdown-search-wrap">
                                <Search size={16} color="#22c55e" />
                                <input 
                                  type="text" 
                                  placeholder="Type to search status..." 
                                  value={statusSearchQuery}
                                  onChange={(e) => setStatusSearchQuery(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="dropdown-items-card">
                                {Object.entries(STATUS_METADATA)
                                  .filter(([_, meta]) => {
                                    if (!statusSearchQuery) return true;
                                    const qWords = statusSearchQuery.toLowerCase().trim().split(/[\s,.-]+/);
                                    const targetWords = meta.label.toLowerCase().split(/[\s,.-]+/);
                                    return qWords.every(qw => targetWords.includes(qw));
                                  })
                                  .map(([status, meta]) => (
                                    <motion.div
                                      key={status}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      className={`dropdown-item ${orderStatusFilter === status ? 'active' : ''}`}
                                      onClick={() => {
                                        setOrderStatusFilter(status as any);
                                        setIsStatusDropdownOpen(false);
                                        setStatusSearchQuery('');
                                      }}
                                    >
                                      <span>{meta.label}</span>
                                      <div className="check-mark">
                                        <CheckCircle size={16} />
                                      </div>
                                    </motion.div>
                                  ))}
                              </div>
                            </motion.div>
                          )}
                        </div>
                        <div className="search-bar-premium" style={{ flex: 1 }}>
                          <Search size={18} color="#94a3b8" />
                          <input
                            type="text"
                            placeholder="Search orders..."
                            value={orderSearchQuery}
                            onChange={(e) => setOrderSearchQuery(e.target.value)}
                          />
                        </div>
                        {!isMobile && <button className="btn-pro-secondary" onClick={downloadOrdersCSV}><Download size={18} /> Export</button>}
                      </div>
                    </header>
                    <div className="data-table-container">
                      {!isMobile && (
                        <div className="sk-row header-row" style={{ '--grid-cols': '50px 2fr 1fr 1.5fr 1fr 50px' } as any}>
                          <span>
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.length > 0 && selectedOrderIds.length === filteredOrders.slice(0, visibleOrderCount).length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOrderIds(filteredOrders.slice(0, visibleOrderCount).map(o => o.id));
                                } else {
                                  setSelectedOrderIds([]);
                                }
                              }}
                            />
                          </span>
                          <span>Partner & Product</span>
                          <span>Order Date</span>
                          <span style={{ textAlign: 'center' }}>Status Update</span>
                          <span style={{ textAlign: 'right' }}>Financials</span>
                          <span></span>
                        </div>
                      )}
                      {loading ? (
                        <SkeletonLoader count={5} height="120px" />
                      ) : filteredOrders.length === 0 ? (
                        <EmptyState
                          icon={History}
                          title="No Orders Found"
                          description="Try adjusting your search or filters to find specific orders."
                        />
                      ) : (
                        <div className="table-body">
                          {isMobile ? (
                            <div className="mobile-list-container">
                              {filteredOrders.slice(0, visibleOrderCount).map(order => (
                                <OrderCard
                                  key={order.id}
                                  order={order}
                                  isSelected={selectedOrderIds.includes(order.id)}
                                  onSelect={(id) => setSelectedOrderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                                  onUpdateStatus={updateOrderStatus}
                                />
                              ))}
                            </div>
                          ) : (
                            filteredOrders.slice(0, visibleOrderCount).map(order => (
                              <div key={order.id} className="sk-row" style={{ '--grid-cols': '50px 2fr 1fr 1.5fr 1fr 50px' } as any}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedOrderIds.includes(order.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedOrderIds(prev => [...prev, order.id]);
                                      } else {
                                        setSelectedOrderIds(prev => prev.filter(id => id !== order.id));
                                      }
                                    }}
                                  />
                                </div>
                                <div className="sk-name-cell">
                                  <h4>{order.shopkeeper?.name}</h4>
                                  <p>{order.product_name}</p>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(order.created_at).toLocaleDateString()}</div>
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
                                  <div style={{ fontWeight: 800, color: '#1e293b' }}>₹{order.selling_price.toLocaleString()}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Qty: {order.quantity || 1} × ₹{(order.unit_rate || (order.deal_price / (order.quantity || 1))).toLocaleString()}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#22c55e', fontWeight: 700 }}>Profit: ₹{(order.selling_price - order.deal_price).toLocaleString()}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <button className="btn-icon text-red-500" onClick={() => showConfirm('Delete this order?', () => deleteOrder(order.id))} title="Delete Order"><Trash2 size={14} /></button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                      {filteredOrders.length > visibleOrderCount && (
                        <div style={{ padding: '2rem', textAlign: 'center' }}>
                          <button
                            className="btn-pro-secondary"
                            onClick={() => setVisibleOrderCount(prev => prev + 10)}
                          >
                            Load More Orders
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'billing' && (
                  <motion.div
                    key="billing"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <header className="page-header">
                      <div className="page-title">
                        <h1>Billing & Statements</h1>
                        <p>Review and generate weekly invoices for your partners.</p>
                      </div>
                    </header>

                    <div className="detail-view" style={isMobile ? { display: 'block' } : { gridTemplateColumns: '350px 1fr', alignItems: 'start' }}>
                      {(!isMobile || !selectedBillPartner) && (
                        <div className="data-table-container" style={isMobile ? { marginBottom: '2rem' } : {}}>
                          <div className="table-controls">
                            <div className="search-input-wrap">
                              <Search size={18} />
                              <input type="text" placeholder="Search partner..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>
                          </div>
              {shopkeepers.filter(sk => {
                if (!searchQuery) return true;
                const qWords = searchQuery.toLowerCase().trim().split(/[\s,.-]+/);
                const targetWords = sk.name.toLowerCase().split(/[\s,.-]+/);
                return qWords.every(qw => targetWords.includes(qw));
              }).map(sk => {
                const partnerOrders = orders.filter(o => o.shopkeeper_id === sk.id && o.status !== 'paid');
                const total = partnerOrders.reduce((sum, o) => sum + o.selling_price, 0);
                return (
                  <div
                    key={sk.id}
                    className={`sk-row ${selectedBillPartner === sk.id ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedBillPartner(sk.id);
                      loadInvoiceHistory(sk.id);
                    }}
                  >
                    <div className="sk-name-cell">
                      <div className="sk-avatar">{sk.name[0]}</div>
                      <div>
                        <h4>{sk.name}</h4>
                        <p>{partnerOrders.length} Orders</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ color: 'var(--admin-accent)' }}>₹{total.toLocaleString('en-IN')}</strong>
                      <ChevronRight size={16} style={{ marginLeft: '8px', opacity: 0.3 }} />
                    </div>
                  </div>
                );
              })}
                        </div>
                      )}

                      {(!isMobile || selectedBillPartner) && (
                        <div className={isMobile ? "billing-mobile-container" : "watchlist-card"} style={isMobile ? {} : { minWidth: 0 }}>
                          {selectedBillPartner ? (
                            <BillingDetail
                              partner={shopkeepers.find(s => s.id === selectedBillPartner)!}
                              orders={orders}
                              isMobile={isMobile}
                              onBack={() => setSelectedBillPartner(null)}
                              onShare={shareStatement}
                              onCopy={copyStatementText}
                              onMarkPaid={markAllAsPaid}
                              onEmail={emailStatement}
                              onGenerateInvoice={async (partner, partnerOrders, opName, isPreview) => {
                                if (isPreview) {
                                  try { await generateInvoice(partner, partnerOrders, opName, true); }
                                  catch (err) { showToast('Failed to preview invoice', 'error'); }
                                } else {
                                  showConfirm(`Generate Final Invoice for ${partnerOrders.length} orders?`, async (shouldMarkPaid) => {
                                    setInvoiceLoading(true);
                                    try {
                                      await generateInvoice(partner, partnerOrders, opName, false);
                                      
                                      if (shouldMarkPaid) {
                                        const { error: updateErr } = await supabase
                                          .from('orders')
                                          .update({ status: 'paid' })
                                          .in('id', partnerOrders.map(o => o.id));
                                        
                                        if (updateErr) throw updateErr;
                                        showToast('Final Invoice issued and orders marked as PAID');
                                      } else {
                                        showToast('Final Invoice issued');
                                      }

                                      await loadInvoiceHistory(partner.id);
                                      fetchOrders();
                                    } catch (err) {
                                      console.error('Final Invoice error:', err);
                                      showToast('Failed to issue final invoice', 'error');
                                    } finally {
                                      setInvoiceLoading(false);
                                    }
                                  }, "Mark these orders as PAID?", 'success');
                                }
                              }}
                              invoiceLoading={invoiceLoading}
                              operatorName={operatorName}
                              invoiceHistory={invoiceHistory}
                            />
                          ) : (
                            <EmptyState
                              icon={CreditCard}
                              title="Select a Partner"
                              description="Pick a partner from the left to view their detailed statement and manage billing."
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'simulator' && (
                  <motion.div
                    key="simulator"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <header className="page-header">
                      <div className="page-title"><h1>Match Simulator</h1><p>Test matching logic with sample Telegram deals.</p></div>
                    </header>
                    <div className="watchlist-card" style={{ marginBottom: '2rem' }}>
                      <textarea
                        className="form-input-premium"
                        rows={isMobile ? 4 : 6}
                        placeholder="Paste Telegram text here..."
                        value={simText}
                        onChange={(e) => setSimText(e.target.value)}
                        onFocus={(e) => isMobile && e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        style={{ width: '100%', padding: '1.5rem', marginBottom: '1.5rem' }}
                      />
                      <button onClick={runSimulator} disabled={simLoading} className="btn-pro-primary" style={{ width: '100%', justifyContent: 'center', height: '56px' }}>
                        {simLoading ? <><Loader2 className="animate-spin" size={18} /> Analyzing...</> : 'Run Logic Test'}
                      </button>
                    </div>

                    {simResults.length > 0 && (
                      <div className={isMobile ? "mobile-list-container" : "data-table-container"}>
                        {!isMobile && <div className="table-controls"><h3>Matching Results</h3></div>}
                        {simResults.map((res, i) => (
                          <motion.div
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: i * 0.05 }}
                            key={i}
                          >
                            <SimulatorResultCard
                              res={res}
                              isMobile={isMobile}
                              onViewMsg={setViewingMessage}
                              onSave={() => saveSimMatch(res.shopkeeperId, res.match)}
                            />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'shopkeepers' && (
                  <AnimatePresence mode="wait">
                    {selectedShopkeeper ? (
                      <motion.div
                        key="detail"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className={isMobile ? "mobile-detail-overlay" : ""}>
                          <div className="mobile-back-bar">
                            <button onClick={() => setSelectedShopkeeper(null)} className="btn-pro-ghost">
                              <ArrowLeft size={16} /> Back to Partners
                            </button>
                          </div>
                          <div className="detail-view">
                            <div className="info-card">
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
                                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem' }}>
                                  <input placeholder="Add keyword (e.g. Rice)" className="form-input-premium" value={newProduct} onChange={(e) => setNewProduct(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addToWatchlist(newProduct)} />
                                  <button className="btn-pro-primary" onClick={() => addToWatchlist(newProduct)} style={{ padding: '0.75rem 1.25rem', height: '48px' }}><Plus size={20} /></button>
                                </div>
                                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                                  <input placeholder="Size (e.g. 500g, 1L)" className="form-input-premium" value={newProductSize} onChange={(e) => setNewProductSize(e.target.value)} style={{ height: '40px', fontSize: '0.85rem' }} />
                                  <input placeholder="Supplier Rate (₹)" className="form-input-premium" type="number" value={newSupplierRate} onChange={(e) => setNewSupplierRate(e.target.value)} style={{ height: '40px', fontSize: '0.85rem' }} />
                                </div>
                                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                                  <input placeholder="Description (e.g. pink powder, white cream)" className="form-input-premium" value={newProductDesc} onChange={(e) => setNewProductDesc(e.target.value)} style={{ height: '40px', fontSize: '0.85rem' }} />
                                </div>
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                                    <ShoppingBag size={14} className="text-green-500" />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Watchlist ({watchlist.length})</span>
                                  </div>
                                  {watchlist.length > 0 && (
                                    <button onClick={() => clearWatchlist(selectedShopkeeper.id)} style={{ color: '#ef4444', background: 'transparent', border: 'none', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                                      Clear All
                                    </button>
                                  )}
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
                                            <span title={[item.description && `Desc: ${item.description}`, item.product_size && `Size: ${item.product_size}`, item.supplier_rate && `Supplier Rate: ₹${item.supplier_rate}`, item.operator_name && `Added by ${item.operator_name}`].filter(Boolean).join(' | ')}>
                                              {kw}
                                              {item.product_size && <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '4px' }}>({item.product_size})</span>}
                                              {item.supplier_rate && <span style={{ fontSize: '0.7rem', color: '#10b981', marginLeft: '4px' }}>₹{item.supplier_rate}</span>}
                                              {item.description && <span style={{ fontSize: '0.65rem', color: '#8b5cf6', marginLeft: '4px', fontStyle: 'italic' }}>{item.description}</span>}
                                            </span>
                                            <button onClick={() => removeFromWatchlist(item.id, item.product_name)}><X size={14} /></button>
                                          </motion.div>
                                        ))}
                                      </React.Fragment>
                                    ))}
                                  </AnimatePresence>
                                  {watchlist.length === 0 && (
                                    <EmptyState
                                      icon={ShoppingCart}
                                      title="Empty Watchlist"
                                      description="Use suggestions or type above to track products."
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="list"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <header className="page-header">
                          <div className="page-title"><h1>Partner Network</h1><p>Active shopkeepers and their watchlists.</p></div>
                          {!isMobile && (
                            <div style={{ display: 'flex', gap: '1rem' }}>
                              <button onClick={downloadPartnersCSV} className="btn-pro-secondary"><Download size={18} /> CSV</button>
                              <button onClick={() => { setFormState({ id: '', name: '', phone: '', address: '' }); setShowAddModal(true); }} className="btn-pro-primary"><Plus size={20} /> Add Partner</button>
                            </div>
                          )}
                        </header>
                        <div className="data-table-container">
                          <div className="table-controls">
                            <div className="search-input-wrap">
                              <Search size={18} />
                              <input type="text" placeholder="Search partners..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>
                            {isMobile && (
                              <button
                                onClick={() => { setFormState({ id: '', name: '', phone: '', address: '' }); setShowAddModal(true); }}
                                className="btn-pro-primary"
                                style={{ width: '100%', marginTop: '0.75rem', justifyContent: 'center' }}
                              >
                                <Plus size={20} /> Add New Partner
                              </button>
                            )}
                          </div>
                          <div className="sk-row header-row" style={{ '--grid-cols': '1.5fr 1fr 140px 140px' } as any}>
                            <span>Partner Info</span>
                            <span>Location</span>
                            <span style={{ textAlign: 'center' }}>Fulfillment</span>
                            <span style={{ textAlign: 'right' }}>Manage</span>
                          </div>
                          <div className="table-body">
                            {loading ? (
                              <SkeletonLoader count={5} height="100px" />
                            ) : filteredShopkeepers.length === 0 ? (
                              <EmptyState
                                icon={Users}
                                title="No Partners Found"
                                description="Your search didn't match any partners. Try a different query."
                              />
                            ) : isMobile ? (
                              <div className="mobile-list-container">
                                {filteredShopkeepers.map(sk => (
                                  <PartnerCard
                                    key={sk.id}
                                    partner={sk}
                                    onEdit={(p) => { setSelectedShopkeeper(p); fetchWatchlist(p.id); }}
                                    onLogOrder={(p) => { setOrderPartner(p); setShowOrderModal(true); }}
                                  />
                                ))}
                              </div>
                            ) : (
                              filteredShopkeepers.map(sk => (
                                <motion.div layout key={sk.id} className="sk-row" style={{ '--grid-cols': '1.5fr 1fr 140px 140px' } as any}>
                                  <div className="sk-name-cell">
                                    <div className="sk-avatar">{sk.name.charAt(0)}</div>
                                    <div>
                                      <h4>{sk.name}</h4>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {sk.phone}
                                        <button
                                          className="btn-icon"
                                          style={{ color: '#25d366', padding: '2px', height: '24px', width: '24px' }}
                                          onClick={() => openWhatsApp(sk.phone, sk.name)}
                                          title="Chat on WhatsApp"
                                        >
                                          <MessageSquare size={14} />
                                        </button>
                                      </div>
                                      {sk.operator_name && <span style={{ opacity: 0.5 }}>• By {sk.operator_name}</span>}
                                    </div>
                                  </div>
                                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{sk.address}</div>
                                  <div style={{ textAlign: 'center' }}>
                                    <button className="btn-pro-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => { setOrderPartner(sk); setShowOrderModal(true); }}>
                                      <ShoppingBag size={14} /> Log Order
                                    </button>
                                  </div>
                                  <div style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button className="btn-icon text-red-500" onClick={() => deleteShopkeeper(sk.id)} title="Delete Partner"><X size={14} /></button>
                                    <button className="btn-pro-ghost" onClick={() => { setSelectedShopkeeper(sk); fetchWatchlist(sk.id); }}>Manage <ChevronRight size={16} /></button>
                                  </div>
                                </motion.div>
                              ))
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </AnimatePresence>
            </main>

            {/* Bottom Navigation */}
            {isMobile && (
              <nav className="admin-mobile-bottom-nav">
                <div className="nav-items">
                  <button
                    className={`nav-tab${activeTab === 'overview' ? ' active' : ''}`}
                    onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setActiveTab('overview'); }}
                  >
                    <LayoutDashboard size={20} />
                    <span>Overview</span>
                  </button>
                  <button
                    className={`nav-tab${activeTab === 'shopkeepers' ? ' active' : ''}`}
                    onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setActiveTab('shopkeepers'); }}
                  >
                    <Users size={20} />
                    <span>Partners</span>
                  </button>
                  <button
                    className={`nav-tab${activeTab === 'orders' ? ' active' : ''}`}
                    onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setActiveTab('orders'); }}
                    style={{ position: 'relative' }}
                  >
                    <ShoppingBag size={20} />
                    <span>Orders</span>
                    {orders.filter(o => o.status !== 'paid').length > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: '4px',
                        right: 'calc(50% - 18px)',
                        background: '#ef4444',
                        color: 'white',
                        fontSize: '0.6rem',
                        fontWeight: 900,
                        minWidth: '16px',
                        height: '16px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid white'
                      }}>
                        {orders.filter(o => o.status !== 'paid').length}
                      </span>
                    )}
                  </button>
                  <button
                    className={`nav-tab${activeTab === 'billing' ? ' active' : ''}`}
                    onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setActiveTab('billing'); }}
                  >
                    <IndianRupee size={20} />
                    <span>Billing</span>
                  </button>
                  <button
                    className={`nav-tab${showMoreDrawer ? ' active' : ''}`}
                    onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setShowMoreDrawer(true); }}
                  >
                    <MoreHorizontal size={20} />
                    <span>More</span>
                  </button>
                </div>
              </nav>
            )}



            {/* More Drawer */}
            <AnimatePresence>
              {showMoreDrawer && (
                <div className="drawer-overlay" onClick={() => setShowMoreDrawer(false)}>
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    className="more-drawer"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="drawer-handle" />
                    <div className="drawer-header">
                      <h3>Operational Tools</h3>
                    </div>
                    <div className="drawer-grid">
                      <button onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setFormState({ id: '', name: '', phone: '', address: '' }); setShowAddModal(true); setShowMoreDrawer(false); }}>
                        <UserPlus size={24} />
                        <span>Add Partner</span>
                      </button>
                      <button onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setShowOrderModal(true); setShowMoreDrawer(false); }}>
                        <ShoppingBag size={24} />
                        <span>Log Order</span>
                      </button>
                      <button onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setActiveTab('automation'); setShowMoreDrawer(false); }}>
                        <Zap size={24} />
                        <span>Automation</span>
                      </button>
                      <button onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setActiveTab('simulator'); setShowMoreDrawer(false); }}>
                        <Target size={24} />
                        <span>Simulator</span>
                      </button>
                      <button onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setActiveTab('matches'); setShowMoreDrawer(false); }}>
                        <Bell size={24} />
                        <span>Detections</span>
                      </button>
                      <button onClick={() => { if (navigator.vibrate) navigator.vibrate(20); downloadOrdersCSV(); setShowMoreDrawer(false); }}>
                        <Download size={24} />
                        <span>Export CSV</span>
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Combined Quick Action FABs */}
            <AnimatePresence>
              {isMobile && !showAddModal && !showOrderModal && !showMoreDrawer && !selectedShopkeeper && (
                <>
                  {activeTab === 'shopkeepers' && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0, opacity: 0, y: 20 }}
                      className="quick-action-fab"
                      aria-label="Add Partner"
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(40);
                        setFormState({ id: '', name: '', phone: '', address: '' });
                        setShowAddModal(true);
                      }}
                    >
                      <UserPlus size={30} />
                    </motion.button>
                  )}
                  {(activeTab === 'orders' || activeTab === 'overview' || activeTab === 'matches') && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0, opacity: 0, y: 20 }}
                      className="quick-action-fab"
                      aria-label="Log Order"
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(40);
                        setShowOrderModal(true);
                      }}
                    >
                      <PlusCircle size={30} />
                    </motion.button>
                  )}
                </>
              )}
            </AnimatePresence>

            {/* Invoice modal replaced by InvoiceGenerator utility (src/utils/invoiceGenerator.ts) */}

            {/* Modals */}
            <AnimatePresence>
              <PartnerFormModal
                isOpen={showAddModal || showEditModal}
                onClose={() => { setShowAddModal(false); setShowEditModal(false); }}
                formState={formState}
                setFormState={setFormState}
                onSubmit={handleSaveShopkeeper}
                saving={saving}
                isMobile={isMobile}
                mode={showAddModal ? 'add' : 'edit'}
              />

              <LogOrderModal
                isOpen={showOrderModal}
                onClose={() => { setShowOrderModal(false); setOrderPartner(null); }}
                partner={orderPartner || selectedShopkeeper}
                orderForm={orderForm}
                setOrderForm={setOrderForm}
                onSubmit={logOrder}
                saving={saving}
                isMobile={isMobile}
                partners={shopkeepers}
                onPartnerSelect={(p) => setOrderPartner(p)}
              />
            </AnimatePresence>
            {/* Toast Notification */}
            <AnimatePresence>
              {notification && (
                <motion.div
                  initial={isMobile ? { y: -50, opacity: 0 } : { y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={isMobile ? { y: -50, opacity: 0 } : { y: 50, opacity: 0 }}
                  className={`toast-notification ${notification.type}${isMobile ? ' toast-mobile-top' : ''}`}
                >
                  {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                  {notification.message}
                </motion.div>
              )}
              <MessageModal
                isOpen={!!viewingMessage}
                onClose={() => setViewingMessage(null)}
                title="Telegram Message"
                message={viewingMessage || ''}
                isMobile={isMobile}
              />
            </AnimatePresence>


            {/* Bulk Select Bar - Mobile Only */}
            {isMobile && activeTab === 'orders' && selectedOrderIds.length > 0 && (
              <motion.div
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                className="bulk-select-bar"
                role="complementary"
                aria-label="Bulk actions for selected orders"
              >
                <div className="bulk-info">
                  <span className="bulk-badge">{selectedOrderIds.length}</span>
                  <span>Selected</span>
                </div>
                <div className="bulk-actions">
                  <button
                    className="btn-pro-ghost"
                    style={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)', padding: '0.5rem 1rem' }}
                    onClick={() => setSelectedOrderIds([])}
                  >
                    Clear
                  </button>
                  <button
                    className="btn-pro-primary"
                    style={{ background: '#ef4444', borderColor: '#ef4444', padding: '0.5rem 1rem' }}
                    onClick={() => bulkDeleteOrders()}
                  >
                    Delete All
                  </button>
                </div>
              </motion.div>
            )}

            <ConfirmModal
              isOpen={!!confirmDialog}
              onClose={() => setConfirmDialog(null)}
              onConfirm={(checked) => {
                if (navigator.vibrate) navigator.vibrate(20);
                confirmDialog?.onConfirm(checked);
              }}
              message={confirmDialog?.message || ''}
              checkboxLabel={confirmDialog?.checkboxLabel}
              isMobile={isMobile}
              variant={confirmDialog?.variant}
            />
          </div>
        </div>
      )}
    </div>
  );
}
