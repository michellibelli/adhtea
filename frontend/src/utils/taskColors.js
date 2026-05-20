// Tag colours per task type — gradient fill + border + drop-shadow. Shared by
// the Focus teabag and the TeaBox bags so a bag reads the same colour in both.
export const TAG_COLORS = {
  task:        { bg: 'linear-gradient(135deg, #C97068, #E8968C)', border: '#9B4E4E', shadow: '#7A3030' },
  appointment: { bg: 'linear-gradient(135deg, #5B8FD4, #7FB3F0)', border: '#3D6FA8', shadow: '#2A5080' },
  routine:     { bg: 'linear-gradient(135deg, #5BA876, #7FC898)', border: '#3D7A56', shadow: '#2A5A3C' },
  note:        { bg: 'linear-gradient(135deg, #9068C9, #B48CE8)', border: '#6A4A9B', shadow: '#4A3070' },
  project:     { bg: 'linear-gradient(135deg, #C98A40, #E8B268)', border: '#9B6A2E', shadow: '#7A4A18' },
}
