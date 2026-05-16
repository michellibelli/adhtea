// AES-GCM 256-bit encrypted localStorage store for medication data.
// Key is stored as raw base64 in localStorage, namespaced per userId.
// Nothing is sent to the server.

const KEY_PREFIX  = 'med_key_v1_'
const DATA_PREFIX = 'med_data_v1_'

function keyStorageKey(userId)  { return `${KEY_PREFIX}${userId}` }
function dataStorageKey(userId) { return `${DATA_PREFIX}${userId}` }

async function getOrCreateKey(userId) {
  const stored = localStorage.getItem(keyStorageKey(userId))
  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem(keyStorageKey(userId), btoa(String.fromCharCode(...new Uint8Array(raw))))
  return key
}

async function encrypt(key, data) {
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)))
  const ivB64   = btoa(String.fromCharCode(...iv))
  const dataB64 = btoa(String.fromCharCode(...new Uint8Array(enc)))
  return `${ivB64}:${dataB64}`
}

async function decrypt(key, blob) {
  const [ivB64, dataB64] = blob.split(':')
  const iv   = Uint8Array.from(atob(ivB64),   c => c.charCodeAt(0))
  const data = Uint8Array.from(atob(dataB64),  c => c.charCodeAt(0))
  const dec  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return JSON.parse(new TextDecoder().decode(dec))
}

async function load(userId) {
  const key  = await getOrCreateKey(userId)
  const blob = localStorage.getItem(dataStorageKey(userId))
  if (!blob) return { medications: [], logs: [] }
  try {
    return await decrypt(key, blob)
  } catch {
    return { medications: [], logs: [] }
  }
}

async function save(userId, store) {
  const key = await getOrCreateKey(userId)
  localStorage.setItem(dataStorageKey(userId), await encrypt(key, store))
}

// Public API

export async function getMedications(userId) {
  const store = await load(userId)
  return store.medications.filter(m => m.active !== false)
}

export async function addMedication(userId, { name, reminder_times }) {
  const store = await load(userId)
  const med = {
    id: crypto.randomUUID(),
    name,
    reminder_times: reminder_times || null,
    active: true,
    created_at: new Date().toISOString(),
  }
  store.medications.push(med)
  await save(userId, store)
  return med
}

export async function deleteMedication(userId, id) {
  const store = await load(userId)
  const med = store.medications.find(m => m.id === id)
  if (med) med.active = false
  await save(userId, store)
}

export async function logTaken(userId, medId) {
  const store = await load(userId)
  const today = new Date().toISOString().slice(0, 10)
  const already = store.logs.find(l => l.med_id === medId && l.date === today)
  if (!already) {
    store.logs.push({ med_id: medId, date: today, taken_at: new Date().toISOString() })
    await save(userId, store)
  }
}

export async function getTodayLogs(userId) {
  const store = await load(userId)
  const today = new Date().toISOString().slice(0, 10)
  const result = {}
  for (const l of store.logs) {
    if (l.date === today) result[l.med_id] = true
  }
  return result
}
