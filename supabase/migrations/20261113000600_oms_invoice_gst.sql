-- Pepsi invoice lines: amount with GST. The portal's invoice report gives the value before GST; the portal price list gives base price and
-- price including GST per case, so with-GST = value x (price / base). Checked 13 Nov: the two 4 Nov invoices add to Rs 6,91,394 against the
-- Rs 6,91,395 purchase booked, and the 13 Nov invoice to Rs 2,55,109 against the portal's own order total of Rs 2,55,111.
alter table public.oms_invoice_line add column if not exists incl_gst_paise bigint;
