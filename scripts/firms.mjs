// Builds Firm-List-Import.csv/.xlsx from two sources only:
//   - Vault 100 (2026-27): firms with a New York office. Ranks filled only where a source states them.
//   - Chambers (tables as published Nov 2026): USA 2026 New York; Canada Ontario / Québec / BC / Nationwide.
// Usage: node scripts/firms.mjs out/Firm-List-Import   (writes .csv and .xlsx)
import XLSX from 'xlsx';

// ---------- Chambers rankings (firm → list of [table, band]) ----------
// Table codes: "Elite" and "HR" (Highly Regarded) are separate Chambers tables; Band 1 is highest within each.
const CH = {};
const add = (table, bands) => bands.forEach((names, i) => names.forEach((n) => (CH[n] ??= []).push(`${table} ${i + 1}`)));

add('NY M&A Elite', [
  ['Cravath', 'Davis Polk', 'Kirkland', 'Paul Weiss', 'Simpson Thacher', 'Skadden', 'Sullivan & Cromwell', 'Wachtell'],
  ['Debevoise', 'Freshfields', 'Latham'], ['Cleary', 'Weil'], ['A&O Shearman', 'Gibson Dunn', 'Paul Hastings', 'White & Case', 'Willkie'],
]);
add('NY M&A HR', [
  ['Fried Frank', 'Goodwin', 'Jones Day', 'Morgan Lewis', 'Ropes & Gray', 'Sidley'],
  ['Clifford Chance', 'Cooley', 'Covington', 'Dechert', 'Milbank'],
  ['Akin', 'Baker McKenzie', 'DLA Piper US', 'Hughes Hubbard', 'MoFo', 'Proskauer'],
  ['Baker Botts', 'Fenwick', 'Hogan Lovells Cadwalader', 'Linklaters', 'McDermott', 'Seward & Kissel'],
  ['Arnold & Porter', 'BakerHostetler', 'Dorsey', 'HSF Kramer', 'Mayer Brown', 'McGuireWoods', 'Mintz', 'Orrick', 'Reed Smith', 'V&E', 'WilmerHale'],
]);
add('NY Lit Elite', [
  ['Cravath', 'Gibson Dunn', 'Kirkland', 'Latham', 'Paul Weiss', 'Quinn Emanuel', 'Skadden', 'Sullivan & Cromwell', 'Susman'],
  ['Cleary', 'Davis Polk', 'Debevoise', 'Simpson Thacher', 'Wachtell', 'Weil', 'White & Case', 'WilmerHale'],
  ['Cahill', 'Friedman Kaplan', 'King & Spalding', 'Milbank', 'Paul Hastings'],
  ['Holwell Shuster', 'Jones Day', 'Kasowitz', 'Kobre & Kim', 'MoFo', "O'Melveny", 'Sidley'],
]);
add('ON Corp Elite', [
  ['Blakes', 'Davies', 'Goodmans', 'McCarthy', 'Osler', 'Stikeman', 'Torys'],
  ['Bennett Jones', 'Cassels', 'Fasken', 'Norton Rose'], ['BLG', 'DLA Piper Canada'],
]);
add('ON Corp HR', [
  ['Aird & Berlis', 'Baker McKenzie', 'Miller Thomson', 'Torkin Manes', 'Wildeboer Dellelce'],
  ['Blaney McMurtry', 'Dickinson Wright', 'Gowling', 'Loopstra Nixon'],
]);
add('ON Lit Elite', [
  ['Blakes', 'Davies', 'Lax O\'Sullivan', 'Lenczner Slaght', 'McCarthy', 'Stikeman', 'Torys'],
  ['Bennett Jones', 'Osler'], ['Goodmans', 'Norton Rose', 'Paliare Roland'],
  ['Adair Goldblatt', 'Chernos Flaherty', 'Dentons', 'Fasken', 'Gowling'], ['BLG', 'McMillan', 'Stockwoods'],
]);
add('QC Corp Elite', [['Davies', 'Fasken', 'McCarthy', 'Norton Rose', 'Stikeman'], ['Blakes', 'Osler'], ['BLG', 'Dentons']]);
add('QC Corp HR', [['BCF', 'Lavery']]); // other Québec "Highly Regarded" firms are tagged below without a band (editions disagree)
add('QC Lit', [['Davies', 'McCarthy', 'Norton Rose', 'Stikeman']]);
add('BC Corp Elite', [['Blakes', 'McCarthy'], ['Bennett Jones', 'BLG', 'Fasken', 'Lawson Lundell', 'Osler', 'Stikeman'], ['Farris', 'Norton Rose']]);
add('BC Corp HR', [['DLA Piper Canada'], ['Cassels', 'Gowling', 'Mogan Daniels Slager'], ['Boughton', 'Sangra Moller', 'DuMoulin Black']]);
add('BC Lit', [['Fasken', 'McCarthy', 'Nathanson Schachter']]);
add('BC Lit HR', [['Hunter Litigation Chambers', 'Poulus Ensom Smith']]);
add('Canada Lit', [['Blakes', 'Davies', 'McCarthy']]);
['KRB', 'Langlois', 'Prelia', 'Stein Monast', 'Lapointe Rosenstein', 'Therrien Couture'].forEach((n) => (CH[n] ??= []).push('QC Corp HR'));

