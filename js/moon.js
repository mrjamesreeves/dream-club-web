// Tonight's moon, computed client-side — shared by every page.
// Fills #moon-img, #moon-name, #moon-meta when present. Same eight
// buckets as the app; images are the NASA set.
(function () {
  const SYNODIC = 29.53058867;
  const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // known new moon
  // [upper bound, name, dark-page file, light-page slug]. The light
  // set (img/moons/light/<slug>.png) is the app's light-mode moon:
  // white disc, grey shadow, transparent ground, for white pages.
  const PHASES = [
    [0.034, 'New Moon',        'new.webp',                 'new'],
    [0.216, 'Waxing Crescent', 'waxing-crescent.jpg',      'waxing-crescent'],
    [0.284, 'First Quarter',   'first-quarter.jpg',        'first-quarter'],
    [0.466, 'Waxing Gibbous',  'waxing-gibbous.jpg',       'waxing-gibbous'],
    [0.534, 'Full Moon',       'full.webp',                'full'],
    [0.716, 'Waning Gibbous',  'waning-gibbous.jpg.webp',  'waning-gibbous'],
    [0.784, 'Last Quarter',    'third-quarter.jpg.webp',   'last-quarter'],
    [0.966, 'Waning Crescent', 'waning-crescent.jpg.webp', 'waning-crescent'],
    [1.001, 'New Moon',        'new.webp',                 'new'],
  ];

  const now = new Date();
  const age = (((now - REF_NEW_MOON) / 86400000) % SYNODIC + SYNODIC) % SYNODIC;
  const normalized = age / SYNODIC;
  const [, name, file, slug] = PHASES.find(([limit]) => normalized < limit);

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
  // A page on white marks its moon data-light and gets the light set.
  const dreamersEl = document.getElementById('moon-dreamers');
  if (img) img.src = img.dataset.light != null ? '/img/moons/light/' + slug + '.png' : '/img/moons/' + file;
  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.textContent = seasonLabel(now);

  // The club headcount joins the season stamp once it clears 10,
  // so launch week keeps its dignity.
  if (metaEl || dreamersEl) {
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
          if (metaEl) {
            metaEl.textContent =
              seasonLabel(now) + ' \u2022 ' + total.toLocaleString() + ' Dreamers';
          }
          // The home page carries the headcount alone, under the phase.
          if (dreamersEl) dreamersEl.textContent = total.toLocaleString() + ' Dreamers';
        }
      })
      .catch(() => {});
  }
})();
