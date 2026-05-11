import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
  isMobile: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  message,
  isMobile
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
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
        className={`modal ${isMobile ? 'confirm-modal-mobile' : ''}`}
        style={!isMobile ? { maxWidth: '400px' } : {}}
      >
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ color: '#ef4444', marginBottom: '1rem' }}>
            <AlertCircle size={48} style={{ margin: '0 auto' }} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1e293b' }}>Confirm Action</h3>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>{message}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <button className="btn-pro-ghost" onClick={onClose}>Cancel</button>
            <button 
              className="btn-pro-primary" 
              style={{ background: '#ef4444', borderColor: '#ef4444' }} 
              onClick={() => { onConfirm(); onClose(); }}
            >
              Confirm
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
