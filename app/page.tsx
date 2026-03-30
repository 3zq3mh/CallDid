'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

interface Note { avail: 'yes' | 'no' | null; text: string; price: string; qty: string }
interface Business {
  name: string; category: string; phone: string; email: string
  address: string; rating: string; hours: string; price: string
  sponsored?: boolean; place_id?: string; called?: boolean
  calledAt?: string; addedAt?: string
}
interface UserData { name: string; email: string; location: string; plan: string; joined: string }

const WORKER = 'https://calldid-places.zeesdev.workers.dev'
const EMOJIS: Record<string, string> = {
  'car wash': '🚗', 'restaurant': '🍽️', 'pizza': '🍕', 'coffee': '☕',
  'gym': '💪', 'hotel': '🏨', 'pharmacy': '💊', 'gas station': '⛽',
  'grocery': '🛒', 'dentist': '🦷', 'doctor': '🏥', 'lawyer': '⚖️',
  'plumber': '🔧', 'electrician': '⚡', 'mechanic': '🔩', 'barber': '✂️',
  'salon': '💅', 'default': '🏢'
}
function getEmoji(q: string) { const lq = (q || '').toLowerCase(); for (const k in EMOJIS) if (lq.includes(k)) return EMOJIS[k]; return EMOJIS.default }
function esc(s: string | null | undefined) { return String(s || '') }

