import { api } from './client'

// Morning review — tag the prior day's finished tasks small/big.
// getReviewPending returns null when there's nothing unreviewed.
export const getReviewPending = () => api.get('/review/pending')
export const commitReview     = (data) => api.post('/review/commit', data)
