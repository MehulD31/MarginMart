import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (checked?: boolean) => void;
  message: string;
  isMobile: boolean;
  checkboxLabel?: string;
  variant?: 'danger' | 'success' | 'primary';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  message,
  isMobile,
  checkboxLabel,
  variant = 'danger'
}) => {
  const [isChecked, setIsChecked] = React.useState(true);
  
  const confirmColors = {
    danger: '#ef4444',
    success: '#22c55e',
    primary: '#3b82f6'
  };

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
          <div style={{ color: confirmColors[variant], marginBottom: '1rem' }}>
            <AlertCircle size={48} style={{ margin: '0 auto' }} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1e293b' }}>Confirm Action</h3>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>{message}</p>
          
          {checkboxLabel && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.75rem', 
              marginBottom: '1.5rem',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '12px',
              cursor: 'pointer'
            }} onClick={() => setIsChecked(!isChecked)}>
              <input 
                type="checkbox" 
                checked={isChecked} 
                onChange={() => {}} // Handled by div click
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#22c55e' }}
              />
              <span style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>{checkboxLabel}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <button className="btn-pro-ghost" onClick={onClose}>Cancel</button>
            <button 
              className="btn-pro-primary" 
              style={{ background: confirmColors[variant], borderColor: confirmColors[variant] }} 
              onClick={() => { onConfirm(isChecked); onClose(); }}
            >
              Confirm
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