export default function HomePage() {
  const router = useRouter()
  const sb = getSupabase()

  const [user, setUser] = useState<UserData | null>(null)
  const [results, setResults] = useState<Business[]>([])
  const [called, setCalled] = useState<Record<number, boolean>>({})
  const [notes, setNotes] = useState<Record<number, Note>>({})
  const [notesByName, setNotesByName] = useState<Record<string, Note>>({})
  const [inLists, setInLists] = useState<Record<number, boolean>>({})
  const [lists, setLists] = useState<Record<string, Business[]>>({ 'My Searches': [], 'Favorites': [] })
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [collapsedLists, setCollapsedLists] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'search' | 'lists' | 'profile'>('search')
  const [location, setLocation] = useState('Kansas City, MO')
  const [radius, setRadius] = useState(10)

  // UI state
  const [loading, setLoading] = useState(false)
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [listModalOpen, setListModalOpen] = useState(false)
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  // Modal state
  const [currentBizIndex, setCurrentBizIndex] = useState<number | null>(null)
  const [currentListTarget, setCurrentListTarget] = useState<number | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteAvail, setNoteAvail] = useState<'yes' | 'no' | null>(null)
  const [noteText, setNoteText] = useState('')
  const [notePrice, setNotePrice] = useState('')
  const [noteQty, setNoteQty] = useState('')
  const [listChecked, setListChecked] = useState<Record<string, boolean>>({})
  const [locationInput, setLocationInput] = useState('')
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const deferredPromptRef = useRef<any>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Refs for mutable state needed in callbacks
  const listsRef = useRef(lists)
  const userRef = useRef(user)
  const notesByNameRef = useRef(notesByName)
  const calledRef = useRef(called)
  const inListsRef = useRef(inLists)
  const searchHistoryRef = useRef(searchHistory)
  useEffect(() => { listsRef.current = lists }, [lists])
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { notesByNameRef.current = notesByName }, [notesByName])
  useEffect(() => { calledRef.current = called }, [called])
  useEffect(() => { inListsRef.current = inLists }, [inLists])
  useEffect(() => { searchHistoryRef.current = searchHistory }, [searchHistory])

  // ── Init ──────────────────────────────────────────────────────────
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    window.addEventListener('online', () => setIsOnline(true))
    window.addEventListener('offline', () => setIsOnline(false))
    setIsOnline(navigator.onLine)
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault(); deferredPromptRef.current = e; setShowInstallBanner(true)
    })
    window.addEventListener('appinstalled', () => { setShowInstallBanner(false); deferredPromptRef.current = null })

    ;(async () => {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) { router.replace('/auth'); return }
      let u: UserData | null = null
      try {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single()
        if (profile) {
          u = { name: profile.name || 'User', email: session.user.email || '', location: profile.location || 'Kansas City, MO', plan: profile.plan || 'basic', joined: new Date(session.user.created_at).toLocaleDateString() }
          localStorage.setItem('calldid_user', JSON.stringify(u))
        }
      } catch (e) {
        const raw = localStorage.getItem('calldid_user')
        if (raw) u = JSON.parse(raw)
      }
      if (!u?.email) { router.replace('/auth'); return }
      setUser(u)
      setLocation(u.location)
      await loadState(session.user.id, u)
    })()
  }, [])

  // ── State persistence ─────────────────────────────────────────────
  function saveLocal(overrides?: Partial<{ called: any; notes: any; notesByName: any; lists: any; inLists: any; searchHistory: any }>) {
    try {
      localStorage.setItem('calldid_state', JSON.stringify({
        called: overrides?.called ?? calledRef.current,
        notes: overrides?.notes ?? {},
        notesByName: overrides?.notesByName ?? notesByNameRef.current,
        lists: overrides?.lists ?? listsRef.current,
        inLists: overrides?.inLists ?? inListsRef.current,
        searchHistory: overrides?.searchHistory ?? searchHistoryRef.current,
      }))
    } catch (e) {}
  }

  async function saveState(overrides?: { called?: any; notes?: any; notesByName?: any; lists?: any; inLists?: any }) {
    const curCalled = overrides?.called ?? calledRef.current
    const curNotesByName = overrides?.notesByName ?? notesByNameRef.current
    const curLists = overrides?.lists ?? listsRef.current
    const curInLists = overrides?.inLists ?? inListsRef.current
    saveLocal({ called: curCalled, notesByName: curNotesByName, lists: curLists, inLists: curInLists })
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return
    const uid = session.user.id
    for (const [listName, businesses] of Object.entries(curLists)) {
      const { data: listData } = await sb.from('lists').upsert({ user_id: uid, name: listName }, { onConflict: 'user_id,name' }).select().single()
      if (!listData) continue
      for (const biz of businesses as Business[]) {
        if (!biz.name?.trim()) continue
        const note = curNotesByName[biz.name] || {}
        await sb.from('businesses').upsert({
          user_id: uid, list_id: listData.id, name: biz.name, category: biz.category,
          phone: biz.phone, email: biz.email, address: biz.address, rating: String(biz.rating || ''),
          hours: biz.hours, price: biz.price, called: !!biz.called,
          note: (note as Note).text || null, availability: (note as Note).avail || null, note_price: (note as Note).price || null
        }, { onConflict: 'user_id,name,list_id' })
      }
    }
  }

  async function loadState(uid: string, u: UserData) {
    try { const s = localStorage.getItem('calldid_state'); if (s) { const p = JSON.parse(s); setCalled(p.called || {}); setNotesByName(p.notesByName || {}); setLists(p.lists || { 'My Searches': [], 'Favorites': [] }); setInLists(p.inLists || {}); setSearchHistory(p.searchHistory || []) } } catch (e) {}
    try {
      const { data: histData } = await sb.from('app_settings').select('value').eq('key', `search_history_${uid}`).single()
      if (histData?.value) setSearchHistory(JSON.parse(histData.value))
    } catch (e) {}
    const { data: dbLists } = await sb.from('lists').select('*, businesses(*)').eq('user_id', uid)
    if (dbLists?.length) {
      const newLists: Record<string, Business[]> = {}
      const newNotesByName: Record<string, Note> = {}
      dbLists.forEach((list: any) => {
        const validBiz = (list.businesses || []).filter((b: any) => b.name?.trim())
        newLists[list.name] = validBiz.map((b: any) => ({ name: b.name, category: b.category, phone: b.phone, email: b.email, address: b.address, rating: b.rating, hours: b.hours, price: b.price, called: b.called }))
        validBiz.forEach((b: any) => { if (b.note || b.availability || b.note_price) newNotesByName[b.name] = { text: b.note || '', avail: b.availability || null, price: b.note_price || '', qty: '' } })
      })
      setLists(newLists)
      setNotesByName(newNotesByName)
      listsRef.current = newLists
      notesByNameRef.current = newNotesByName
    }
  }

  async function saveSearchHistoryToDb(history: string[]) {
    saveLocal({ searchHistory: history })
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return
    try { await sb.from('app_settings').upsert({ key: `search_history_${session.user.id}`, value: JSON.stringify(history), updated_at: new Date().toISOString() }, { onConflict: 'key' }) } catch (e) {}
  }

  // ── Search ─────────────────────────────────────────────────────────
  async function doSearch() {
    const q = searchInputRef.current?.value.trim() || searchQuery
    if (!q) return
    if (!navigator.onLine) { setResults([]); return }
    setActiveTab('search')
    setSearchQuery(q)
    if (!searchHistoryRef.current.includes(q)) {
      const newHistory = [q, ...searchHistoryRef.current].slice(0, 20)
      setSearchHistory(newHistory)
      searchHistoryRef.current = newHistory
      saveSearchHistoryToDb(newHistory)
    }
    setLoading(true)
    try {
      const searchText = encodeURIComponent(`${q} near ${location}`)
      const radiusMeters = Math.round(radius * 1609.34)
      const res = await fetch(`${WORKER}?query=${searchText}&type=search&radius=${radiusMeters}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      if (data.status === 'REQUEST_DENIED') throw new Error('Google key error: ' + (data.error_message || 'Check Admin'))
      if (data.status === 'OVER_QUERY_LIMIT') throw new Error('Google API quota exceeded')
      if (data.status === 'ZERO_RESULTS' || !data.results?.length) { setResults([]); setLoading(false); return }
      const priceMap: Record<number, string> = { 0: 'Free', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' }
      const newResults: Business[] = data.results.slice(0, 5).map((p: any, i: number) => ({
        name: p.name, category: p.types?.[0]?.replace(/_/g, ' ') || 'Business',
        address: p.formatted_address || location, phone: '', email: '',
        rating: p.rating ? p.rating.toFixed(1) : 'N/A',
        hours: p.opening_hours?.open_now !== undefined ? (p.opening_hours.open_now ? '🟢 Open now' : '🔴 Closed') : 'Hours vary',
        price: priceMap[p.price_level] || '', sponsored: i === 0, place_id: p.place_id
      }))
      // Re-link notes by name
      const curNotesByName = notesByNameRef.current
      const newNotes: Record<number, Note> = {}
      newResults.forEach((biz, i) => { if (curNotesByName[biz.name]) newNotes[i] = curNotesByName[biz.name] })
      setNotes(newNotes)
      setResults(newResults)
      setLoading(false)
      // Fetch details in background
      newResults.forEach((biz, i) => { if (biz.place_id) fetchPlaceDetails(biz.place_id, i, newResults) })
    } catch (e: any) {
      setLoading(false)
    }
  }

  async function fetchPlaceDetails(placeId: string, index: number, currentResults: Business[]) {
    try {
      const res = await fetch(`${WORKER}?place_id=${placeId}&type=details`)
      const data = await res.json()
      if (data.result) {
        setResults(prev => {
          const next = [...prev]
          if (next[index]) {
            next[index] = { ...next[index], phone: data.result.formatted_phone_number || next[index].phone, email: data.result.website || next[index].email, hours: data.result.opening_hours?.weekday_text?.[0] || next[index].hours }
          }
          return next
        })
      }
    } catch (e) {}
  }

  // ── Business actions ───────────────────────────────────────────────
  function callBusiness(i: number) {
    const biz = results[i]
    const newCalled = { ...calledRef.current, [i]: true }
    setCalled(newCalled)
    calledRef.current = newCalled
    const q = searchQuery
    let newLists = { ...listsRef.current }
    if (!newLists[q] && Object.keys(newLists).length < 2) newLists[q] = []
    if (newLists[q] && !newLists[q].find((b: Business) => b.name === biz.name)) {
      newLists[q] = [...newLists[q], { ...biz, calledAt: new Date().toLocaleTimeString() }]
      const newInLists = { ...inListsRef.current, [i]: true }
      setInLists(newInLists)
      inListsRef.current = newInLists
    }
    setLists(newLists)
    listsRef.current = newLists
    saveState({ called: newCalled, lists: newLists })
    if (biz.phone) setTimeout(() => { window.location.href = `tel:${biz.phone.replace(/\D/g, '')}` }, 300)
    setTimeout(() => openNoteModal(i), 600)
  }

  function handleEmail(i: number) {
    if (results[i]?.email) window.location.href = `mailto:${results[i].email}`
  }

  // ── Note modal ─────────────────────────────────────────────────────
  function openNoteModal(i: number) {
    const biz = results[i]
    const existingNote = notes[i] || notesByNameRef.current[biz?.name] || { avail: null, text: '', price: '', qty: '' }
    setCurrentBizIndex(i)
    setNoteTitle(biz?.name || 'Business')
    setNoteAvail(existingNote.avail)
    setNoteText(existingNote.text)
    setNotePrice(existingNote.price)
    setNoteQty(existingNote.qty || '')
    setNoteModalOpen(true)
  }

  function saveNote() {
    if (currentBizIndex === null) return
    const biz = results[currentBizIndex]
    const noteData: Note = { avail: noteAvail, text: noteText, price: notePrice, qty: noteQty }
    const newNotes = { ...notes, [currentBizIndex]: noteData }
    const newNotesByName = biz ? { ...notesByNameRef.current, [biz.name]: noteData } : notesByNameRef.current
    setNotes(newNotes)
    setNotesByName(newNotesByName)
    notesByNameRef.current = newNotesByName
    setNoteModalOpen(false)
    saveState({ notesByName: newNotesByName })
    if (biz) saveNoteToDb(biz.name, noteData)
  }

  async function saveNoteToDb(bizName: string, noteData: Note) {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return
    try { await sb.from('businesses').update({ note: noteData.text || null, availability: noteData.avail || null, note_price: noteData.price || null }).eq('user_id', session.user.id).eq('name', bizName) } catch (e) {}
  }

  // ── List modal ─────────────────────────────────────────────────────
  function openListModal(i: number) {
    setCurrentListTarget(i)
    const biz = results[i]
    const checked: Record<string, boolean> = {}
    Object.entries(listsRef.current).forEach(([name, items]) => {
      checked[name] = !!(items as Business[]).find(b => b.name === biz?.name)
    })
    setListChecked(checked)
    setListModalOpen(true)
  }

  function toggleListOption(name: string) {
    setListChecked(prev => ({ ...prev, [name]: !prev[name] }))
  }

  function confirmAddToList() {
    if (currentListTarget === null) return
    const biz = results[currentListTarget]
    const newLists = { ...listsRef.current }
    Object.entries(listChecked).forEach(([name, checked]) => {
      if (!newLists[name]) return
      const idx = (newLists[name] as Business[]).findIndex(b => b.name === biz?.name)
      if (checked && idx === -1) newLists[name] = [...newLists[name], { ...biz, addedAt: new Date().toLocaleTimeString() }]
      else if (!checked && idx > -1) newLists[name] = (newLists[name] as Business[]).filter((_, i) => i !== idx)
    })
    const isInAny = Object.values(listChecked).some(Boolean)
    const newInLists = { ...inListsRef.current, [currentListTarget]: isInAny }
    setLists(newLists)
    setInLists(newInLists)
    listsRef.current = newLists
    inListsRef.current = newInLists
    setListModalOpen(false)
    saveState({ lists: newLists, inLists: newInLists })
  }

  function createNewList() {
    const name = window.prompt('List name:')
    if (!name?.trim()) return
    if (Object.keys(listsRef.current).length >= 2 && userRef.current?.plan !== 'premium') {
      alert('Upgrade to Premium for unlimited lists!'); return
    }
    const newLists = { ...listsRef.current, [name.trim()]: [] }
    setLists(newLists)
    listsRef.current = newLists
    saveState({ lists: newLists })
    if (currentListTarget !== null) {
      const checked: Record<string, boolean> = {}
      Object.keys(newLists).forEach(n => { checked[n] = listChecked[n] || false })
      setListChecked(checked)
    }
  }

  function renameList(oldName: string) {
    const newName = window.prompt('New list name:', oldName)
    if (!newName?.trim() || newName.trim() === oldName) return
    const newLists = { ...listsRef.current }
    newLists[newName.trim()] = newLists[oldName]
    delete newLists[oldName]
    setLists(newLists)
    listsRef.current = newLists
    saveState({ lists: newLists })
  }

  function deleteList(name: string) {
    if (!confirm(`Delete list "${name}"? This cannot be undone.`)) return
    const newLists = { ...listsRef.current }
    delete newLists[name]
    setLists(newLists)
    listsRef.current = newLists
    saveState({ lists: newLists })
  }

  function toggleListCollapse(name: string) {
    setCollapsedLists(prev => ({ ...prev, [name]: !prev[name] }))
  }

  // ── Location ───────────────────────────────────────────────────────
  function openLocationModal() {
    setLocationInput(location)
    setLocationModalOpen(true)
    setTimeout(() => document.getElementById('locationInputField')?.focus(), 300)
  }

  function saveLocation() {
    if (!locationInput.trim()) return
    setLocation(locationInput.trim())
    if (user) {
      const newUser = { ...user, location: locationInput.trim() }
      setUser(newUser)
      localStorage.setItem('calldid_user', JSON.stringify(newUser))
    }
    setLocationModalOpen(false)
  }

  async function detectGPS() {
    if (!navigator.geolocation) return
    setLocationInput('Detecting...')
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
        const d = await res.json()
        const city = d.address.city || d.address.town || d.address.village || ''
        const state = d.address.state_code || ''
        setLocationInput(city ? `${city}, ${state}` : d.address.postcode || '')
      } catch (e) { setLocationInput('') }
    }, () => { setLocationInput(''); alert('Could not detect location. Enter manually.') })
  }

  // ── Profile ────────────────────────────────────────────────────────
  async function saveProfile() {
    if (!editName || !editEmail) return
    const newUser = { ...user!, name: editName, email: editEmail }
    setUser(newUser)
    localStorage.setItem('calldid_user', JSON.stringify(newUser))
    const { data: { session } } = await sb.auth.getSession()
    if (session) await sb.from('profiles').update({ name: editName }).eq('id', session.user.id)
    setEditProfileOpen(false)
  }

  async function upgradePremium() {
    const newUser = { ...user!, plan: 'premium' }
    setUser(newUser)
    localStorage.setItem('calldid_user', JSON.stringify(newUser))
    const { data: { session } } = await sb.auth.getSession()
    if (session) await sb.from('profiles').update({ plan: 'premium' }).eq('id', session.user.id)
    alert('🎉 Welcome to Premium! Unlimited lists unlocked.')
  }

  async function clearData() {
    if (!confirm('Clear all your calls, notes, and lists? This cannot be undone.')) return
    setCalled({}); setNotes({}); setNotesByName({}); setInLists({})
    const fresh = { 'My Searches': [], 'Favorites': [] }
    setLists(fresh); setSearchHistory([])
    listsRef.current = fresh; calledRef.current = {}; notesByNameRef.current = {}; inListsRef.current = {}
    localStorage.removeItem('calldid_state')
    const { data: { session } } = await sb.auth.getSession()
    if (session) {
      await sb.from('businesses').delete().eq('user_id', session.user.id)
      await sb.from('lists').delete().eq('user_id', session.user.id)
      await sb.from('app_settings').delete().eq('key', `search_history_${session.user.id}`)
    }
    alert('Data cleared.')
  }

  async function logout() {
    if (!confirm('Log out of Calldid?')) return
    await sb.auth.signOut()
    localStorage.removeItem('calldid_user')
    localStorage.removeItem('calldid_state')
    router.replace('/auth')
  }

  // ── Share / Export ─────────────────────────────────────────────────
  function shareList(name: string) {
    const items = (listsRef.current[name] || []).filter((b: Business) => b.name?.trim())
    const text = `My "${name}" list from Calldid:\n\n${items.map((b: Business, i: number) => `${i + 1}. ${b.name} — ${b.phone || 'N/A'}`).join('\n')}\n\nGet Calldid at calldid.app`
    if (navigator.share) navigator.share({ title: `Calldid: ${name}`, text })
    else navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'))
  }

  function exportList(name: string) {
    const items = (listsRef.current[name] || []).filter((b: Business) => b.name?.trim())
    let txt = `Calldid List: ${name}\nGenerated ${new Date().toLocaleDateString()}\nGet Calldid at calldid.app\n\n`
    items.forEach((b: Business, i: number) => { txt += `${i + 1}. ${b.name}\n   📞 ${b.phone || 'N/A'}\n   📧 ${b.email || 'N/A'}\n   📍 ${b.address || 'N/A'}\n\n` })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }))
    a.download = `calldid-${name.toLowerCase().replace(/\s+/g, '-')}.txt`
    a.click()
  }

  function installApp() {
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt()
      deferredPromptRef.current.userChoice.then(() => { deferredPromptRef.current = null; setShowInstallBanner(false) })
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────
  const emoji = getEmoji(searchQuery)

  const totalCalled = Object.keys(called).length
  const totalBiz = Object.values(lists).reduce((a, l) => a + (l as Business[]).length, 0)
  const totalLists = Object.values(lists).filter(l => (l as Business[]).length > 0).length
  const isPremium = user?.plan === 'premium'

  return (
    <div className="app-main-root">
      <div className="app-main">
        {/* Install Banner */}
        {showInstallBanner && (
          <div className="install-banner">
            <div style={{ fontSize: 22 }}>📞</div>
            <div className="install-text">Add Calldid to Home Screen<span>Works offline · No app store needed</span></div>
            <button className="install-btn" onClick={installApp}>Install</button>
            <button className="install-dismiss" onClick={() => setShowInstallBanner(false)}>✕</button>
          </div>
        )}

        {/* Status bar */}
        <div className="status-bar"><span>9:41</span><span>● ● ●</span></div>

        {/* Header */}
        <div className="header">
          <div className="logo">Call<span>did</span></div>
          {!isOnline && <div className="offline-badge visible">Offline</div>}
        </div>

        {/* Search */}
        <div className="search-wrap">
          <div className="search-bar">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input ref={searchInputRef} className="search-input" type="search" placeholder='Try "car wash near me"' autoComplete="off"
              onKeyDown={e => { if (e.key === 'Enter') { setSearchQuery(e.currentTarget.value); doSearch() } }}
              onChange={e => setSearchQuery(e.target.value)} value={searchQuery} />
            <button className="search-btn" disabled={loading} onClick={() => doSearch()}>{loading ? '...' : 'Search'}</button>
          </div>
        </div>

        {/* Location row */}
        <div className="location-row">
          <div className="location-badge" onClick={openLocationModal}>
            <div className="location-dot" />
            <span className="location-text">{location}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
          <select value={radius} onChange={e => setRadius(Number(e.target.value))} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '6px 10px', color: 'var(--muted)', fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: 'none', cursor: 'pointer', flexShrink: 0 }}>
            <option value={5}>5 mi</option>
            <option value={10}>10 mi</option>
            <option value={25}>25 mi</option>
            <option value={50}>50 mi</option>
            <option value={100}>100 mi</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="tabs-main">
          <button className={`tab-main${activeTab === 'search' ? ' active' : ''}`} onClick={() => setActiveTab('search')}>Search</button>
          <button className={`tab-main${activeTab === 'lists' ? ' active' : ''}`} onClick={() => setActiveTab('lists')}>My Lists</button>
        </div>

        {/* Search View */}
        <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'search' ? 'flex' : 'none', flexDirection: 'column' }}>
          <div className="results">
            {loading && <div className="loading-wrap"><div className="spinner" /><div className="loading-text">Finding businesses near {location}...</div></div>}
            {!loading && results.length === 0 && (
              <div className="empty"><div className="empty-icon">📞</div><div className="empty-title">Find. Call. Track.</div><div className="empty-sub">Search any business, call them,<br />and Calldid keeps track automatically.</div></div>
            )}
            {!loading && results.map((biz, i) => {
              const isCalled = called[i]
              const inList = inLists[i]
              const note = notes[i]
              return (
                <div key={i}>
                  {i === 0 && <div className="sponsored-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Sponsored</div>}
                  {i === 1 && <div className="section-label">Results near {location}</div>}
                  <div className={`card${biz.sponsored ? ' sponsored' : ''}${isCalled ? ' called' : ''}`}>
                    <div className="card-top">
                      <div className="biz-icon">{emoji}</div>
                      <div className="biz-info">
                        <div className="biz-name">{esc(biz.name)}{isCalled && <span className="called-badge">✓ Called</span>}</div>
                        <div className="biz-sub">{esc(biz.category)} · {esc(biz.address)}</div>
                        <div className="rating">★ {biz.rating} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {esc(biz.hours)}</span></div>
                      </div>
                    </div>
                    {biz.price && <span className="price-tag">💰 {esc(biz.price)}</span>}
                    {note?.avail === 'yes' && <span className="availability avail-yes">✓ Available{note.price ? ` · ${esc(note.price)}` : ''}</span>}
                    {note?.avail === 'no' && <span className="availability avail-no">✗ Not available</span>}
                    {note?.text && <div style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>📝 {esc(note.text)}</div>}
                    <div className="card-actions">
                      <button className={`action-btn btn-call${isCalled ? ' called-state' : ''}`} onClick={() => callBusiness(i)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                        {isCalled ? 'Called' : 'Call'}
                      </button>
                      <button className="action-btn btn-email" onClick={() => handleEmail(i)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>
                        Email
                      </button>
                      <button className="action-btn btn-note" onClick={() => openNoteModal(i)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        Note
                      </button>
                      <button className={`action-btn btn-add${inList ? ' in-list' : ''}`} onClick={() => openListModal(i)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        {inList ? 'Saved' : 'List'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Lists View */}
        <div style={{ display: activeTab === 'lists' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
          <div className="lists-view">
            <div className="lists-header">
              <div className="lists-title">My Lists</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="list-counter">{Object.keys(lists).length}/{isPremium ? '∞' : '2'} lists</div>
                <button onClick={createNewList} style={{ background: 'var(--green)', border: 'none', borderRadius: 100, padding: '5px 12px', color: '#000', fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New List</button>
              </div>
            </div>
            {!isPremium && (
              <div className="premium-banner"><div className="premium-icon">⭐</div><div className="premium-text"><div className="premium-title">Go Premium</div><div className="premium-sub">Unlimited lists, share &amp; export</div></div><button className="upgrade-btn" onClick={() => setActiveTab('profile')}>Upgrade</button></div>
            )}
            {Object.keys(lists).length === 0 ? (
              <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">No lists yet</div><div className="empty-sub">Search, hit Call, and businesses appear here automatically.</div></div>
            ) : Object.entries(lists).map(([name, items]) => {
              const validItems = (items as Business[]).filter(b => b.name?.trim())
              const collapsed = !!collapsedLists[name]
              return (
                <div key={name} className="list-card">
                  <div className="list-card-name" onClick={() => toggleListCollapse(name)} style={{ cursor: 'pointer' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 4, display: 'inline-block', transform: `rotate(${collapsed ? '-90deg' : '0deg'})`, transition: 'transform 0.2s' }}>▾</span>
                    📋 {esc(name)}
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{validItems.length} business{validItems.length !== 1 ? 'es' : ''}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => renameList(name)} style={{ background: 'var(--surface3)', border: 'none', borderRadius: 6, padding: '4px 8px', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>✏️ Rename</button>
                      <button onClick={() => deleteList(name)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 6, padding: '4px 8px', color: 'var(--red)', fontSize: 11, cursor: 'pointer' }}>🗑️</button>
                    </div>
                  </div>
                  {!collapsed && (
                    <>
                      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        <button className="share-btn" onClick={() => shareList(name)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share
                        </button>
                        <button className="export-btn" onClick={() => exportList(name)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export
                        </button>
                      </div>
                      {validItems.length > 0 && (
                        <div className="list-items">
                          {validItems.map((b, bi) => (
                            <div key={bi} className="list-item">
                              <div>
                                <div className="list-item-name">{esc(b.name)}</div>
                                <div className="list-item-meta">{esc(b.phone || '')}{b.phone && b.category ? ' · ' : ''}{esc(b.category || '')}</div>
                                {notesByName[b.name]?.text && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>📝 {esc(notesByName[b.name].text)}</div>}
                              </div>
                              {b.called && <span className="called-badge">✓ Called</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Profile View */}
        <div style={{ display: activeTab === 'profile' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
          {user && (
            <div className="profile-view">
              <div style={{ paddingTop: 8 }}>
                <div className="profile-header">
                  <div className="avatar">{(user.name || 'U').charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="profile-name">{esc(user.name)}</div>
                    <div className="profile-email">{esc(user.email)}</div>
                    <div className={`profile-plan ${isPremium ? 'plan-premium' : 'plan-free'}`}>{isPremium ? '⭐ Premium' : '✓ Basic Free'}</div>
                  </div>
                  <button onClick={() => { setEditName(user.name); setEditEmail(user.email); setEditProfileOpen(true) }} style={{ background: 'var(--surface3)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'var(--muted)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
                <div className="stats-row">
                  <div className="stat-card"><div className="stat-num">{totalCalled}</div><div className="stat-label">Called</div></div>
                  <div className="stat-card"><div className="stat-num">{totalBiz}</div><div className="stat-label">Saved</div></div>
                  <div className="stat-card"><div className="stat-num">{totalLists}</div><div className="stat-label">Lists</div></div>
                </div>
                {!isPremium && (
                  <div className="premium-banner" style={{ marginBottom: 20 }}><div className="premium-icon">⭐</div><div className="premium-text"><div className="premium-title">Upgrade to Premium</div><div className="premium-sub">Unlimited lists · Share · Export</div></div><button className="upgrade-btn" onClick={upgradePremium}>$4.99/mo</button></div>
                )}
                <div className="section-title">Account</div>
                <div className="setting-item" onClick={openLocationModal}>
                  <div className="setting-left"><div className="setting-icon">📍</div><div><div className="setting-label">Location</div><div className="setting-value">{esc(location)}</div></div></div>
                  <svg className="setting-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <div className="setting-item" onClick={() => { setEditName(user.name); setEditEmail(user.email); setEditProfileOpen(true) }}>
                  <div className="setting-left"><div className="setting-icon">👤</div><div><div className="setting-label">Edit Profile</div><div className="setting-value">Name &amp; email</div></div></div>
                  <svg className="setting-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <div className="setting-item" onClick={clearData}>
                  <div className="setting-left"><div className="setting-icon">🗑️</div><div><div className="setting-label">Clear All Data</div><div className="setting-value">Reset calls &amp; lists</div></div></div>
                  <svg className="setting-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <div className="section-title" style={{ marginTop: 16 }}>App</div>
                <div className="setting-item"><div className="setting-left"><div className="setting-icon">📱</div><div><div className="setting-label">Version</div><div className="setting-value">Calldid v2.0 Next.js</div></div></div></div>
                <div className="setting-item" onClick={() => setShowInstallBanner(true)}><div className="setting-left"><div className="setting-icon">⬇️</div><div><div className="setting-label">Install App</div><div className="setting-value">Add to home screen</div></div></div><svg className="setting-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg></div>
                <button className="logout-btn" onClick={logout}>Log Out</button>
                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>Member since {user.joined || 'today'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <nav className="bottom-nav">
          <button className={`nav-item${activeTab === 'search' ? ' active' : ''}`} onClick={() => setActiveTab('search')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Search
          </button>
          <button className={`nav-item${activeTab === 'lists' ? ' active' : ''}`} onClick={() => setActiveTab('lists')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>My Lists
          </button>
          <button className={`nav-item${activeTab === 'profile' ? ' active' : ''}`} onClick={() => setActiveTab('profile')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Profile
          </button>
        </nav>
      </div>

      {/* Note Modal */}
      {noteModalOpen && (
        <div className="modal-overlay" onClick={() => setNoteModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">{noteTitle}</div>
            <div className="modal-sub">Was the item available?</div>
            <div className="avail-btns">
              <button className={`avail-btn${noteAvail === 'yes' ? ' selected-yes' : ''}`} onClick={() => setNoteAvail(noteAvail === 'yes' ? null : 'yes')}>✓ Yes</button>
              <button className={`avail-btn${noteAvail === 'no' ? ' selected-no' : ''}`} onClick={() => setNoteAvail(noteAvail === 'no' ? null : 'no')}>✗ No</button>
            </div>
            <div className="modal-price-row">
              <input type="text" placeholder="Price (e.g. $12.99)" value={notePrice} onChange={e => setNotePrice(e.target.value)} />
              <input type="text" placeholder="Quantity" value={noteQty} onChange={e => setNoteQty(e.target.value)} />
            </div>
            <textarea placeholder="Add a note about this business..." value={noteText} onChange={e => setNoteText(e.target.value)} />
            <button className="save-btn" onClick={saveNote}>Save Note</button>
          </div>
        </div>
      )}

      {/* List Modal */}
      {listModalOpen && (
        <div className="modal-overlay" onClick={() => setListModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Add to List</div>
            <div className="modal-sub">Choose a list (2 free with basic plan)</div>
            {Object.entries(lists).map(([name, items]) => (
              <div key={name} className="list-option" onClick={() => toggleListOption(name)}>
                <div>
                  <div className="list-option-name">{esc(name)}</div>
                  <div className="list-option-count">{(items as Business[]).length} business{(items as Business[]).length !== 1 ? 'es' : ''}</div>
                </div>
                <div className={`check-circle${listChecked[name] ? ' checked' : ''}`}>
                  {listChecked[name] && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
              </div>
            ))}
            {Object.keys(lists).length < 2
              ? <div className="list-option" onClick={createNewList}><div><div className="list-option-name">+ Create new list</div><div className="list-option-count">{2 - Object.keys(lists).length} more free</div></div></div>
              : <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>⭐ Upgrade to Premium for unlimited lists</div>
            }
            <button className="save-btn" onClick={confirmAddToList}>Done</button>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {locationModalOpen && (
        <div className="modal-overlay" onClick={() => setLocationModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Change Location</div>
            <div className="modal-sub">Enter a city name or zip code</div>
            <input id="locationInputField" className="modal-input" type="text" placeholder="e.g. Chicago, IL or 90210" value={locationInput} onChange={e => setLocationInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveLocation() }} />
            <button className="secondary-btn" style={{ marginTop: 0 }} onClick={detectGPS}>📍 Detect My Location</button>
            <button className="save-btn" onClick={saveLocation}>Set Location</button>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editProfileOpen && (
        <div className="modal-overlay" onClick={() => setEditProfileOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Edit Profile</div>
            <div className="modal-sub">Update your account details</div>
            <input className="modal-input" type="text" placeholder="Full Name" value={editName} onChange={e => setEditName(e.target.value)} />
            <input className="modal-input" type="email" placeholder="Email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            <button className="save-btn" onClick={saveProfile}>Save Changes</button>
          </div>
        </div>
      )}
    </div>
  )
}
