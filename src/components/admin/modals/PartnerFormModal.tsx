import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface PartnerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  formState: {
    id?: string;
    name: string;
    phone: string;
    address: string;
  };
  setFormState: (state: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  isMobile: boolean;
  mode: 'add' | 'edit';
}

export const PartnerFormModal: React.FC<PartnerFormModalProps> = ({
  isOpen,
  onClose,
  formState,
  setFormState,
  onSubmit,
  saving,
  isMobile,
  mode
}) => {
  if (!isOpen) return null;

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
      >
        <div className="modal-header">
          <h2>{mode === 'add' ? 'Add New Partner' : 'Edit Partner Profile'}</h2>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <form onSubmit={onSubmit}>
          {/* §6: Use descriptive placeholders on mobile, hide label to save vertical space */}
          <div className="form-group">
            {!isMobile && <label>Business Name</label>}
            <input 
              required 
              className="form-input-premium" 
              placeholder={isMobile ? "Business Name (e.g. Laxmi Store)" : "e.g. Laxmi General Store"}
              value={formState.name} 
              onChange={(e) => setFormState({ ...formState, name: e.target.value })} 
            />
          </div>
          <div className="form-group">
            {!isMobile && <label>WhatsApp Number</label>}
            <input 
              required 
              className="form-input-premium" 
              placeholder={isMobile ? "WhatsApp Number (10-digit)" : "10 digit number"}
              inputMode="numeric"
              pattern="[0-9]*"
              value={formState.phone} 
              onChange={(e) => setFormState({ ...formState, phone: e.target.value })} 
            />
          </div>
          <div className="form-group">
            {!isMobile && <label>Store Address</label>}
            {/* §6: rows={2} on mobile to save space */}
            <textarea 
              required 
              className="form-input-premium" 
              rows={isMobile ? 2 : 3} 
              placeholder={isMobile ? "Shop Address" : "Full store address..."}
              value={formState.address} 
              onChange={(e) => setFormState({ ...formState, address: e.target.value })} 
            />
          </div>
          
          <div className={isMobile ? "sticky-action-bar" : ""}>
            <button type="submit" disabled={saving} className="btn-pro-primary" style={{ width: '100%' }}>
              {saving ? 'Saving...' : mode === 'add' ? 'Create Partner' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
