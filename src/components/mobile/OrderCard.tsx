import React from 'react';
import { motion } from 'framer-motion';
import { Package, Clock, IndianRupee, Trash2, Check } from 'lucide-react';
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
      case 'delivered': return 'status-delivered';
      case 'paid': return 'status-paid';
      case 'ordered': return 'status-pending';
      default: return 'status-pending';
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
      <div className="order-card-header">
        <div className="order-selection-area">
          <div className={`selection-circle ${isSelected ? 'active' : ''}`}>
            {isSelected && <Check size={12} />}
          </div>
          <div className="order-main-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package className="package-icon" size={18} />
              <h3>{order.product_name}</h3>
            </div>
            <span className="order-timestamp">
              <Clock size={12} /> {formatDate(order.created_at)}
            </span>
          </div>
        </div>
        <div className={`status-badge-compact ${getStatusClass(order.status)}`}>
          {order.status}
        </div>
      </div>

      <div className="order-card-metrics">
        <div className="metric-box">
          <label>Partner</label>
          <span>{order.shopkeeper?.name || 'Unknown'}</span>
        </div>
        <div className="metric-box">
          <label>Qty</label>
          <span>{order.quantity}</span>
        </div>
        <div className="metric-box">
          <label>Profit</label>
          <span className="profit-value">₹{(order.selling_price - order.deal_price).toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div className="order-card-footer" onClick={e => e.stopPropagation()}>
        <div className="price-total">
          <IndianRupee size={14} />
          <strong>{order.selling_price.toLocaleString('en-IN')}</strong>
        </div>
        <div className="order-actions-mini">
          <select 
            value={order.status} 
            onChange={(e) => onUpdateStatus(order.id, e.target.value as any)}
            className="status-select-minimal"
          >
            <option value="ordered">Ordered</option>
            <option value="delivered">Delivered</option>
            <option value="paid">Paid</option>
          </select>
          {onDelete && (
            <button 
              className="action-btn-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(order.id);
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(OrderCard);
