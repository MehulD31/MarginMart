import React from 'react';
import { ArrowLeft, Share2, FileText, Zap, Loader2, History } from 'lucide-react';
import type { Shopkeeper, Order } from '../../types/database';
import type { InvoiceRecord } from '../../utils/invoiceGenerator';
import { Mail, CheckCircle2, MessageSquare } from 'lucide-react';

interface BillingDetailProps {
  partner: Shopkeeper;
  orders: Order[];
  isMobile: boolean;
  onBack: () => void;
  onShare: (id: string) => void;
  onCopy: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onEmail: (id: string) => void;
  onGenerateInvoice: (partner: Shopkeeper, orders: Order[], operatorName: string, isPreview: boolean) => Promise<void>;
  invoiceLoading: boolean;
  operatorName: string;
  invoiceHistory: InvoiceRecord[];
}

export const BillingDetail: React.FC<BillingDetailProps> = ({
  partner,
  orders,
  isMobile,
  onBack,
  onShare,
  onCopy,
  onMarkPaid,
  onEmail,
  onGenerateInvoice,
  invoiceLoading,
  operatorName,
  invoiceHistory
}) => {
  const unpaidOrders = orders.filter(o => o.shopkeeper_id === partner.id && o.status !== 'paid');
  const totalAmount = unpaidOrders.reduce((sum, o) => sum + o.selling_price, 0);
  const totalSavings = unpaidOrders.reduce((sum, o) => {
    const qty = o.quantity || 1;
    return sum + (o.mrp ? (o.mrp * qty) - o.selling_price : 0);
  }, 0);

  return (
    <div className={isMobile ? "billing-mobile-container" : "billing-desktop-container"}>
      {isMobile && (
        <div className="mobile-back-bar">
          <button onClick={onBack} className="btn-pro-ghost" style={{ padding: 0 }}>
            <ArrowLeft size={18} /> Back to Partners
          </button>
        </div>
      )}

      <div className="billing-detail-header" style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row', 
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'flex-start', 
        marginBottom: '2rem', 
        gap: '1.5rem' 
      }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800 }}>{partner.name}</h2>
          <p style={{ color: 'var(--text-muted)' }}>Statement for current period</p>
        </div>
        <div className={isMobile ? "billing-action-grid" : "billing-action-row"} style={!isMobile ? { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' } : {}}>
          <button className="btn-pro-primary" disabled={invoiceLoading} onClick={() => onGenerateInvoice(partner, unpaidOrders, operatorName, false)}>
            {invoiceLoading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
            {invoiceLoading ? 'Generating...' : 'Issue Final Invoice'}
          </button>
          <button className="btn-pro-secondary" onClick={() => onEmail(partner.id)}>
            <Mail size={16} /> Email
          </button>
          <button className="btn-pro-secondary" onClick={() => onGenerateInvoice(partner, unpaidOrders, operatorName, true)}>
            <FileText size={16} /> {isMobile ? 'Preview' : 'Preview PDF'}
          </button>
          <button className="btn-pro-ghost" onClick={() => isMobile ? onShare(partner.id) : onCopy(partner.id)}>
            {isMobile ? <><Share2 size={16} /> Share</> : 'Copy Text'}
          </button>
          {isMobile && (
            <button className="btn-pro-secondary" style={{ color: '#25d366', borderColor: '#25d366' }} onClick={() => {
              const cleanPhone = partner.phone.replace(/\D/g, '');
              const message = `Hello ${partner.name}, here is your latest statement from MarginMart.`;
              window.open(`https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
            }}>
              <MessageSquare size={16} /> WhatsApp
            </button>
          )}
          <button className="btn-pro-secondary" onClick={() => onMarkPaid(partner.id)}>
            <CheckCircle2 size={16} /> Mark Paid
          </button>
        </div>
      </div>

      {unpaidOrders.length > 0 ? (
        <>
          {isMobile ? (
            <div className="mobile-statement-list">
              {unpaidOrders.map(order => {
                const qty = order.quantity || 1;
                const rate = order.selling_price / qty;
                const savings = order.mrp ? (order.mrp - rate) * qty : 0;
                return (
                  <div key={order.id} className="mobile-statement-item">
                    <div className="item-header">
                      <div className="item-title">{order.product_name}</div>
                      <div className="item-price">₹{order.selling_price.toLocaleString()}</div>
                    </div>
                    <div className="item-meta">
                      <span>Qty: {qty}</span>
                      <span>Rate: ₹{rate.toLocaleString()}</span>
                      <span style={{ color: '#16a34a' }}>Saved: ₹{savings.toLocaleString()}</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
              <div className="mobile-billing-summary-sticky">
                <div className="mobile-summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Total Savings</span>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>₹{totalSavings.toLocaleString()}</span>
                </div>
                <div className="mobile-summary-row total" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#1e293b', fontWeight: 600 }}>Total Due</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>₹{totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="billing-table">
              <div className="sk-row header" style={{ '--grid-cols': '1fr 100px 120px 120px' } as any}>
                <div>Product</div>
                <div>Qty</div>
                <div>Rate</div>
                <div style={{ textAlign: 'right' }}>Total</div>
              </div>
              <div className="table-body">
                {unpaidOrders.map(order => (
                  <div key={order.id} className="sk-row" style={{ '--grid-cols': '1fr 100px 120px 120px' } as any}>
                    <div style={{ fontWeight: 500 }}>{order.product_name}</div>
                    <div>{order.quantity || 1}</div>
                    <div>₹{(order.selling_price / (order.quantity || 1)).toLocaleString()}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>₹{order.selling_price.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="billing-summary" style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px dashed var(--admin-border)', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Outstanding</p>
                  <h2 style={{ fontSize: '2rem', fontWeight: 900 }}>₹{totalAmount.toLocaleString()}</h2>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state-container" style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <p>No pending fulfillments for this period.</p>
        </div>
      )}

      {/* Invoice History Section */}
      <div style={{ marginTop: '3rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <History size={20} /> Invoice History
        </h3>
        {invoiceHistory.length > 0 ? (
          isMobile ? (
            <div className="mobile-statement-list">
              {invoiceHistory.map(inv => (
                <div key={inv.id} className="mobile-statement-item" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="item-header">
                    <div style={{ fontWeight: 700 }}>{inv.invoice_no}</div>
                    <div style={{ fontWeight: 800 }}>₹{inv.total_amount.toLocaleString()}</div>
                  </div>
                  <div className="item-meta">
                    <span>{new Date(inv.generated_at).toLocaleDateString()}</span>
                    <span style={{ color: '#16a34a' }}>Saved: ₹{inv.total_savings.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="data-table-container" style={{ boxShadow: 'none', border: '1px solid var(--admin-border)', overflowX: 'auto', borderRadius: '12px' }}>
              <div className="sk-row header" style={{ '--grid-cols': '1.5fr 2fr 1fr 1fr' } as any}>
                <div>Invoice No.</div><div>Date</div><div style={{ textAlign: 'right' }}>Amount</div><div style={{ textAlign: 'right' }}>Savings</div>
              </div>
              <div className="table-body">
                {invoiceHistory.map(inv => (
                  <div key={inv.id} className="sk-row" style={{ '--grid-cols': '1.5fr 2fr 1fr 1fr' } as any}>
                    <div style={{ fontWeight: 600 }}>{inv.invoice_no}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{new Date(inv.generated_at).toLocaleString()}</div>
                    <div style={{ textAlign: 'right', fontWeight: 600 }}>₹{inv.total_amount.toLocaleString()}</div>
                    <div style={{ textAlign: 'right', color: '#16a34a' }}>₹{inv.total_savings.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="empty-state-container" style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
            <p>No past invoices found.</p>
          </div>
        )}
      </div>
    </div>
  );
};
