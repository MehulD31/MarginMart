import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { WatchlistItem } from '../../../types/database';

interface WatchlistItemEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: WatchlistItem | null;
  onSave: (updatedItem: WatchlistItem) => Promise<void>;
  saving: boolean;
  isMobile: boolean;
}

export const WatchlistItemEditModal: React.FC<WatchlistItemEditModalProps> = ({
  isOpen,
  onClose,
  item,
  onSave,
  saving,
  isMobile
}) => {
  const [productName, setProductName] = useState('');
  const [productSize, setProductSize] = useState('');
  const [supplierRate, setSupplierRate] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (item) {
      setProductName(item.product_name || '');
      setProductSize(item.product_size || '');
      setSupplierRate(item.supplier_rate ? item.supplier_rate.toString() : '');
      setDescription(item.description || '');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...item,
      product_name: productName.trim(),
      keywords: [productName.trim()],
      product_size: productSize.trim() || null,
      supplier_rate: supplierRate ? parseFloat(supplierRate) : null,
      description: description.trim() || null
    });
  };

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
          <h2>{item.is_exclude ? 'Edit Exclusion Keyword' : 'Edit Watchlist Item'}</h2>
          <button type="button" onClick={onClose}><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            {!isMobile && <label>{item.is_exclude ? 'Exclusion Keyword' : 'Product Keyword'}</label>}
            <input 
              required 
              className="form-input-premium" 
              placeholder="Keyword (e.g. Rice)"
              value={productName} 
              onChange={(e) => setProductName(e.target.value)} 
            />
          </div>
          
          {!item.is_exclude && (
            <>
              <div className="form-group">
                {!isMobile && <label>Product Size</label>}
                <input 
                  className="form-input-premium" 
                  placeholder="Size (e.g. 500g, 1L)"
                  value={productSize} 
                  onChange={(e) => setProductSize(e.target.value)} 
                />
              </div>
              <div className="form-group">
                {!isMobile && <label>Supplier Rate (₹)</label>}
                <input 
                  className="form-input-premium" 
                  type="number"
                  placeholder="Supplier Rate (₹)"
                  value={supplierRate} 
                  onChange={(e) => setSupplierRate(e.target.value)} 
                />
              </div>
              <div className="form-group">
                {!isMobile && <label>Description</label>}
                <input 
                  className="form-input-premium" 
                  placeholder="Description (e.g. pink powder, white cream)"
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                />
              </div>
            </>
          )}
          
          <div className={isMobile ? "sticky-action-bar" : ""}>
            <button type="submit" disabled={saving} className="btn-pro-primary" style={{ width: '100%' }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
