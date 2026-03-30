import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://issiqvhdydwmpcffwdvb.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlzc2lxdmhkeWR3bXBjZmZ3ZHZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNDg0NTgsImV4cCI6MjA4OTgyNDQ1OH0.3moRHY4r-SX2Z429kvXDLy1OPIJNjVRdzdNxcVEvTmU'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabase(): any {
  if (!_client) {
    _client = createClient(SB_URL, SB_KEY)
  }
  return _client
}
