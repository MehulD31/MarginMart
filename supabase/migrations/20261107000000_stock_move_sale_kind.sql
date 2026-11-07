-- Counter (cash/UPI) sales entered from Telegram move stock with their own kind.
alter type public.stock_move_kind add value if not exists 'sale';
