import { api, queueReviewCommit } from './client'

// Morning review — tag the prior day's finished tasks small/big.
// getReviewPending returns null when there's nothing unreviewed.
export const getReviewPending = () => api.get('/review/pending')

// Durable commit. The Continue tap often hits a cold/slow Render backend; if the
// POST is lost, `reviewed_through` never advances and the same day resurfaces
// the next morning. So on a transient failure we persist the commit and let the
// background flush land it on wake (see client.js review queue). A permanent 4xx
// (nothing to retry into) is dropped so it can't jam the queue. Either way we
// resolve — the morning is never blocked on this.
export async function commitReview(data) {
  try {
    return await api.post('/review/commit', data)
  } catch (err) {
    const s = err?.status
    const permanent = typeof s === 'number' && s >= 400 && s < 500 && s !== 408 && s !== 429
    if (!permanent) queueReviewCommit(data)
    return null
  }
}
