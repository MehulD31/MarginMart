import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, User, TrendingDown } from 'lucide-react';
import type { Order } from '../../../types/database';

interface ProfitBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  isMobile: boolean;
}

export const ProfitBreakdownModal: React.FC<ProfitBreakdownModalProps> = ({
  isOpen,
  onClose,
  orders,
  isMobile
}) => {
  const [activeTab, setActiveTab] = useState<'profit' | 'loss'>('profit');

  if (!isOpen) return null;

  // Process all orders
  const processedOrders = orders
    .map(o => ({
      ...o,
      profit: (o.selling_price || 0) - (o.deal_price || 0)
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const profitOrders = processedOrders.filter(o => o.profit > 0);
  const lossOrders = processedOrders.filter(o => o.profit < 0);

  const totalProfit = profitOrders.reduce((sum, o) => sum + o.profit, 0);
  const totalLoss = Math.abs(lossOrders.reduce((sum, o) => sum + o.profit, 0));
  const netTotal = totalProfit - totalLoss;

  const currentList = activeTab === 'profit' ? profitOrders : lossOrders;

  return (
    <div className="modal-overlay">
      <motion.div
        initial={isMobile ? { y: '100%' } : { scale: 0.9, opacity: 0 }}
        animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
        exit={isMobile ? { y: '100%' } : { scale: 0.9, opacity: 0 }}
        className={`modal ${isMobile ? 'is-bottom-sheet' : ''}`}
        style={{ maxWidth: '600px', width: isMobile ? '100%' : '500px', overflow: 'hidden' }}
      >
        <div className="modal-header" style={{ paddingBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              background: netTotal >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
              padding: '0.5rem', 
              borderRadius: '8px', 
              color: netTotal >= 0 ? '#22c55e' : '#ef4444' 
            }}>
              {netTotal >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
            <div style={{ textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Business Breakdown</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                Net: <span style={{ color: netTotal >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                  {netTotal >= 0 ? '+' : '-'}₹{Math.abs(netTotal).toLocaleString('en-IN')}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-pro-ghost" style={{ padding: '0.5rem' }}><X size={24} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 1rem', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
          <button 
            onClick={() => setActiveTab('profit')}
            style={{
              flex: 1,
              padding: '1rem',
              border: 'none',
              background: 'none',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: activeTab === 'profit' ? '#22c55e' : '#94a3b8',
              borderBottom: activeTab === 'profit' ? '3px solid #22c55e' : '3px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            Profits (₹{totalProfit.toLocaleString()})
          </button>
          <button 
            onClick={() => setActiveTab('loss')}
            style={{
              flex: 1,
              padding: '1rem',
              border: 'none',
              background: 'none',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: activeTab === 'loss' ? '#ef4444' : '#94a3b8',
              borderBottom: activeTab === 'loss' ? '3px solid #ef4444' : '3px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            Losses (₹{totalLoss.toLocaleString()})
          </button>
        </div>

        <div className="custom-scrollbar" style={{
          maxHeight: '50vh',
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          background: '#f8fafc',
          minHeight: '200px'
        }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: activeTab === 'profit' ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: activeTab === 'profit' ? 10 : -10 }}
              transition={{ duration: 0.2 }}
            >
              {currentList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 2rem', opacity: 0.5 }}>
                  {activeTab === 'profit' ? <TrendingUp size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} /> : <TrendingDown size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />}
                  <p>No {activeTab === 'profit' ? 'profit' : 'loss'} generating orders in this category.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {currentList.map((order) => (
                    <div
                      key={order.id}
                      style={{
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.25rem' }}>
                          {order.product_name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                          <User size={14} />
                          <span>{order.shopkeeper?.name || 'Unknown Partner'}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                          {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: order.profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 800, fontSize: '1.1rem' }}>
                          {order.profit >= 0 ? '+' : '-'}₹{Math.abs(order.profit).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                          {order.profit >= 0 ? 'Net Profit' : 'Net Loss'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className={isMobile ? "sticky-action-bar" : ""} style={{ padding: '1.25rem', background: 'white', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="btn-pro-primary" style={{ width: '100%' }}>
            Close Breakdown
          </button>
        </div>
      </motion.div>
    </div>
  );
};