// ---------- firms ----------
// [key (matches CH), full name, other names, market, offices, vault rank | 'V' (on Vault 100, rank not published) | null, note]
const NYC = 'New York';
const firms = [
  ['Cravath', 'Cravath, Swaine & Moore LLP', 'Cravath', 'NYC', NYC, 1, ''],
  ['Wachtell', 'Wachtell, Lipton, Rosen & Katz', 'Wachtell; WLRK', 'NYC', NYC, 2, 'Vault #1 in the New York regional ranking.'],
  ['Skadden', 'Skadden, Arps, Slate, Meagher & Flom LLP', 'Skadden', 'NYC', NYC, 3, ''],
  ['Latham', 'Latham & Watkins LLP', 'Latham', 'NYC', NYC, 4, ''],
  ['Sullivan & Cromwell', 'Sullivan & Cromwell LLP', 'S&C', 'NYC', NYC, 5, ''],
  ['Kirkland', 'Kirkland & Ellis LLP', 'K&E; Kirkland', 'NYC', NYC, 6, ''],
  ['Davis Polk', 'Davis Polk & Wardwell LLP', 'Davis Polk', 'NYC', NYC, 7, ''],
  ['Gibson Dunn', 'Gibson, Dunn & Crutcher LLP', 'Gibson Dunn', 'NYC', NYC, 8, ''],
  ['Milbank', 'Milbank LLP', 'Milbank', 'NYC', NYC, 9, ''],
  ['Simpson Thacher', 'Simpson Thacher & Bartlett LLP', 'Simpson Thacher; STB', 'NYC', NYC, 10, ''],
  ['Paul Weiss', 'Paul, Weiss, Rifkind, Wharton & Garrison LLP', 'Paul Weiss', 'NYC', 'New York, Toronto', 13, ''],
  ['Susman', 'Susman Godfrey LLP', 'Susman', 'NYC', NYC, 19, 'Litigation boutique.'],
  ['Perkins Coie', 'Perkins Coie LLP', 'Perkins', 'NYC', NYC, 24, 'Combining with Ashurst.'],
  ['WilmerHale', 'WilmerHale', 'Wilmer Cutler Pickering Hale and Dorr', 'NYC', NYC, 25, ''],
  ['Hogan Lovells Cadwalader', 'Hogan Lovells Cadwalader', 'Hogan Lovells; Cadwalader; Cadwalader, Wickersham & Taft', 'NYC', NYC, null, 'Merged firm. Vault 2026-27 ranked Hogan Lovells #30 and Cadwalader #64 before combining.'],
  ['Willkie', 'Willkie Farr & Gallagher LLP', 'Willkie', 'NYC', NYC, 35, ''],
  ['Akin', 'Akin Gump Strauss Hauer & Feld LLP', 'Akin; Akin Gump', 'NYC', NYC, 38, ''],
  ['Jenner', 'Jenner & Block LLP', 'Jenner', 'NYC', NYC, 43, ''],
  ['McDermott', 'McDermott Will & Schulte LLP', 'McDermott; Schulte Roth & Zabel; McDermott Will & Emery', 'NYC', NYC, 46, ''],
  ['A&O Shearman', 'A&O Shearman', 'Allen & Overy; Shearman & Sterling', 'NYC', NYC, 56, ''],
  ['Boies', 'Boies Schiller Flexner LLP', 'Boies Schiller; BSF', 'NYC', NYC, 61, 'Litigation.'],
  ['Cahill', 'Cahill Gordon & Reindel LLP', 'Cahill', 'NYC', NYC, 73, ''],
  ['Cleary', 'Cleary Gottlieb Steen & Hamilton LLP', 'Cleary', 'NYC', NYC, 'V', ''],
  ['Covington', 'Covington & Burling LLP', 'Covington', 'NYC', NYC, 'V', ''],
  ['Debevoise', 'Debevoise & Plimpton LLP', 'Debevoise', 'NYC', NYC, 'V', ''],
  ['Quinn Emanuel', 'Quinn Emanuel Urquhart & Sullivan, LLP', 'Quinn Emanuel; Quinn', 'NYC', NYC, 'V', ''],
  ['Weil', 'Weil, Gotshal & Manges LLP', 'Weil', 'NYC', NYC, 'V', ''],
  ['Sidley', 'Sidley Austin LLP', 'Sidley', 'NYC', NYC, 'V', ''],
  ['Ropes & Gray', 'Ropes & Gray LLP', 'Ropes', 'NYC', NYC, 'V', ''],
  ['Jones Day', 'Jones Day', '', 'NYC', NYC, 'V', ''],
  ['White & Case', 'White & Case LLP', 'W&C', 'NYC', NYC, 'V', ''],
  ['Goodwin', 'Goodwin Procter LLP', 'Goodwin', 'NYC', NYC, 'V', ''],
  ['Cooley', 'Cooley LLP', 'Cooley', 'NYC', NYC, 'V', ''],
  ['Freshfields', 'Freshfields LLP', 'Freshfields; Freshfields US LLP', 'NYC', NYC, 'V', ''],
  ['Fried Frank', 'Fried, Frank, Harris, Shriver & Jacobson LLP', 'Fried Frank', 'NYC', NYC, 'V', ''],
  ['Proskauer', 'Proskauer Rose LLP', 'Proskauer', 'NYC', NYC, 'V', ''],
  ['Arnold & Porter', 'Arnold & Porter Kaye Scholer LLP', 'Arnold & Porter', 'NYC', NYC, 'V', ''],
  ['Morgan Lewis', 'Morgan, Lewis & Bockius LLP', 'Morgan Lewis', 'NYC', NYC, 'V', ''],
  ['Mayer Brown', 'Mayer Brown LLP', 'Mayer Brown', 'NYC', NYC, 'V', ''],
  ['Paul Hastings', 'Paul Hastings LLP', 'Paul Hastings', 'NYC', NYC, 'V', ''],
  ['Orrick', 'Orrick, Herrington & Sutcliffe LLP', 'Orrick', 'NYC', NYC, 'V', ''],
  ['Wilson Sonsini', 'Wilson Sonsini Goodrich & Rosati', 'Wilson Sonsini; WSGR', 'NYC', NYC, 'V', ''],
  ['MoFo', 'Morrison & Foerster LLP', 'MoFo; Morrison Foerster', 'NYC', NYC, 'V', ''],
  ['Clifford Chance', 'Clifford Chance US LLP', 'Clifford Chance', 'NYC', NYC, 'V', ''],
  ['Linklaters', 'Linklaters LLP', 'Linklaters', 'NYC', NYC, 'V', ''],
  ['Dechert', 'Dechert LLP', 'Dechert', 'NYC', NYC, 'V', ''],
  ['King & Spalding', 'King & Spalding LLP', 'King & Spalding', 'NYC', NYC, 'V', ''],
  ['V&E', 'Vinson & Elkins LLP', 'V&E', 'NYC', NYC, 'V', ''],
  ['Baker McKenzie', 'Baker McKenzie', 'Baker & McKenzie', 'NYC', 'New York, Toronto', 'V', ''],
  ['Winston', 'Winston & Strawn LLP', 'Winston', 'NYC', NYC, 'V', ''],
  ['Katten', 'Katten Muchin Rosenman LLP', 'Katten', 'NYC', NYC, 'V', ''],
  ['Greenberg', 'Greenberg Traurig, LLP', 'Greenberg; GT', 'NYC', NYC, 'V', ''],
  ['Holland & Knight', 'Holland & Knight LLP', 'Holland & Knight', 'NYC', NYC, 'V', ''],
  ['Baker Botts', 'Baker Botts L.L.P.', 'Baker Botts', 'NYC', NYC, 'V', ''],
  ['Alston', 'Alston & Bird LLP', 'Alston', 'NYC', NYC, 'V', ''],
  ['Crowell', 'Crowell & Moring LLP', 'Crowell', 'NYC', NYC, 'V', ''],
  ['Hughes Hubbard', 'Hughes Hubbard & Reed LLP', 'Hughes Hubbard', 'NYC', NYC, 'V', ''],
  ['Fish', 'Fish & Richardson P.C.', 'Fish', 'NYC', NYC, 'V', 'Vault #1 in Intellectual Property.'],
  ['Fenwick', 'Fenwick & West LLP', 'Fenwick', 'NYC', NYC, 'V', ''],
  ['Sheppard Mullin', 'Sheppard, Mullin, Richter & Hampton LLP', 'Sheppard Mullin', 'NYC', NYC, 'V', ''],
  ['Mintz', 'Mintz, Levin, Cohn, Ferris, Glovsky and Popeo, P.C.', 'Mintz', 'NYC', 'New York, Boston, Toronto', 'V', 'Toronto office hires 2L summers.'],
  // Chambers-only, New York
  ['Seward & Kissel', 'Seward & Kissel LLP', 'Seward & Kissel', 'NYC', NYC, null, ''],
  ['BakerHostetler', 'BakerHostetler LLP', 'BakerHostetler; Baker Hostetler', 'NYC', NYC, null, ''],
  ['Dorsey', 'Dorsey & Whitney LLP', 'Dorsey', 'NYC', NYC, null, ''],
  ['HSF Kramer', 'HSF Kramer', 'Kramer Levin; Herbert Smith Freehills', 'NYC', NYC, null, 'Formed 2025 from Herbert Smith Freehills + Kramer Levin.'],
  ['McGuireWoods', 'McGuireWoods LLP', 'McGuireWoods', 'NYC', NYC, null, ''],
  ['Reed Smith', 'Reed Smith LLP', 'Reed Smith', 'NYC', NYC, null, ''],
  ['DLA Piper US', 'DLA Piper LLP (US)', 'DLA Piper US', 'NYC', NYC, null, 'Separate entry from DLA Piper (Canada).'],
  ['Friedman Kaplan', 'Friedman Kaplan Seiler Adelman & Robbins LLP', 'Friedman Kaplan', 'NYC', NYC, null, 'Litigation boutique.'],
  ['Holwell Shuster', 'Holwell Shuster & Goldberg LLP', 'Holwell Shuster', 'NYC', NYC, null, 'Litigation boutique.'],
  ['Kasowitz', 'Kasowitz LLP', 'Kasowitz', 'NYC', NYC, null, 'Litigation.'],
  ['Kobre & Kim', 'Kobre & Kim LLP', 'Kobre & Kim', 'NYC', NYC, null, 'Litigation and investigations.'],
  ["O'Melveny", "O'Melveny & Myers LLP", "O'Melveny", 'NYC', NYC, null, ''],

  // Canada — national
  ['Blakes', 'Blake, Cassels & Graydon LLP', 'Blakes; Blake Cassels', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa', null, ''],
  ['Davies', 'Davies Ward Phillips & Vineberg LLP', 'Davies', 'Toronto', 'Toronto, Montreal, New York', null, ''],
  ['Goodmans', 'Goodmans LLP', 'Goodmans', 'Toronto', 'Toronto', null, ''],
  ['McCarthy', 'McCarthy Tétrault LLP', 'McCarthy; McCarthys; McCarthy Tetrault', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Quebec City', null, ''],
  ['Osler', 'Osler, Hoskin & Harcourt LLP', 'Osler', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa, New York', null, ''],
  ['Stikeman', 'Stikeman Elliott LLP', 'Stikeman', 'Montreal', 'Montreal, Toronto, Vancouver, Calgary, Ottawa', null, ''],
  ['Torys', 'Torys LLP', 'Torys', 'Toronto', 'Toronto, Montreal, Calgary, New York', null, ''],
  ['Bennett Jones', 'Bennett Jones LLP', 'Bennett Jones', 'Toronto', 'Toronto, Calgary, Vancouver, Montreal', null, ''],
  ['BLG', 'Borden Ladner Gervais LLP', 'BLG; Borden Ladner', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa', null, ''],
  ['Fasken', 'Fasken', 'Fasken Martineau', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa, Quebec City', null, ''],
  ['Gowling', 'Gowling WLG (Canada) LLP', 'Gowling; Gowlings', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa', null, ''],
  ['Norton Rose', 'Norton Rose Fulbright Canada LLP', 'Norton Rose; NRF', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa, Quebec City', null, ''],
  ['Dentons', 'Dentons Canada LLP', 'Dentons', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary', null, ''],
  ['McMillan', 'McMillan LLP', 'McMillan', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa', null, ''],
  ['Cassels', 'Cassels Brock & Blackwell LLP', 'Cassels Brock', 'Toronto', 'Toronto, Vancouver, Calgary', null, ''],
  ['Miller Thomson', 'Miller Thomson LLP', 'Miller Thomson', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary', null, ''],
  ['DLA Piper Canada', 'DLA Piper (Canada) LLP', 'DLA Piper Canada', 'Vancouver', 'Vancouver, Toronto, Calgary, Montreal', null, ''],
  // Toronto
  ['Aird & Berlis', 'Aird & Berlis LLP', 'Aird & Berlis', 'Toronto', 'Toronto', null, ''],
  ['Torkin Manes', 'Torkin Manes LLP', 'Torkin Manes', 'Toronto', 'Toronto', null, ''],
  ['Wildeboer Dellelce', 'Wildeboer Dellelce LLP', 'Wildeboer Dellelce; WD', 'Toronto', 'Toronto', null, ''],
  ['Blaney McMurtry', 'Blaney McMurtry LLP', 'Blaney McMurtry; Blaneys', 'Toronto', 'Toronto', null, ''],
  ['Dickinson Wright', 'Dickinson Wright LLP', 'Dickinson Wright', 'Toronto', 'Toronto (US firm)', null, ''],
  ['Loopstra Nixon', 'Loopstra Nixon LLP', 'Loopstra Nixon', 'Toronto', 'Toronto area', null, ''],
  ["Lax O'Sullivan", "Lax O'Sullivan Lisus Gottlieb LLP", "Lax O'Sullivan; LOLG", 'Toronto', 'Toronto', null, 'Litigation boutique.'],
  ['Lenczner Slaght', 'Lenczner Slaght LLP', 'Lenczner Slaght; Lenczner', 'Toronto', 'Toronto', null, 'Litigation boutique.'],
  ['Paliare Roland', 'Paliare Roland Rosenberg Rothstein LLP', 'Paliare Roland; Paliares', 'Toronto', 'Toronto', null, 'Litigation boutique.'],
  ['Adair Goldblatt', 'Adair Goldblatt Bieber LLP', 'Adair Goldblatt Bieber; AGB', 'Toronto', 'Toronto', null, 'Litigation boutique.'],
  ['Chernos Flaherty', 'Chernos Flaherty Svonkin LLP', 'Chernos Flaherty Svonkin; CFS', 'Toronto', 'Toronto', null, 'Litigation boutique.'],
  ['Stockwoods', 'Stockwoods LLP', 'Stockwoods', 'Toronto', 'Toronto', null, 'Litigation boutique.'],
  // Montréal / Québec
  ['BCF', 'BCF Business Law', 'BCF; BCF LLP', 'Montreal', 'Montreal, Quebec City', null, ''],
  ['Lavery', 'Lavery, de Billy LLP', 'Lavery', 'Montreal', 'Montreal, Quebec City', null, ''],
  ['Langlois', 'Langlois Lawyers LLP', 'Langlois', 'Montreal', 'Montreal, Quebec City', null, ''],
  ['KRB', 'KRB Lawyers', 'KRB', 'Montreal', 'Montreal', null, ''],
  ['Prelia', 'Prelia', 'Prelia', 'Montreal', 'Montreal', null, ''],
  ['Stein Monast', 'Stein Monast L.L.P.', 'Stein Monast', 'Montreal', 'Quebec City', null, 'Québec City firm.'],
  ['Lapointe Rosenstein', 'Lapointe Rosenstein Marchand Melançon LLP', 'Lapointe Rosenstein; LRMM', 'Montreal', 'Montreal', null, ''],
  ['Therrien Couture', 'Therrien Couture Joli-Coeur LLP', 'Therrien Couture; TCJ', 'Montreal', 'Montreal, Quebec', null, ''],
  // Vancouver
  ['Lawson Lundell', 'Lawson Lundell LLP', 'Lawson Lundell', 'Vancouver', 'Vancouver, Calgary, Kelowna', null, ''],
  ['Farris', 'Farris LLP', 'Farris', 'Vancouver', 'Vancouver, Victoria, Kelowna', null, ''],
  ['Mogan Daniels Slager', 'Mogan Daniels Slager LLP', 'Mogan Daniels Slager; MDS', 'Vancouver', 'Vancouver', null, ''],
  ['Boughton', 'Boughton Law Corporation', 'Boughton', 'Vancouver', 'Vancouver', null, ''],
  ['Sangra Moller', 'Sangra Moller LLP', 'Sangra Moller', 'Vancouver', 'Vancouver', null, ''],
  ['DuMoulin Black', 'DuMoulin Black LLP', 'DuMoulin Black', 'Vancouver', 'Vancouver', null, ''],
  ['Nathanson Schachter', 'Nathanson, Schachter & Thompson LLP', 'Nathanson Schachter', 'Vancouver', 'Vancouver', null, 'Litigation boutique.'],
  ['Hunter Litigation Chambers', 'Hunter Litigation Chambers', 'Hunter Litigation', 'Vancouver', 'Vancouver', null, 'Litigation boutique.'],
  ['Poulus Ensom Smith', 'Poulus Ensom Smith LLP', 'Poulus Ensom Smith', 'Vancouver', 'Vancouver', null, 'Litigation boutique.'],
];

const seen = new Set(firms.map((f) => f[0]));
const unknown = Object.keys(CH).filter((k) => !seen.has(k));
if (unknown.length) throw new Error('Chambers names with no firm row: ' + unknown.join(', '));

const SEVEN = new Set(['Blakes', 'Davies', 'Goodmans', 'McCarthy', 'Osler', 'Stikeman', 'Torys']);
const label = (t) => t.replace(/ (\d)$/, ' — Band $1').replace(/^(NY|ON|QC|BC)/, (m) => ({ NY: 'New York', ON: 'Ontario', QC: 'Québec', BC: 'BC' }[m]))
  .replace('M&A Elite', 'Corporate/M&A: The Elite').replace('M&A HR', 'Corporate/M&A: Highly Regarded')
  .replace('Lit Elite', 'Litigation: The Elite').replace('Lit HR', 'Litigation: Highly Regarded').replace(/ Lit\b(?!igation)/, ' Litigation')
  .replace('Corp Elite', 'Corporate/Commercial: The Elite').replace('Corp HR', 'Corporate/Commercial: Highly Regarded');

const rows = firms.map(([key, name, aliases, market, offices, vault, note]) => {
  const ch = CH[key] ?? [];
  const tiers = [];
  if (typeof vault === 'number') tiers.push(vault <= 10 ? 'Vault 10' : vault <= 25 ? 'Vault 25' : 'Vault 100');
  else if (vault === 'V') tiers.push('Vault 100');
  if (SEVEN.has(key)) tiers.push('Seven Sisters');
  if (ch.some((t) => /(Elite|^QC Lit|^BC Lit|^Canada Lit) 1$/.test(t))) tiers.push('Chambers Band 1');
  const sources = [
    typeof vault === 'number' ? `Vault 100 2026-27: #${vault}.` : vault === 'V' ? 'Vault 100 2026-27 (rank not published free).' : '',
    ch.length ? `Chambers: ${ch.map(label).join('; ')}.` : '',
    note,
  ].filter(Boolean).join(' ');
  return {
    'Firm Name': name, 'Other names': aliases, Type: 'firm', Market: market, Offices: offices, Tiers: tiers.join('; '),
    Status: 'Not Started', 'How I Found Them': [vault != null ? 'Vault 100' : '', ch.length ? 'Chambers' : ''].filter(Boolean).join(' + '),
    Notes: sources,
  };
});
const orphan = rows.filter((r) => !r['How I Found Them']);
if (orphan.length) throw new Error('Firms with no source: ' + orphan.map((r) => r['Firm Name']).join(', '));

const out = process.argv[2] ?? 'Firm-List-Import';
const ws = XLSX.utils.json_to_sheet(rows);
require_fs().writeFileSync(out + '.csv', '\ufeff' + XLSX.utils.sheet_to_csv(ws));
const wb = XLSX.utils.book_new();
ws['!cols'] = [{ wch: 44 }, { wch: 30 }, { wch: 6 }, { wch: 10 }, { wch: 40 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 90 }];
XLSX.utils.book_append_sheet(wb, ws, 'Firms to import');
XLSX.writeFile(wb, out + '.xlsx');
const by = (m) => rows.filter((r) => r.Market === m).length;
console.log(`${rows.length} firms: NYC ${by('NYC')}, Toronto ${by('Toronto')}, Montreal ${by('Montreal')}, Vancouver ${by('Vancouver')}; with Chambers ranks ${rows.filter((r) => r.Notes.includes('Chambers')).length}`);

function require_fs() { return globalThis.process.getBuiltinModule('fs'); }
