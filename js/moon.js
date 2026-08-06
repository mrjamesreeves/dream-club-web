// Tonight's moon, computed client-side — shared by every page.
// Fills #moon-img, #moon-name, #moon-meta when present. Same eight
// buckets as the app; images are the NASA set.
(function () {
  const SYNODIC = 29.53058867;
  const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // known new moon
  const PHASES = [
    [0.034, 'New Moon',        'new.webp'],
    [0.216, 'Waxing Crescent', 'waxing-crescent.jpg'],
    [0.284, 'First Quarter',   'first-quarter.jpg'],
    [0.466, 'Waxing Gibbous',  'waxing-gibbous.jpg'],
    [0.534, 'Full Moon',       'full.webp'],
    [0.716, 'Waning Gibbous',  'waning-gibbous.jpg.webp'],
    [0.784, 'Last Quarter',    'third-quarter.jpg.webp'],
    [0.966, 'Waning Crescent', 'waning-crescent.jpg.webp'],
    [1.001, 'New Moon',        'new.webp'],
  ];

  const now = new Date();
  const age = (((now - REF_NEW_MOON) / 86400000) % SYNODIC + SYNODIC) % SYNODIC;
  const normalized = age / SYNODIC;
  const [, name, file] = PHASES.find(([limit]) => normalized < limit);

  // Meteorological season, matching the Dream Index nav labels.
  function seasonLabel(d) {
    const m = d.getMonth(), y = d.getFullYear();
    if (m >= 2 && m <= 4) return 'Spring ' + y;
    if (m >= 5 && m <= 7) return 'Summer ' + y;
    if (m >= 8 && m <= 10) return 'Autumn ' + y;
    const start = m === 11 ? y : y - 1;
    return 'Winter ' + start + '\u2013' + String(start + 1).slice(2);
  }

  const img = document.getElementById('moon-img');
  const nameEl = document.getElementById('moon-name');
  const metaEl = document.getElementById('moon-meta');
  if (img) img.src = '/img/moons/' + file;
  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.innerHTML = '&nbsp;';

  // How many dreamers are in the club, stamped with the season.
  // Shown once the count clears 10 so launch week keeps its dignity.
  if (metaEl) {
    fetch('https://opkalkbjecbnnavxnmdb.supabase.co/rest/v1/rpc/dreamer_stats', {
      method: 'POST',
      headers: {
        apikey: 'sb_publishable_2cxTEoh2ZkVcMSb0e9JIDg_CK05bW4f',
        authorization: 'Bearer sb_publishable_2cxTEoh2ZkVcMSb0e9JIDg_CK05bW4f',
        'content-type': 'application/json',
      },
      body: '{}',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((rows) => {
        const total = rows && rows[0] && Number(rows[0].total);
        if (total >= 10) {
          metaEl.textContent =
            total.toLocaleString() + ' Dreamers as of ' + seasonLabel(now) + '.';
        }
      })
      .catch(() => {});
  }
})();
