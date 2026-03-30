'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function AdminPage() {
  const router = useRouter()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const sb = getSupabase()

    // ── Load CodeMirror CSS ─────────────────────────────────────────
    const addLink = (href: string) => {
      const l = document.createElement('link')
      l.rel = 'stylesheet'; l.href = href
      document.head.appendChild(l)
    }
    addLink('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css')
    addLink('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css')

    // ── Load scripts sequentially ───────────────────────────────────
    const CM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16'
    const scripts = [
      `${CM_BASE}/codemirror.min.js`,
      `${CM_BASE}/mode/htmlmixed/htmlmixed.min.js`,
      `${CM_BASE}/mode/javascript/javascript.min.js`,
      `${CM_BASE}/mode/css/css.min.js`,
      `${CM_BASE}/mode/xml/xml.min.js`,
      `${CM_BASE}/addon/search/searchcursor.min.js`,
      `${CM_BASE}/addon/edit/matchbrackets.min.js`,
      `${CM_BASE}/addon/edit/closebrackets.min.js`,
    ]

    const loadScript = (src: string) => new Promise<void>(resolve => {
      const s = document.createElement('script')
      s.src = src; s.onload = () => resolve(); document.head.appendChild(s)
    })

    async function loadAllScripts() {
      for (const src of scripts) await loadScript(src)
      initAll()
    }

    // ── ADMIN state ─────────────────────────────────────────────────
    const ADMIN: any = {
      keys: {}, features: {}, settings: {}, currentFile: null, isDirty: false,
      ghUser: '', ghRepo: '', ghToken: '', editor: null, fileSHAs: {}
    }

    // ── Auth ────────────────────────────────────────────────────────
    function adminLogin() {
      const email = (document.getElementById('li-email') as HTMLInputElement)?.value.trim()
      const pass = (document.getElementById('li-pass') as HTMLInputElement)?.value
      const raw = localStorage.getItem('calldid_user')
      if (!raw) { showLoginErr('No account found. Sign up in the app first.'); return }
      const u = JSON.parse(raw)
      if (u.email !== email) { showLoginErr('Email does not match your Calldid account.'); return }
      if (!pass || pass.length < 1) { showLoginErr('Please enter your password.'); return }
      sessionStorage.setItem('calldid_admin', '1')
      const ls = document.getElementById('loginScreen')
      const aa = document.getElementById('adminApp')
      if (ls) ls.style.display = 'none'
      if (aa) aa.style.display = 'flex'
      initAdmin(u)
    }
    function showLoginErr(msg: string) {
      const el = document.getElementById('loginErr')
      if (el) { el.textContent = msg; el.style.display = 'block' }
    }
    function adminLogout() {
      sessionStorage.removeItem('calldid_admin')
      const aa = document.getElementById('adminApp'); const ls = document.getElementById('loginScreen')
      if (aa) aa.style.display = 'none'; if (ls) ls.style.display = 'flex'
    }
    function initAdmin(u: any) {
      const av = document.getElementById('sidebarAvatar'); const nm = document.getElementById('sidebarName')
      if (av) av.textContent = (u.name || 'A').charAt(0).toUpperCase()
      if (nm) nm.textContent = u.name || 'Admin'
      loadSavedKeys(); loadFeatures(); loadSettings(); renderDashboard(); renderUsers(); initEditor()
    }

    // ── Navigation ──────────────────────────────────────────────────
    function showPage(id: string, btn?: Element | null) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
      document.querySelectorAll('.s-nav-item').forEach(n => n.classList.remove('active'))
      const pg = document.getElementById('page-' + id)
      if (pg) pg.classList.add('active')
      if (btn) btn.classList.add('active')
      const ca = document.getElementById('contentArea'); if (ca) ca.scrollTop = 0
    }

    // ── Dashboard ───────────────────────────────────────────────────
    function renderDashboard() {
      const state = JSON.parse(localStorage.getItem('calldid_state') || '{}')
      const u = JSON.parse(localStorage.getItem('calldid_user') || '{}')
      const called = Object.keys(state.called || {}).length
      const saved = Object.values(state.lists || {}).reduce((a: number, l: any) => a + l.length, 0)
      const lists = Object.keys(state.lists || {}).length
      const ds = document.getElementById('dashStats')
      if (ds) ds.innerHTML = `
        <div class="stat"><div class="stat-label">Total Calls Made</div><div class="stat-val g">${called}</div><div class="stat-note">All time</div></div>
        <div class="stat"><div class="stat-label">Businesses Saved</div><div class="stat-val b">${saved}</div><div class="stat-note">Across all lists</div></div>
        <div class="stat"><div class="stat-label">Lists Created</div><div class="stat-val go">${lists}</div><div class="stat-note">Free limit: 2</div></div>
        <div class="stat"><div class="stat-label">Plan</div><div class="stat-val p">${((u.plan || 'basic').charAt(0).toUpperCase() + (u.plan || 'basic').slice(1))}</div><div class="stat-note">Current plan</div></div>`
      const ghConn = !!(ADMIN.ghToken || localStorage.getItem('calldid_key_github-token'))
      const gConn = !!(localStorage.getItem('calldid_key_google'))
      const sr = document.getElementById('statusRows')
      if (sr) sr.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">GitHub Connection</span>
            <span class="badge ${ghConn ? 'badge-green' : 'badge-red'}"><span class="badge-dot"></span>${ghConn ? 'Connected' : 'Not connected'}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">Google Places API</span>
            <span class="badge ${gConn ? 'badge-green' : 'badge-red'}"><span class="badge-dot"></span>${gConn ? 'Key saved' : 'Not set'}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">
            <span style="font-size:13px;">App Status</span>
            <span class="badge badge-green"><span class="badge-dot"></span>Live on Vercel</span>
          </div>
        </div>`
    }

    // ── Supabase settings helpers ───────────────────────────────────
    async function saveSetting(key: string, value: string) {
      await sb.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() })
      localStorage.setItem('calldid_key_' + key, value)
    }
    async function loadSetting(key: string) {
      try {
        const { data } = await sb.from('app_settings').select('value').eq('key', key).single()
        if (data?.value) { localStorage.setItem('calldid_key_' + key, data.value); return data.value }
      } catch (e) {}
      return localStorage.getItem('calldid_key_' + key) || ''
    }
    async function loadSavedKeys() {
      const keys = ['google', 'google-domain', 'claude', 'stripe-pub', 'stripe-price', 'github-token', 'github-user', 'github-repo']
      for (const k of keys) {
        const val = await loadSetting(k)
        const el = document.getElementById('k-' + k) as HTMLInputElement
        if (el && val) el.value = val
      }
      ADMIN.ghToken = await loadSetting('github-token')
      ADMIN.ghUser = await loadSetting('github-user')
      ADMIN.ghRepo = await loadSetting('github-repo')
    }
    async function saveKeys(service: string) {
      if (service === 'google') {
        const val = (document.getElementById('k-google') as HTMLInputElement)?.value.trim()
        if (!val) { toast('Enter a Google API key first', 'err'); return }
        await saveSetting('google', val)
        await saveSetting('google-domain', (document.getElementById('k-google-domain') as HTMLInputElement)?.value.trim())
        toast('✅ Google Places key saved!', 'ok')
      } else if (service === 'claude') {
        const val = (document.getElementById('k-claude') as HTMLInputElement)?.value.trim()
        if (!val) { toast('Enter a Claude API key first', 'err'); return }
        await saveSetting('claude', val); toast('✅ Claude API key saved!', 'ok')
      } else if (service === 'stripe') {
        await saveSetting('stripe-pub', (document.getElementById('k-stripe-pub') as HTMLInputElement)?.value.trim())
        await saveSetting('stripe-price', (document.getElementById('k-stripe-price') as HTMLInputElement)?.value.trim())
        toast('✅ Stripe keys saved!', 'ok')
      }
      renderDashboard()
    }
    async function saveGitHub() {
      const token = (document.getElementById('k-github-token') as HTMLInputElement)?.value.trim()
      const user = (document.getElementById('k-github-user') as HTMLInputElement)?.value.trim()
      const repo = (document.getElementById('k-github-repo') as HTMLInputElement)?.value.trim()
      if (!token || !user || !repo) { toast('Fill in all 3 GitHub fields', 'err'); return }
      toast('Testing GitHub connection...', 'info')
      try {
        const res = await fetch(`https://api.github.com/repos/${user}/${repo}`, {
          headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
        })
        if (!res.ok) throw new Error('Repo not found or token invalid')
        const data = await res.json()
        await saveSetting('github-token', token); await saveSetting('github-user', user); await saveSetting('github-repo', repo)
        ADMIN.ghToken = token; ADMIN.ghUser = user; ADMIN.ghRepo = repo
        toast(`✅ Connected to ${data.full_name}!`, 'ok')
        addLog('success', `GitHub connected to ${data.full_name}`)
        loadFileTree(); renderDashboard()
      } catch (e: any) { toast('❌ Connection failed. Check token and repo name.', 'err') }
    }
    function toggleEye(id: string, btn: HTMLButtonElement) {
      const el = document.getElementById(id) as HTMLInputElement
      const isPass = el.type === 'password'
      el.type = isPass ? 'text' : 'password'
      btn.innerHTML = isPass
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
    }

    // ── Features ────────────────────────────────────────────────────
    async function loadFeatures() {
      let saved: any = {}
      try { const val = await loadSetting('features'); if (val) saved = JSON.parse(val) } catch (e) {}
      if (!Object.keys(saved).length) saved = JSON.parse(localStorage.getItem('calldid_features') || '{}')
      Object.entries(saved).forEach(([k, v]) => {
        const el = document.getElementById('f-' + k) as HTMLInputElement
        if (el) el.checked = v as boolean
      })
    }
    async function saveFeatures() {
      const ids = ['sponsored', 'google-search', 'ai-search', 'call-track', 'notes', 'email', 'lists', 'premium', 'stripe', 'export', 'share', 'require-login', 'install-banner', 'offline']
      const features: any = {}
      ids.forEach(id => { const el = document.getElementById('f-' + id) as HTMLInputElement; if (el) features[id] = el.checked })
      const json = JSON.stringify(features)
      localStorage.setItem('calldid_features', json)
      await saveSetting('features', json)
      toast('✅ Feature settings saved!', 'ok')
    }

    // ── App Settings ────────────────────────────────────────────────
    async function loadSettings() {
      let saved: any = {}
      try { const val = await loadSetting('app_settings'); if (val) saved = JSON.parse(val) } catch (e) {}
      if (!Object.keys(saved).length) saved = JSON.parse(localStorage.getItem('calldid_app_settings') || '{}')
      const fields = ['appname', 'tagline', 'desc', 'price', 'free-lists', 'premium-lists', 'default-location', 'support-email', 'website']
      fields.forEach(f => { const el = document.getElementById('s-' + f) as HTMLInputElement; if (el && saved[f]) el.value = saved[f] })
      if (saved['c-primary']) {
        (document.getElementById('c-primary') as HTMLInputElement).value = saved['c-primary'];
        (document.getElementById('c-primary-hex') as HTMLInputElement).value = saved['c-primary']
      }
      if (saved['c-bg']) {
        (document.getElementById('c-bg') as HTMLInputElement).value = saved['c-bg'];
        (document.getElementById('c-bg-hex') as HTMLInputElement).value = saved['c-bg']
      }
    }
    async function saveSettings() {
      const fields = ['appname', 'tagline', 'desc', 'price', 'free-lists', 'premium-lists', 'default-location', 'support-email', 'website']
      const settings: any = {}
      fields.forEach(f => { const el = document.getElementById('s-' + f) as HTMLInputElement; if (el) settings[f] = el.value })
      settings['c-primary'] = (document.getElementById('c-primary') as HTMLInputElement)?.value
      settings['c-bg'] = (document.getElementById('c-bg') as HTMLInputElement)?.value
      const json = JSON.stringify(settings)
      localStorage.setItem('calldid_app_settings', json)
      await saveSetting('app_settings', json)
      toast('✅ App settings saved!', 'ok')
    }
    function syncColor(type: string) {
      const hex = (document.getElementById('c-' + type + '-hex') as HTMLInputElement)?.value
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) (document.getElementById('c-' + type) as HTMLInputElement).value = hex
    }

    // ── Users ───────────────────────────────────────────────────────
    async function renderUsers() {
      const area = document.getElementById('usersTable')
      if (!area) return
      area.innerHTML = '<div style="padding:20px;font-size:13px;color:var(--muted);">Loading users...</div>'
      try {
        const { data: profiles, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false })
        if (error) throw error
        if (!profiles || !profiles.length) { area.innerHTML = '<div style="padding:20px;font-size:13px;color:var(--muted);">No users yet.</div>'; return }
        area.innerHTML = `<table><thead><tr><th>User</th><th>Plan</th><th>Location</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
          ${profiles.map((p: any) => `<tr>
            <td><div style="display:flex;align-items:center;gap:8px;"><div class="u-avatar">${escHtml((p.name || 'U').charAt(0).toUpperCase())}</div><span style="font-weight:500;">${escHtml(p.name || 'User')}</span></div></td>
            <td><span class="badge ${p.plan === 'premium' ? 'badge-gold' : 'badge-green'}">${p.plan === 'premium' ? '⭐ Premium' : 'Free'}</span></td>
            <td style="color:var(--muted);">${escHtml(p.location || '—')}</td>
            <td style="color:var(--muted);">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="window._toggleUserPlan('${p.id}','${p.plan || 'basic'}')">${p.plan === 'premium' ? '⬇️ Downgrade' : '⬆️ Upgrade'}</button></td>
          </tr>`).join('')}</tbody></table>`
      } catch (e: any) { area.innerHTML = `<div style="padding:20px;font-size:13px;color:var(--red);">Error: ${escHtml(e.message)}</div>` }
    }
    async function toggleUserPlan(userId: string, currentPlan: string) {
      const newPlan = currentPlan === 'premium' ? 'basic' : 'premium'
      const { error } = await sb.from('profiles').update({ plan: newPlan }).eq('id', userId)
      if (error) { toast('Failed: ' + error.message, 'err'); return }
      toast(`✅ Plan updated to ${newPlan}!`, 'ok')
      addLog('success', `User ${userId.slice(0, 8)} plan changed to ${newPlan}`)
      renderUsers()
    }

    // ── Logs ────────────────────────────────────────────────────────
    const LOGS: any[] = []
    function addLog(type: string, message: string) {
      const time = new Date().toLocaleTimeString()
      LOGS.unshift({ type, message, time })
      if (LOGS.length > 100) LOGS.pop()
      renderLogs()
    }
    function renderLogs() {
      const el = document.getElementById('logsList'); if (!el) return
      const colors: any = { error: 'var(--red)', success: 'var(--green)', info: 'var(--blue)', warn: 'var(--gold)', deploy: '#a78bfa' }
      el.innerHTML = LOGS.map(l => `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--border);"><span style="color:var(--muted);flex-shrink:0;">${l.time}</span><span style="color:${colors[l.type] || 'var(--muted)'};flex-shrink:0;">[${l.type.toUpperCase()}]</span><span style="color:var(--text);">${escHtml(l.message)}</span></div>`).join('')
    }
    function clearLogs() { LOGS.length = 0; renderLogs() }
    function toggleLogs() { const p = document.getElementById('logsPanel'); if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none' }

    // ── Code Editor ─────────────────────────────────────────────────
    function initEditor() {
      const wrap = document.getElementById('editorWrap')
      if (ADMIN.ghToken && wrap) { setupEditor(wrap); loadFileTree() }
    }
    function setupEditor(container: HTMLElement) {
      container.innerHTML = ''
      const textarea = document.createElement('textarea')
      container.appendChild(textarea)
      const CM = (window as any).CodeMirror
      if (!CM) return
      ADMIN.editor = CM.fromTextArea(textarea, {
        theme: 'dracula', lineNumbers: true, matchBrackets: true, autoCloseBrackets: true,
        lineWrapping: false, tabSize: 2, indentWithTabs: false, mode: 'htmlmixed',
        extraKeys: { 'Ctrl-S': deployFile, 'Cmd-S': deployFile }
      })
      ADMIN.editor.on('change', () => {
        if (ADMIN.currentFile) markDirty()
        const c = ADMIN.editor.getCursor()
        const cp = document.getElementById('cursorPos'); if (cp) cp.textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`
      })
      ADMIN.editor.on('cursorActivity', () => {
        const c = ADMIN.editor.getCursor()
        const cp = document.getElementById('cursorPos'); if (cp) cp.textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`
      })
    }
    async function loadFileTree() {
      if (!ADMIN.ghToken) return
      const gs = document.getElementById('ghStatus'); if (gs) { gs.innerHTML = '<span class="badge-dot"></span>Loading...'; gs.className = 'badge badge-gold' }
      try {
        const res = await ghFetch(`https://api.github.com/repos/${ADMIN.ghUser}/${ADMIN.ghRepo}/contents/`)
        const files = await res.json()
        const editableExts = ['.html', '.js', '.json', '.css', '.md', '.txt', '.svg']
        const filtered = files.filter((f: any) => f.type === 'file' && editableExts.some((ext: string) => f.name.endsWith(ext)))
        if (gs) { gs.innerHTML = '<span class="badge-dot"></span>Connected'; gs.className = 'badge badge-green' }
        const fl = document.getElementById('fileList')
        if (fl) fl.innerHTML = filtered.map((f: any) => `<div class="file-item" id="fi-${f.name}" onclick="window._openFile('${f.name}','${f.sha}','${f.download_url}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${f.name}</div>`).join('')
        const wrap = document.getElementById('editorWrap')
        if (!ADMIN.editor && wrap) setupEditor(wrap)
      } catch (e) {
        if (gs) { gs.innerHTML = '<span class="badge-dot"></span>Error'; gs.className = 'badge badge-red' }
        toast('Failed to load files from GitHub', 'err')
      }
    }
    async function openFile(name: string, sha: string, downloadUrl: string) {
      if (ADMIN.isDirty && !confirm('You have unsaved changes. Discard them?')) return
      document.querySelectorAll('.file-item').forEach(f => f.classList.remove('active'))
      const fi = document.getElementById('fi-' + name); if (fi) fi.classList.add('active')
      ADMIN.currentFile = name; ADMIN.fileSHAs[name] = sha; ADMIN.isDirty = false
      const db = document.getElementById('deployBtn'); if (db) (db as HTMLButtonElement).disabled = false
      toast(`Loading ${name}...`, 'info')
      try {
        const res = await fetch(downloadUrl + '?t=' + Date.now())
        const text = await res.text()
        const ef = document.getElementById('editorFilename'); if (ef) ef.textContent = name
        const fs = document.getElementById('fileSize'); if (fs) fs.textContent = (text.length / 1024).toFixed(1) + ' KB'
        const mode = name.endsWith('.js') ? 'javascript' : name.endsWith('.css') ? 'css' : name.endsWith('.json') ? 'application/json' : name.endsWith('.svg') ? 'xml' : 'htmlmixed'
        const el = document.getElementById('editorLang'); if (el) el.textContent = mode
        ADMIN.editor.setOption('mode', mode)
        ADMIN.editor.setValue(text); ADMIN.editor.clearHistory(); ADMIN.editor.focus()
        hideDirty(); toast(`Opened ${name}`, 'ok'); addLog('info', `Opened ${name} (${(text.length / 1024).toFixed(1)} KB)`)
      } catch (e) { toast('Failed to load file', 'err') }
    }
    async function deployFile() {
      if (!ADMIN.currentFile || !ADMIN.ghToken) return
      const content = ADMIN.editor.getValue()
      const encoded = btoa(unescape(encodeURIComponent(content)))
      const shaRes = await ghFetch(`https://api.github.com/repos/${ADMIN.ghUser}/${ADMIN.ghRepo}/contents/${ADMIN.currentFile}`)
      const shaData = await shaRes.json(); const sha = shaData.sha
      const db = document.getElementById('deployBtn') as HTMLButtonElement
      if (db) { db.textContent = '⏳ Deploying...'; db.disabled = true }
      try {
        const res = await ghFetch(`https://api.github.com/repos/${ADMIN.ghUser}/${ADMIN.ghRepo}/contents/${ADMIN.currentFile}`, {
          method: 'PUT',
          body: JSON.stringify({ message: `Update ${ADMIN.currentFile} via Calldid Admin`, content: encoded, sha })
        })
        if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Deploy failed') }
        const data = await res.json()
        ADMIN.fileSHAs[ADMIN.currentFile] = data.content.sha
        ADMIN.isDirty = false; hideDirty()
        toast(`✅ ${ADMIN.currentFile} saved!`, 'ok')
        addLog('deploy', `${ADMIN.currentFile} deployed to GitHub`)
      } catch (e: any) { toast(`❌ Deploy failed: ${e.message}`, 'err'); addLog('error', `Deploy failed: ${e.message}`) }
      if (db) { db.textContent = '⬆️ Save & Deploy'; db.disabled = false }
    }
    function discardChanges() {
      if (ADMIN.currentFile) openFile(ADMIN.currentFile, ADMIN.fileSHAs[ADMIN.currentFile], `https://raw.githubusercontent.com/${ADMIN.ghUser}/${ADMIN.ghRepo}/main/${ADMIN.currentFile}`)
      hideDirty()
    }
    function markDirty() {
      ADMIN.isDirty = true
      const db2 = document.getElementById('deployBar'); if (db2) db2.classList.add('show')
      const dbf = document.getElementById('deployBarFile'); if (dbf && ADMIN.currentFile) dbf.textContent = ADMIN.currentFile
      const es = document.getElementById('editorStatus'); if (es) { es.textContent = '● Unsaved'; es.style.color = 'var(--gold)' }
    }
    function hideDirty() {
      ADMIN.isDirty = false
      const db2 = document.getElementById('deployBar'); if (db2) db2.classList.remove('show')
      const es = document.getElementById('editorStatus'); if (es) { es.textContent = '✓ Saved'; es.style.color = 'var(--green)' }
    }
    function toggleSearch() {
      const bar = document.getElementById('searchBar'); if (!bar) return
      const vis = bar.style.display !== 'none'; bar.style.display = vis ? 'none' : 'flex'
      if (!vis) (document.getElementById('searchQuery') as HTMLInputElement)?.focus()
    }
    function searchCode() {
      if (!ADMIN.editor) return
      const q = (document.getElementById('searchQuery') as HTMLInputElement)?.value
      if (!q) { const sc = document.getElementById('searchCount'); if (sc) sc.textContent = ''; return }
      const count = (ADMIN.editor.getValue().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      const sc = document.getElementById('searchCount'); if (sc) sc.textContent = `${count} match${count !== 1 ? 'es' : ''}`
      const cursor = ADMIN.editor.getSearchCursor(q, ADMIN.editor.getCursor())
      if (cursor.findNext()) ADMIN.editor.setSelection(cursor.from(), cursor.to())
    }
    function replaceNext() {
      if (!ADMIN.editor) return
      const q = (document.getElementById('searchQuery') as HTMLInputElement)?.value
      const r = (document.getElementById('replaceQuery') as HTMLInputElement)?.value
      if (!q) return
      const cursor = ADMIN.editor.getSearchCursor(q, ADMIN.editor.getCursor())
      if (cursor.findNext()) { cursor.replace(r); markDirty() }
    }
    function replaceAll() {
      if (!ADMIN.editor) return
      const q = (document.getElementById('searchQuery') as HTMLInputElement)?.value
      const r = (document.getElementById('replaceQuery') as HTMLInputElement)?.value
      if (!q) return
      ADMIN.editor.setValue(ADMIN.editor.getValue().split(q).join(r)); markDirty()
      toast(`Replaced all instances of "${q}"`, 'ok')
    }
    function ghFetch(url: string, options: any = {}) {
      return fetch(url, { ...options, headers: { Authorization: `token ${ADMIN.ghToken}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json', ...(options.headers || {}) } })
    }

    // ── Toast ────────────────────────────────────────────────────────
    let _toastTimer: any
    function toast(msg: string, type = 'ok') {
      const el = document.getElementById('adminToast'); if (!el) return
      el.className = `a-toast ${type}`
      el.innerHTML = (type === 'ok' ? '✅' : type === 'err' ? '❌' : 'ℹ️') + ' ' + msg
      el.style.display = 'flex'; clearTimeout(_toastTimer)
      _toastTimer = setTimeout(() => { el.style.display = 'none' }, 3500)
    }
    function escHtml(s: string) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

    // ── Color picker sync ────────────────────────────────────────────
    const cpEl = document.getElementById('c-primary')
    const cbEl = document.getElementById('c-bg')
    if (cpEl) cpEl.addEventListener('input', (e: any) => { const h = document.getElementById('c-primary-hex') as HTMLInputElement; if (h) h.value = e.target.value })
    if (cbEl) cbEl.addEventListener('input', (e: any) => { const h = document.getElementById('c-bg-hex') as HTMLInputElement; if (h) h.value = e.target.value })

    // ── Enter key on login ───────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
      const ls = document.getElementById('loginScreen')
      if (e.key === 'Enter' && ls && ls.style.display !== 'none') adminLogin()
    })

    // ── Expose to window for inline onclick attrs ───────────────────
    const w = window as any
    w.adminLogin = adminLogin; w.adminLogout = adminLogout
    w.showPage = showPage; w.saveKeys = saveKeys; w.saveGitHub = saveGitHub
    w.toggleEye = toggleEye; w.saveFeatures = saveFeatures; w.saveSettings = saveSettings
    w.syncColor = syncColor; w._toggleUserPlan = toggleUserPlan
    w._openFile = openFile; w.deployFile = deployFile; w.discardChanges = discardChanges
    w.toggleSearch = toggleSearch; w.searchCode = searchCode
    w.replaceNext = replaceNext; w.replaceAll = replaceAll
    w.formatCode = () => toast('Auto-format coming soon!', 'info')
    w.clearLogs = clearLogs; w.toggleLogs = toggleLogs

    // ── Auto-login ───────────────────────────────────────────────────
    function initAll() {
      if (sessionStorage.getItem('calldid_admin')) {
        const u = JSON.parse(localStorage.getItem('calldid_user') || 'null')
        if (u) {
          const ls = document.getElementById('loginScreen'); const aa = document.getElementById('adminApp')
          if (ls) ls.style.display = 'none'; if (aa) aa.style.display = 'flex'
          initAdmin(u)
        }
      }
    }

    loadAllScripts()
  }, [])

  return (
    <div className="admin-theme">
      {/* Login Screen */}
      <div id="loginScreen" className="login-screen">
        <div className="login-card">
          <div className="login-logo">Call<span>did</span></div>
          <div className="login-sub">Admin Panel · Owner access only</div>
          <div className="field">
            <label className="f-label">Email</label>
            <input className="a-input" id="li-email" type="email" placeholder="your@email.com" />
          </div>
          <div className="field">
            <label className="f-label">Password</label>
            <input className="a-input" id="li-pass" type="password" placeholder="Your Calldid password" />
          </div>
          <button className="btn btn-primary btn-full" style={{ marginTop: 8 }} onClick={() => (window as any).adminLogin()}>Sign In</button>
          <div className="login-error" id="loginErr" style={{ display: 'none', fontSize: 12, color: 'var(--red)', marginTop: 8 }}>Wrong credentials or not an admin account.</div>
        </div>
      </div>

      {/* Admin App */}
      <div id="adminApp" className="app-layout" style={{ display: 'none' }}>
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="s-logo">Call<span>did</span></div>
            <div className="s-badge">Admin Panel</div>
          </div>
          <nav className="sidebar-nav">
            <div className="s-nav-section">Overview</div>
            <button className="s-nav-item active" data-page="dashboard" onClick={e => (window as any).showPage('dashboard', e.currentTarget)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>Dashboard
            </button>
            <div className="s-nav-section">Configure</div>
            <button className="s-nav-item" data-page="apikeys" onClick={e => (window as any).showPage('apikeys', e.currentTarget)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>API Keys
            </button>
            <button className="s-nav-item" data-page="features" onClick={e => (window as any).showPage('features', e.currentTarget)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Feature Toggles
            </button>
            <button className="s-nav-item" data-page="settings" onClick={e => (window as any).showPage('settings', e.currentTarget)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>App Settings
            </button>
            <div className="s-nav-section">Manage</div>
            <button className="s-nav-item" data-page="users" onClick={e => (window as any).showPage('users', e.currentTarget)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Users
            </button>
            <div className="s-nav-section">Developer</div>
            <button className="s-nav-item" data-page="editor" onClick={e => (window as any).showPage('editor', e.currentTarget)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Code Editor
            </button>
          </nav>
          <div className="sidebar-bottom">
            <div className="s-user">
              <div className="s-avatar" id="sidebarAvatar">A</div>
              <div><div className="s-name" id="sidebarName">Admin</div><div className="s-role">Owner</div></div>
            </div>
            <a href="/" className="s-nav-item" style={{ textDecoration: 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>Back to App
            </a>
            <button className="s-nav-item" onClick={() => (window as any).adminLogout()} style={{ color: 'var(--red)', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Log Out
            </button>
          </div>
        </aside>

        {/* Content */}
        <div className="content" id="contentArea">
          {/* Dashboard */}
          <div className="page active" id="page-dashboard">
            <div style={{ padding: 32 }}>
              <div className="page-title">Dashboard</div>
              <div className="page-sub">Welcome back. Here&apos;s your Calldid overview.</div>
              <div className="stats-grid" id="dashStats"></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="a-card">
                  <div className="card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>System Status</div>
                  <div id="statusRows"></div>
                </div>
                <div className="a-card">
                  <div className="card-title">⚡ Quick Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => (window as any).showPage('apikeys', document.querySelector('[data-page=apikeys]'))}>🔑 Manage API Keys</button>
                    <button className="btn btn-secondary" onClick={() => (window as any).showPage('features', document.querySelector('[data-page=features]'))}>🎛️ Toggle Features</button>
                    <button className="btn btn-secondary" onClick={() => (window as any).showPage('editor', document.querySelector('[data-page=editor]'))}>💻 Open Code Editor</button>
                    <button className="btn btn-secondary" onClick={() => (window as any).showPage('users', document.querySelector('[data-page=users]'))}>👥 View Users</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="page" id="page-apikeys">
            <div style={{ padding: 32 }}>
              <div className="page-title">API Keys</div>
              <div className="page-sub">Add your third-party service keys. All keys stored securely.</div>
              <div className="a-card">
                <div className="card-title">🔍 Google Places API</div>
                <div className="a-field">
                  <label className="f-label">API Key</label>
                  <div className="input-wrap">
                    <input className="a-input mono" id="k-google" type="password" placeholder="AIzaSy..." />
                    <button className="input-eye" onClick={e => (window as any).toggleEye('k-google', e.currentTarget)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                  </div>
                  <div className="f-hint">Powers real business search results. Get yours at console.cloud.google.com</div>
                </div>
                <div className="a-field">
                  <label className="f-label">Restrict to domain</label>
                  <input className="a-input" id="k-google-domain" placeholder="yourdomain.vercel.app" />
                </div>
                <button className="btn btn-primary" onClick={() => (window as any).saveKeys('google')}>Save Google Key</button>
              </div>
              <div className="a-card">
                <div className="card-title">🤖 Claude / Anthropic API</div>
                <div className="a-field">
                  <label className="f-label">API Key</label>
                  <div className="input-wrap">
                    <input className="a-input mono" id="k-claude" type="password" placeholder="sk-ant-..." />
                    <button className="input-eye" onClick={e => (window as any).toggleEye('k-claude', e.currentTarget)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => (window as any).saveKeys('claude')}>Save Claude Key</button>
              </div>
              <div className="a-card">
                <div className="card-title">💳 Stripe Payments</div>
                <div className="field-row">
                  <div className="a-field">
                    <label className="f-label">Publishable Key</label>
                    <div className="input-wrap">
                      <input className="a-input mono" id="k-stripe-pub" type="password" placeholder="pk_live_..." />
                      <button className="input-eye" onClick={e => (window as any).toggleEye('k-stripe-pub', e.currentTarget)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    </div>
                  </div>
                  <div className="a-field">
                    <label className="f-label">Price ID</label>
                    <input className="a-input mono" id="k-stripe-price" placeholder="price_..." />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => (window as any).saveKeys('stripe')}>Save Stripe Keys</button>
              </div>
              <div className="a-card">
                <div className="card-title">🐙 GitHub (Code Editor)</div>
                <div className="a-field">
                  <label className="f-label">Personal Access Token</label>
                  <div className="input-wrap">
                    <input className="a-input mono" id="k-github-token" type="password" placeholder="ghp_..." />
                    <button className="input-eye" onClick={e => (window as any).toggleEye('k-github-token', e.currentTarget)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                  </div>
                  <div className="f-hint">Go to GitHub → Settings → Developer Settings → Personal Access Tokens → check <strong>repo</strong> scope</div>
                </div>
                <div className="field-row">
                  <div className="a-field"><label className="f-label">GitHub Username</label><input className="a-input" id="k-github-user" placeholder="username" /></div>
                  <div className="a-field"><label className="f-label">Repository Name</label><input className="a-input" id="k-github-repo" placeholder="MyRepo" /></div>
                </div>
                <button className="btn btn-primary" onClick={() => (window as any).saveGitHub()}>Save &amp; Test GitHub Connection</button>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="page" id="page-features">
            <div style={{ padding: 32 }}>
              <div className="page-title">Feature Toggles</div>
              <div className="page-sub">Turn features on or off. Changes apply instantly.</div>
              <div className="a-card">
                <div className="card-title">🔍 Search &amp; Results</div>
                <div className="toggle-list">
                  {[['sponsored', 'Sponsored Results', 'Show sponsored listings at the top of search results', true],
                    ['google-search', 'Google Places Search', 'Use real Google Maps data (requires Google API key)', false],
                    ['ai-search', 'AI Search (Claude fallback)', 'Use Claude AI to generate results when Google is unavailable', true]].map(([id, label, desc, def]) => (
                    <div key={id as string} className="toggle-row">
                      <div className="toggle-info"><div className="t-label">{label as string}</div><div className="t-desc">{desc as string}</div></div>
                      <label className="switch"><input type="checkbox" id={`f-${id}`} defaultChecked={def as boolean} onChange={() => (window as any).markDirty?.()} /><span className="switch-slider"></span></label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="a-card">
                <div className="card-title">📞 Core Features</div>
                <div className="toggle-list">
                  {[['call-track', 'Call Tracking', 'Mark businesses as called and auto-save to list'],
                    ['notes', 'Notes & Availability', 'Allow users to add notes and mark item availability'],
                    ['email', 'Email Button', 'Show email button on business cards'],
                    ['lists', 'Lists', 'Allow users to create and manage business lists']].map(([id, label, desc]) => (
                    <div key={id} className="toggle-row">
                      <div className="toggle-info"><div className="t-label">{label}</div><div className="t-desc">{desc}</div></div>
                      <label className="switch"><input type="checkbox" id={`f-${id}`} defaultChecked onChange={() => (window as any).markDirty?.()} /><span className="switch-slider"></span></label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="a-card">
                <div className="card-title">💳 Monetization</div>
                <div className="toggle-list">
                  {[['premium', 'Premium Plan', 'Show upgrade prompts and premium features', true],
                    ['stripe', 'Stripe Payments', 'Enable real payment processing (requires Stripe key)', false],
                    ['export', 'Export Feature', 'Allow users to export lists as text files', true],
                    ['share', 'Share Lists', 'Allow users to share their lists', true]].map(([id, label, desc, def]) => (
                    <div key={id as string} className="toggle-row">
                      <div className="toggle-info"><div className="t-label">{label as string}</div><div className="t-desc">{desc as string}</div></div>
                      <label className="switch"><input type="checkbox" id={`f-${id}`} defaultChecked={def as boolean} onChange={() => (window as any).markDirty?.()} /><span className="switch-slider"></span></label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="a-card">
                <div className="card-title">⚙️ App Behavior</div>
                <div className="toggle-list">
                  {[['require-login', 'Require Login', 'Users must sign up to use the app'],
                    ['install-banner', 'PWA Install Banner', 'Show "Add to Home Screen" banner'],
                    ['offline', 'Offline Mode', 'Show offline badge and handle no-connection gracefully']].map(([id, label, desc]) => (
                    <div key={id} className="toggle-row">
                      <div className="toggle-info"><div className="t-label">{label}</div><div className="t-desc">{desc}</div></div>
                      <label className="switch"><input type="checkbox" id={`f-${id}`} defaultChecked onChange={() => (window as any).markDirty?.()} /><span className="switch-slider"></span></label>
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => (window as any).saveFeatures()}>💾 Save Feature Settings</button>
            </div>
          </div>

          {/* Settings */}
          <div className="page" id="page-settings">
            <div style={{ padding: 32 }}>
              <div className="page-title">App Settings</div>
              <div className="page-sub">Customize how Calldid looks and works.</div>
              <div className="a-card">
                <div className="card-title">🏷️ Branding</div>
                <div className="field-row">
                  <div className="a-field"><label className="f-label">App Name</label><input className="a-input" id="s-appname" defaultValue="Calldid" onChange={() => (window as any).markDirty?.()} /></div>
                  <div className="a-field"><label className="f-label">Tagline</label><input className="a-input" id="s-tagline" defaultValue="Find. Call. Track." onChange={() => (window as any).markDirty?.()} /></div>
                </div>
                <div className="a-field"><label className="f-label">App Description</label><input className="a-input" id="s-desc" defaultValue="Find local businesses, call them, and track what you learned." onChange={() => (window as any).markDirty?.()} /></div>
              </div>
              <div className="a-card">
                <div className="card-title">🎨 Colors</div>
                <div className="field-row">
                  <div className="a-field"><label className="f-label">Primary Color</label><div className="color-row"><input type="color" id="c-primary" defaultValue="#22c55e" onChange={() => (window as any).markDirty?.()} /><input className="a-input mono" id="c-primary-hex" defaultValue="#22c55e" onChange={() => (window as any).syncColor('primary')} /></div></div>
                  <div className="a-field"><label className="f-label">Background Color</label><div className="color-row"><input type="color" id="c-bg" defaultValue="#0f0f0f" onChange={() => (window as any).markDirty?.()} /><input className="a-input mono" id="c-bg-hex" defaultValue="#0f0f0f" onChange={() => (window as any).syncColor('bg')} /></div></div>
                </div>
              </div>
              <div className="a-card">
                <div className="card-title">💰 Pricing</div>
                <div className="field-row">
                  <div className="a-field"><label className="f-label">Premium Price (per month)</label><input className="a-input" id="s-price" defaultValue="$4.99" onChange={() => (window as any).markDirty?.()} /></div>
                  <div className="a-field"><label className="f-label">Free List Limit</label><input className="a-input" id="s-free-lists" type="number" defaultValue="2" min={1} max={10} onChange={() => (window as any).markDirty?.()} /></div>
                </div>
                <div className="field-row">
                  <div className="a-field"><label className="f-label">Premium List Limit</label><input className="a-input" id="s-premium-lists" placeholder="Unlimited" onChange={() => (window as any).markDirty?.()} /></div>
                  <div className="a-field"><label className="f-label">Default Location</label><input className="a-input" id="s-default-location" defaultValue="Kansas City, MO" onChange={() => (window as any).markDirty?.()} /></div>
                </div>
              </div>
              <div className="a-card">
                <div className="card-title">📧 Emails &amp; Support</div>
                <div className="field-row">
                  <div className="a-field"><label className="f-label">Support Email</label><input className="a-input" id="s-support-email" placeholder="support@calldid.app" onChange={() => (window as any).markDirty?.()} /></div>
                  <div className="a-field"><label className="f-label">App Website</label><input className="a-input" id="s-website" placeholder="calldid.app" onChange={() => (window as any).markDirty?.()} /></div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => (window as any).saveSettings()}>💾 Save Settings</button>
            </div>
          </div>

          {/* Users */}
          <div className="page" id="page-users">
            <div style={{ padding: 32 }}>
              <div className="page-title">Users</div>
              <div className="page-sub">All registered Calldid users from Supabase.</div>
              <div className="a-card">
                <div className="card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>User Accounts</div>
                <div className="table-wrap" id="usersTable"><div style={{ padding: 20, fontSize: 13, color: 'var(--muted)' }}>Loading users...</div></div>
              </div>
            </div>
          </div>

          {/* Code Editor */}
          <div className="page" id="page-editor" style={{ padding: 0 }}>
            <div className="editor-layout" style={{ height: '100vh' }}>
              <div className="file-tree">
                <div className="file-tree-header">Files<span id="ghStatus" className="badge badge-red"><span className="badge-dot"></span>Not connected</span></div>
                <div className="file-list" id="fileList"><div style={{ padding: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>Add your GitHub token in <strong style={{ color: 'var(--text)' }}>API Keys</strong> to load your files here.</div></div>
              </div>
              <div className="editor-main">
                <div className="editor-toolbar">
                  <div className="editor-filename" id="editorFilename">No file open</div>
                  <div className="editor-status" id="editorStatus"></div>
                  <button className="btn btn-secondary btn-sm" onClick={() => (window as any).toggleSearch()}>🔍 Find</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => (window as any).formatCode()}>✨ Format</button>
                  <button className="btn btn-primary btn-sm" id="deployBtn" onClick={() => (window as any).deployFile()} disabled>⬆️ Save &amp; Deploy</button>
                </div>
                <div className="editor-search-bar" id="searchBar" style={{ display: 'none' }}>
                  <input className="a-input" id="searchQuery" placeholder="Find..." onInput={() => (window as any).searchCode()} />
                  <input className="a-input" id="replaceQuery" placeholder="Replace with..." />
                  <button className="btn btn-secondary btn-sm" onClick={() => (window as any).replaceNext()}>Replace</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => (window as any).replaceAll()}>Replace All</button>
                  <span className="search-count" id="searchCount"></span>
                  <button className="btn btn-secondary btn-sm" onClick={() => (window as any).toggleSearch()}>✕</button>
                </div>
                <div className="editor-wrap" id="editorWrap">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: 'var(--muted)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                    <div style={{ fontSize: 14 }}>Connect GitHub to start editing</div>
                    <button className="btn btn-blue" onClick={() => (window as any).showPage('apikeys', document.querySelector('[data-page=apikeys]'))}>Add GitHub Token →</button>
                  </div>
                </div>
                <div className="editor-footer">
                  <span id="editorLang">—</span>
                  <span id="cursorPos">Ln 1, Col 1</span>
                  <span id="fileSize">—</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => (window as any).toggleLogs()} style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11 }}>📋 Logs</button>
                </div>
                <div id="logsPanel" style={{ display: 'none', height: 160, background: 'var(--bg)', borderTop: '1px solid var(--border)', overflowY: 'auto', padding: '8px 12px', fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Console Logs</span>
                    <button onClick={() => (window as any).clearLogs()} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>Clear</button>
                  </div>
                  <div id="logsList"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deploy bar */}
      <div className="deploy-bar" id="deployBar">
        <div className="deploy-msg"><strong id="deployBarFile">file</strong> has unsaved changes</div>
        <div className="btn-row">
          <button className="btn btn-secondary btn-sm" onClick={() => (window as any).discardChanges()}>Discard</button>
          <button className="btn btn-primary btn-sm" onClick={() => (window as any).deployFile()}>⬆️ Save &amp; Deploy to GitHub</button>
        </div>
      </div>

      {/* Toast */}
      <div className="a-toast" id="adminToast" style={{ display: 'none' }}></div>
    </div>
  )
}
