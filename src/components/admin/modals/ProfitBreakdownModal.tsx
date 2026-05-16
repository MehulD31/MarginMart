import React from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, User } from 'lucide-react';
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
  if (!isOpen) return null;

  // Calculate profit for each order
  const profitOrders = orders
    .map(o => ({
      ...o,
      profit: (o.selling_price || 0) - (o.deal_price || 0)
    }))
    .filter(o => o.profit > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalProfit = profitOrders.reduce((sum, o) => sum + o.profit, 0);

  return (
    <div className="modal-overlay">
      <motion.div
        initial={isMobile ? { y: '100%' } : { scale: 0.9, opacity: 0 }}
        animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
        exit={isMobile ? { y: '100%' } : { scale: 0.9, opacity: 0 }}
        drag={isMobile ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => {
          if (isMobile && info.offset.y > 100) onClose();
        }}
        className={`modal ${isMobile ? 'is-bottom-sheet' : ''}`}
        style={{ maxWidth: '600px', width: isMobile ? '100%' : '500px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#22c55e' }}>
              <TrendingUp size={20} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Profit Breakdown</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Total Profit: ₹{totalProfit.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-pro-ghost" style={{ padding: '0.5rem' }}><X size={24} /></button>
        </div>

        <div style={{
          maxHeight: '60vh',
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          background: '#f8fafc'
        }}>
          {profitOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 2rem', opacity: 0.5 }}>
              <TrendingUp size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
              <p>No profit generating orders yet.</p>
            </div>
          ) : (
            profitOrders.map((order) => (
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
                  <div style={{ color: '#22c55e', fontWeight: 800, fontSize: '1.1rem' }}>
                    +₹{order.profit.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    Net Profit
                  </div>
                </div>
              </div>
            ))
          )}
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
