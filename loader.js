// ---------- runtime data loader (map from Natural Earth, stats from World Bank) ----------
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const WB_URL = (c, p) => `https://api.worldbank.org/v2/country/all/indicator/${c}?format=json&per_page=20000&mrnev=1&page=${p}`;
const CACHE_KEY = 'countryClash.data.v4', CACHE_DAYS = 14;
// [WB code, id, category, label, unit, kind]  kind: num | usd | pct | dec
const STATS = [
['SP.POP.TOTL','pop','Population','total population','','num'],
['EN.POP.DNST','popdens','Population','population density','people/km²','dec'],
['SP.URB.TOTL','urbpop','Population','urban population','','num'],
['SP.POP.GROW','popgrow','Population','population growth rate','','pct'],
['SP.DYN.CBRT.IN','birth','Population','birth rate','per 1,000 people','dec'],
['SP.URB.TOTL.IN.ZS','urbpct','Population','urban population share','','pct'],
['NY.GDP.MKTP.CD','gdp','Economy','total GDP (nominal)','','usd'],
['NY.GDP.PCAP.CD','gdppc','Economy','GDP per capita','','usd'],
['NY.GDP.MKTP.PP.CD','gdpppp','Economy','GDP (PPP)','','usd'],
['NY.GDP.MKTP.KD.ZG','gdpgrow','Economy','GDP growth rate','','pct'],
['NE.EXP.GNFS.CD','exports','Economy','export value','','usd'],
['FI.RES.TOTL.CD','reserves','Economy','foreign exchange reserves','','usd'],
['ST.INT.RCPT.CD','tourrev','Economy','tourism revenue','','usd'],
['GC.DOD.TOTL.GD.ZS','debt','Economy','government debt relative to GDP','','pct'],
['AG.LND.TOTL.K2','land','Geography','land area','km²','num'],
['AG.SRF.TOTL.K2','area','Geography','total area','km²','num'],
['AG.LND.FRST.K2','forestkm','Geography','forest area','km²','num'],
['AG.LND.FRST.ZS','forestpct','Geography','forest coverage','','pct'],
['AG.LND.ARBL.HA','arable','Geography','arable land area','hectares','num'],
['ER.H2O.INTR.PC','water','Geography','freshwater resources per person','m³','num'],
['SP.DYN.LE00.IN','life','Health','life expectancy','years','dec'],
['SP.DYN.IMRT.IN','infmort','Health','infant mortality rate','per 1,000 births','dec'],
['SH.XPD.CHEX.PC.CD','healthpc','Health','healthcare spending per person','','usd'],
['SH.MED.PHYS.ZS','phys','Health','physician density','per 1,000 people','dec'],
['SH.MED.BEDS.ZS','beds','Health','hospital bed density','per 1,000 people','dec'],
['SE.ADT.LITR.ZS','lit','Education','adult literacy rate','','pct'],
['SE.XPD.TOTL.GD.ZS','eduexp','Education','education spending (% of GDP)','','pct'],
['SE.TER.ENRR','tertiary','Education','university enrollment rate','','pct'],
['IT.NET.USER.ZS','net','Technology','internet penetration','','pct'],
['IT.CEL.SETS.P2','mobile','Technology','mobile phone subscription rate','per 100 people','dec'],
['EG.FEC.RNEW.ZS','renew','Technology','renewable energy share','','pct'],
['EG.USE.ELEC.KH.PC','elec','Technology','electricity consumption per person','kWh','num'],
['GB.XPD.RSDV.GD.ZS','rnd','Technology','R&D spending (% of GDP)','','pct'],
['EG.ELC.ACCS.ZS','access','Technology','electricity access rate','','pct'],
['EN.ATM.CO2E.KT','co2','Environment','annual CO₂ emissions','kt','num'],
['EN.ATM.CO2E.PC','co2pc','Environment','CO₂ emissions per person','t','dec'],
['AG.LND.PRCP.MM','rain','Environment','annual rainfall','mm','num'],
['ER.LND.PTLD.ZS','protected','Environment','protected land share','','pct'],
['IS.RRS.TOTL.KM','rail','Misc','railway network length','km','num'],
['ST.INT.ARVL','arrivals','Misc','international tourist arrivals','','num'],
['MS.MIL.XPND.CD','military','Misc','military spending','','usd'],
['NV.AGR.TOTL.CD','agri','Misc','agricultural output','','usd'],
];
// Only real, sovereign countries: 'Sovereign country' entries, plus the sovereign states Natural Earth files under other labels.
// Dependencies (Ashmore & Cartier, Indian Ocean Ter., Puerto Rico, Hong Kong, Greenland, Jersey…) are deliberately left out.
const REAL = new Set('USA GBR NZL NLD FRA FIN DNK CHN AUS ISR PSE'.split(' '));
const FAMOUS = new Set('USA CHN IND BRA RUS JPN DEU GBR FRA ITA CAN AUS MEX ESP IDN SAU TUR EGY ZAF NGA ARG KOR IRN PAK THA SWE NOR FIN CHL PER COL UKR POL GRC NZL IRL ISR CUB NLD CHE'.split(' '));
const BOX = { DNK:[8,54,15.5,58], FRA:[-5.5,41,10,51.5], NLD:[3,50.5,7.5,53.8], USA:[-125,24,-66,50],
  NOR:[4,57,32,72], ESP:[-10,35.5,4.5,44], PRT:[-10,36.5,-6,42.2], CHL:[-76,-56,-66,-17.4], ECU:[-82,-5.1,-75,2] };

