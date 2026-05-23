// Tag colours per task type — Solarized-Light flat fills. The previous
// version was saturated gradients that read as candy on cream paper; flat
// muted fills with thin ink borders + soft shadow read like printed labels
// on a notebook page. Shared by the Focus teabag and the TeaBox bags so
// each bag reads the same colour in both surfaces.
export const TAG_COLORS = {
  task:        { bg: '#CB4B16', border: '#8C3010', shadow: 'rgba(60,40,20,0.18)' },  // orange — generic action
  appointment: { bg: '#268BD2', border: '#1A5F90', shadow: 'rgba(60,40,20,0.18)' },  // blue — scheduled
  routine:     { bg: '#2AA198', border: '#1C6E68', shadow: 'rgba(60,40,20,0.18)' },  // cyan/teal — repeating
  note:        { bg: '#6C71C4', border: '#494E8E', shadow: 'rgba(60,40,20,0.18)' },  // violet — reference
  project:     { bg: '#B58900', border: '#7A5C00', shadow: 'rgba(60,40,20,0.18)' },  // amber — project umbrella
}
