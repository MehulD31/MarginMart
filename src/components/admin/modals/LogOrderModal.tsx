import React from 'react';
import { motion } from 'framer-motion';
import { X, IndianRupee, Search } from 'lucide-react';

interface LogOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  partner: any;
  orderForm: {
    product_name: string;
    mrp: string;
    quantity: string;
    unit_rate: string;
    platform_fee: string;
    deal_price: string;
    selling_price: string;
  };
  setOrderForm: (form: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  isMobile: boolean;
  partners?: any[];
  onPartnerSelect?: (p: any) => void;
  isEdit?: boolean;
}

export const LogOrderModal: React.FC<LogOrderModalProps> = ({
  isOpen,
  onClose,
  partner,
  orderForm,
  setOrderForm,
  onSubmit,
  saving,
  isMobile,
  partners,
  onPartnerSelect,
  isEdit
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showDropdown, setShowDropdown] = React.useState(false);

  if (!isOpen) return null;

  const filteredPartners = partners?.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];

  return (
    <div className="modal-overlay">
      <motion.div 
        initial={isMobile ? { y: '100%' } : { scale: 0.9, opacity: 0 }} 
        animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }} 
        exit={isMobile ? { y: '100%' } : { scale: 0.9, opacity: 0 }}
        className={`modal ${isMobile ? 'is-bottom-sheet' : ''}`}
      >
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Order' : (partner ? `Log Order — ${partner.name}` : 'Log New Order')}</h2>
          <button type="button" onClick={onClose}><X size={24} /></button>
        </div>
        <form onSubmit={onSubmit}>
          {!partner && partners && (
            <div className="form-group">
              <label>Select Partner</label>
              <div style={{ position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, zIndex: 1 }} />
                <input 
                  placeholder="Type to search partner..."
                  className="form-input-premium search-pad"
                  autoComplete="off"
                  value={searchQuery}
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                />
                {showDropdown && filteredPartners.length > 0 && (
                  <ul className="premium-autocomplete-list custom-scrollbar">
                    {filteredPartners.map(p => (
                      <li 
                        key={p.id}
                        className="premium-autocomplete-item"
                        onClick={() => {
                          setSearchQuery(p.name);
                          setShowDropdown(false);
                          if (onPartnerSelect) onPartnerSelect(p);
                        }}
                      >
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <div className="form-group">
            <label>Product Name</label>
            <input 
              required 
              autoComplete="off"
              placeholder="e.g. Dove Soap 100g"
              className="form-input-premium" 
              value={orderForm.product_name} 
              onChange={(e) => setOrderForm({ ...orderForm, product_name: e.target.value })} 
            />
          </div>
          
          <div className="form-group">
            <label>MRP per Piece (₹)</label>
            <input 
              type="number" 
              inputMode="decimal"
              placeholder="0.00"
              required 
              className="form-input-premium" 
              value={orderForm.mrp} 
              onChange={(e) => setOrderForm({ ...orderForm, mrp: e.target.value })} 
            />
          </div>

          <div className="form-group">
            <label>Our Purchase Rate (₹)</label>
            <input 
              type="number" 
              inputMode="decimal"
              placeholder="0.00"
              required 
              className="form-input-premium" 
              value={orderForm.unit_rate} 
              onChange={(e) => {
                const rate = e.target.value;
                const qty = orderForm.quantity;
                const fee = orderForm.platform_fee;
                setOrderForm({ 
                  ...orderForm, 
                  unit_rate: rate, 
                  deal_price: ((parseFloat(rate || '0') * parseFloat(qty || '1')) + parseFloat(fee || '0')).toString() 
                });
              }} 
            />
          </div>

          <div className="form-group order-price-grid">
            <div>
              <label>Quantity</label>
              <input 
                type="number" 
                inputMode="numeric"
                placeholder="1"
                required 
                className="form-input-premium" 
                value={orderForm.quantity} 
                onChange={(e) => {
                  const qty = e.target.value;
                  const rate = orderForm.unit_rate;
                  const fee = orderForm.platform_fee;
                  setOrderForm({ 
                    ...orderForm, 
                    quantity: qty, 
                    deal_price: ((parseFloat(rate || '0') * parseFloat(qty || '1')) + parseFloat(fee || '0')).toString() 
                  });
                }} 
              />
            </div>
            <div>
              <label>Platform Fee (₹)</label>
              <input 
                type="number" 
                inputMode="decimal"
                placeholder="0"
                className="form-input-premium" 
                value={orderForm.platform_fee} 
                onChange={(e) => {
                  const fee = e.target.value;
                  const rate = orderForm.unit_rate;
                  const qty = orderForm.quantity;
                  setOrderForm({ 
                    ...orderForm, 
                    platform_fee: fee, 
                    deal_price: ((parseFloat(rate || '0') * parseFloat(qty || '1')) + parseFloat(fee || '0')).toString() 
                  });
                }} 
              />
            </div>
          </div>

          <div className="form-group order-price-grid">
            <div className="calc-display-box">
              <span className="label">Total Deal Price</span>
              <span className="value">₹{parseFloat(orderForm.deal_price || '0').toLocaleString()}</span>
            </div>
            <div>
              <label>Total Selling Price (₹)</label>
              <input 
                type="number" 
                inputMode="decimal"
                placeholder="0.00"
                required 
                className="form-input-premium" 
                value={orderForm.selling_price} 
                onChange={(e) => setOrderForm({ ...orderForm, selling_price: e.target.value })} 
              />
            </div>
          </div>

          <div className="form-group">
            {(() => {
              const profit = parseFloat(orderForm.selling_price || '0') - parseFloat(orderForm.deal_price || '0');
              const isNegative = profit < 0;
              const color = isNegative ? '#ef4444' : '#22c55e';
              const bgColor = isNegative ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)';
              const borderColor = isNegative ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)';
              
              return (
                <div className="calc-display-box highlight" style={{ background: bgColor, borderColor: borderColor }}>
                  <span className="label" style={{ color: color }}>Est. Net Profit</span>
                  <span className="value" style={{ color: color, fontSize: '1.5rem' }}>₹{profit.toFixed(0)}</span>
                </div>
              );
            })()}
          </div>
          
          <div className={isMobile ? "sticky-action-bar" : ""}>
            <button type="submit" disabled={saving} className="btn-pro-primary" style={{ width: '100%', height: '54px', fontSize: '1.1rem' }}>
              <IndianRupee size={20} /> {saving ? (isEdit ? 'Updating...' : 'Logging...') : (isEdit ? 'Update Order' : 'Confirm & Log Order')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
