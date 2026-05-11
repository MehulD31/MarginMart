import React from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import type { Order } from '../../types/database';

interface OrderCardProps {
  order: Order;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onUpdateStatus: (orderId: string, status: 'ordered' | 'delivered' | 'paid') => void | Promise<void>;
  onDelete?: (orderId: string) => void;
}

const OrderCard: React.FC<OrderCardProps> = ({ 
  order, 
  isSelected, 
  onSelect, 
  onUpdateStatus, 
  onDelete 
}) => {
  const getStatusClass = (status: string) => {
    switch(status?.toLowerCase()) {
      case 'delivered': return 'delivered';
      case 'paid': return 'paid';
      case 'ordered': return 'ordered';
      default: return 'ordered';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mobile-order-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect?.(order.id)}
    >
      <div className="card-top">
        <div className="card-info" style={{ marginLeft: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{order.product_name}</h4>
          </div>
          <div className="card-meta" style={{ gap: '0.25rem', marginTop: '4px' }}>
            {formatDate(order.created_at)}
          </div>
        </div>
        <div className={`status-badge ${getStatusClass(order.status)}`}>
          {order.status}
        </div>
      </div>

      <div className="card-details">
        <div className="detail-item">
          <span className="label">Partner</span>
          <span className="value">{order.shopkeeper?.name || 'Unknown'}</span>
        </div>
        {order.operator_name && (
          <div className="detail-item">
            <span className="label">Ordered By</span>
            <span className="value">{order.operator_name}</span>
          </div>
        )}
        <div className="detail-item">
          <span className="label">Quantity</span>
          <span className="value">{order.quantity} pcs</span>
        </div>
        <div className="detail-item">
          <span className="label">Total Amount</span>
          <span className="value" style={{ color: 'var(--primary-main)', fontWeight: 800 }}>
            ₹{order.selling_price.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      <div className="card-actions">
        <button 
          className="btn-pro-ghost" 
          style={{ 
            flex: 1,
            background: order.status === 'delivered' ? '#dcfce7' : 'transparent',
            color: order.status === 'delivered' ? '#15803d' : '#64748b',
            border: `1px solid ${order.status === 'delivered' ? '#15803d' : '#e2e8f0'}`,
            fontSize: '0.8rem'
          }}
          onClick={(e) => {
            e.stopPropagation();
            onUpdateStatus(order.id, order.status === 'delivered' ? 'ordered' : 'delivered');
          }}
        >
          {order.status === 'delivered' ? 'Delivered' : 'Delivered'}
        </button>
        <button 
          className="btn-pro-ghost" 
          style={{ 
            flex: 1,
            background: order.status === 'paid' ? '#dcfce7' : 'transparent',
            color: order.status === 'paid' ? '#15803d' : '#64748b',
            border: `1px solid ${order.status === 'paid' ? '#15803d' : '#e2e8f0'}`,
            fontSize: '0.8rem'
          }}
          onClick={(e) => {
            e.stopPropagation();
            onUpdateStatus(order.id, order.status === 'paid' ? 'delivered' : 'paid');
          }}
        >
          {order.status === 'paid' ? 'Paid' : 'Mark Paid'}
        </button>
        {onDelete && (
          <button 
            className="btn-pro-ghost" 
            style={{ color: '#ef4444', borderColor: '#fee2e2', width: '44px', flex: 'none', justifyContent: 'center' }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(order.id);
            }}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default React.memo(OrderCard);
