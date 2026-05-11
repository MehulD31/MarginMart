import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface MessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  isMobile: boolean;
}

export const MessageModal: React.FC<MessageModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  isMobile
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
          <h2>{title}</h2>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <div style={{ 
          padding: '1.25rem', 
          background: '#f8fafc', 
          borderRadius: '12px', 
          whiteSpace: 'pre-wrap', 
          fontSize: '0.95rem', 
          color: '#334155', 
          border: '1px solid #e2e8f0', 
          marginBottom: '1rem',
          lineHeight: 1.6,
          maxHeight: '60vh',
          overflowY: 'auto'
        }}>
          {message}
        </div>
        <div className={isMobile ? "sticky-action-bar" : ""}>
          <button onClick={onClose} className="btn-pro-primary" style={{ width: '100%' }}>
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