async function getJSON(u, tries = 3) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (i >= tries) throw new Error('Could not download ' + u.split('?')[0] + ' (' + e.message + ')'); await new Promise(r => setTimeout(r, 1200)); }
  }
}
const ringArea = r => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const bboxOf = pts => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);

function silhouette(iso, geom) {
  const shift = iso === 'RUS' ? ([x, y]) => [x < 0 ? x + 360 : x, y] : p => p;
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).map(p => p.map(r => r.map(shift)));
  const info = polys.map(p => { const b = bboxOf(p[0]); return { p, a: ringArea(p[0]), c: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] }; });
  let keep = info;
  if (BOX[iso]) { const [x0, y0, x1, y1] = BOX[iso]; keep = info.filter(i => i.c[0] >= x0 && i.c[0] <= x1 && i.c[1] >= y0 && i.c[1] <= y1); }
  if (!keep.length) keep = info;
  const big = keep.reduce((m, i) => (i.a > m.a ? i : m));
  const tot = keep.reduce((s, i) => s + i.a, 0);
  keep = keep.filter(i => i === big || (i.a >= tot * 0.002 && Math.hypot(i.c[0] - big.c[0], i.c[1] - big.c[1]) <= 60));
  const [x0, y0, x1, y1] = bboxOf(keep.flatMap(i => i.p.flat())), k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const W = (x1 - x0) * k, H = y1 - y0, s = 196 / Math.max(W, H);
  const tx = ([x, y]) => [(x - x0) * k * s + 2, (y1 - y) * s + 2];
  let d = '';
  for (const i of keep) for (const ring of i.p) {
    const out = []; for (const pt of ring.map(tx)) { const l = out[out.length - 1]; if (!l || Math.hypot(pt[0] - l[0], pt[1] - l[1]) >= 0.35) out.push(pt); }
    if (out.length >= 3) d += 'M' + out.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  }
  return { viewBox: `0 0 ${(W * s + 4).toFixed(1)} ${(H * s + 4).toFixed(1)}`, path: d };
}

async function loadData(onProgress = () => {}) {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); if (c && c.d && Date.now() - c.t < CACHE_DAYS * 864e5) return c.d; } catch {}
  onProgress('map…');
  const ne = await getJSON(NE_URL);
  const countries = {};
  for (const f of ne.features) {
    const p = k => f.properties[k] ?? f.properties[k.toLowerCase()];
    const iso = p('ISO_A3_EH'), cont = p('CONTINENT');
    if (!iso || iso === '-99' || iso === 'ATA' || /Seven seas/.test(cont)) continue;
    if (cont === 'Oceania' && !['AUS', 'NZL'].includes(iso)) continue;
    const type = p('TYPE');
    if (!(type === 'Sovereign country' || type === 'Sovereignty' || REAL.has(iso))) continue;
    if (countries[iso]) continue;   // never let a second feature with the same code overwrite the first
    countries[iso] = { id: iso, name: p('NAME'), continent: cont, iso2: p('ISO_A2_EH'), famous: FAMOUS.has(iso), ...silhouette(iso, f.geometry) };
  }
  const stats = {}; let done = 0, queue = [...STATS];
  async function worker() {
    while (queue.length) {
      const [code, id, category, label, unit, kind] = queue.shift();
      try {
        const values = {}; let page = 1, pages = 1;
        do {
          const [meta, rows] = await getJSON(WB_URL(code, page), 2); pages = meta.pages;
          for (const r of rows || []) if (r.value != null && countries[r.countryiso3code]) values[r.countryiso3code] = [r.value, +r.date];
        } while (++page <= pages);
        stats[id] = { id, category, label, unit, kind, source: `World Bank Open Data (${code})`, values };
      } catch (e) { console.warn('Skipped', code, e.message); }
      onProgress(`${++done}/${STATS.length}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const id of Object.keys(stats)) if (Object.keys(stats[id].values).length < 25) delete stats[id];
  if (Object.keys(stats).length < 10) throw new Error('Could not download the World Bank statistics. Check your internet connection and refresh.');
  for (const iso of Object.keys(countries)) if (Object.values(stats).filter(s => s.values[iso]).length < 12) delete countries[iso];
  const d = { countries, stats };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch {}
  return d;
}
