export interface Shopkeeper {
  id: string;
  name: string;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
  operator_name?: string;
}

export interface WatchlistItem {
  id: string;
  shopkeeper_id: string;
  product_name: string;
  keywords: string[];
  operator_name?: string;
  supplier_rate?: number | null;
  product_size?: string | null;
  description?: string | null;
}

export interface Match {
  id: string;
  shopkeeper_id: string;
  product_name: string;
  matched_keyword: string;
  original_text: string;
  telegram_link?: string;
  created_at: string;
  operator_name?: string;
  shopkeeper?: { name: string };
}

export interface Order {
  id: string;
  shopkeeper_id: string;
  product_name: string;
  deal_price: number;
  selling_price: number;
  mrp?: number;
  status: 'ordered' | 'delivered' | 'paid';
  created_at: string;
  quantity?: number;
  unit_rate?: number;
  platform_fee?: number;
  operator_name?: string;
  shopkeeper?: { name: string };
}
