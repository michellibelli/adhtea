// Medication name pseudonymization.
//
// The server stores placeholder names ("Medication 1", "Medication 2", …) so
// it never knows what medication a user actually takes. Only this device holds
// the mapping from placeholder → real name. If the user clears browser data or
// switches devices the placeholders still work — logs and reminders are safe —
// but the display names will fall back to "Medication 1", etc. until re-entered.

const nameKey = (userId, serverId) => `med_name_${userId}_${serverId}`

export function getMedName(userId, serverId, fallback) {
  return localStorage.getItem(nameKey(userId, serverId)) ?? fallback
}

export function setMedName(userId, serverId, name) {
  localStorage.setItem(nameKey(userId, serverId), name)
}
