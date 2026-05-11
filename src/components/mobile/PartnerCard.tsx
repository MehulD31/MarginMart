import React from 'react';
import { motion } from 'framer-motion';
import { Phone, MapPin, PlusCircle, MessageSquare } from 'lucide-react';
import type { Shopkeeper } from '../../types/database';

interface PartnerCardProps {
  partner: Shopkeeper;
  onEdit: (partner: Shopkeeper) => void;
  onLogOrder: (partner: Shopkeeper) => void;
}

const PartnerCard: React.FC<PartnerCardProps> = ({ partner, onEdit, onLogOrder }) => {
  const openWhatsApp = () => {
    const cleanPhone = partner.phone.replace(/\D/g, '');
    const message = `Hello ${partner.name}, this is MarginMart Admin.`;
    window.open(
      `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(message)}`,
      '_blank'
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mobile-partner-card"
    >
      <div className="card-header-main" onClick={() => onEdit(partner)}>
        <div className="partner-avatar">
          {partner.name.charAt(0).toUpperCase()}
        </div>
        <div className="partner-info-core">
          <h3>{partner.name}</h3>
          <div className="partner-meta-row">
            <span className="meta-item"><Phone size={12} /> {partner.phone}</span>
          </div>
        </div>
      </div>
      
      <div className="card-body-details">
        <div className="address-snippet">
          <MapPin size={14} />
          <p>{partner.address}</p>
        </div>
      </div>

      {/* §4.4 WhatsApp prominent button */}
      <button 
        className="whatsapp-btn-card"
        onClick={openWhatsApp}
        aria-label={`WhatsApp ${partner.name}`}
      >
        <MessageSquare size={16} />
        <span>WhatsApp</span>
      </button>

      <div className="card-actions-grid">
        <button className="action-btn secondary" onClick={() => onEdit(partner)}>
          Manage →
        </button>
        <button className="action-btn primary" onClick={() => onLogOrder(partner)}>
          <PlusCircle size={16} /> Log Order
        </button>
      </div>
    </motion.div>
  );
};

export default React.memo(PartnerCard);
