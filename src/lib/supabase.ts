import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oaqdmffxgqjnpfdqejtf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcWRtZmZ4Z3FqbnBmZHFlanRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMDQyMjYsImV4cCI6MjA5Mzg4MDIyNn0.i7xhdBHwimesMw4p-s0aluM3OkzWxtmtkNkhLEj7gIw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
