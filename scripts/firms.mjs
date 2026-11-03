// Builds Firm-List-Import.xlsx: Vault 100 firms with NYC offices + large Toronto/Montreal/Vancouver firms.
// Ranks are only filled where a 2026-27 source states them; everything else is tagged "Vault 100" without a rank.
import XLSX from 'xlsx';

const V = 'Vault 100 (2026-27)';
const SRC = 'Ranks from Vault 2026-27 (Apr 2026) coverage; unranked = rank not published free — check vault.com.';
const nyc = [
  // [name, aliases, rank|null, note]
  ['Cravath, Swaine & Moore LLP', 'Cravath', 1, ''],
  ['Wachtell, Lipton, Rosen & Katz', 'Wachtell; WLRK', 2, 'Vault #1 in New York regional ranking and in General Corporate / M&A.'],
  ['Skadden, Arps, Slate, Meagher & Flom LLP', 'Skadden', 3, 'Vault #1 in Tax.'],
  ['Latham & Watkins LLP', 'Latham', 4, 'Vault #1 in Securities/Capital Markets.'],
  ['Sullivan & Cromwell LLP', 'S&C', 5, ''],
  ['Kirkland & Ellis LLP', 'K&E; Kirkland', 6, 'Vault #1 in Private Equity and Bankruptcy/Restructuring.'],
  ['Davis Polk & Wardwell LLP', 'Davis Polk', 7, ''],
  ['Gibson, Dunn & Crutcher LLP', 'Gibson Dunn', 8, ''],
  ['Milbank LLP', 'Milbank', 9, ''],
  ['Simpson Thacher & Bartlett LLP', 'Simpson Thacher; STB', 10, ''],
  ['Paul, Weiss, Rifkind, Wharton & Garrison LLP', 'Paul Weiss', 13, 'Also has a Toronto office.'],
  ['Susman Godfrey LLP', 'Susman', 19, 'Litigation.'],
  ['Perkins Coie LLP', 'Perkins', 24, 'Combining with Ashurst.'],
  ['WilmerHale', 'Wilmer Cutler Pickering Hale and Dorr', 25, ''],
  ['Hogan Lovells', 'Hogan Lovells US LLP', 30, 'Combining with Cadwalader.'],
  ['Willkie Farr & Gallagher LLP', 'Willkie', 35, ''],
  ['Akin Gump Strauss Hauer & Feld LLP', 'Akin; Akin Gump', 38, ''],
  ['Jenner & Block LLP', 'Jenner', 43, ''],
  ['McDermott Will & Schulte LLP', 'McDermott; Schulte Roth & Zabel; McDermott Will & Emery', 46, 'Formed 2025 from McDermott Will & Emery + Schulte Roth & Zabel.'],
  ['A&O Shearman', 'Allen & Overy; Shearman & Sterling', 56, ''],
  ['Boies Schiller Flexner LLP', 'Boies Schiller; BSF', 61, 'Litigation.'],
  ['Cadwalader, Wickersham & Taft LLP', 'Cadwalader', 64, 'Combining with Hogan Lovells.'],
  ['Cahill Gordon & Reindel LLP', 'Cahill', 73, ''],
  ['Cleary Gottlieb Steen & Hamilton LLP', 'Cleary', null, ''],
  ['Covington & Burling LLP', 'Covington', null, 'Vault #1 in Washington, DC.'],
  ['Debevoise & Plimpton LLP', 'Debevoise', null, ''],
  ['Quinn Emanuel Urquhart & Sullivan, LLP', 'Quinn Emanuel; Quinn', null, 'Vault #1 in General Commercial Litigation.'],
  ['Weil, Gotshal & Manges LLP', 'Weil', null, ''],
  ['Sidley Austin LLP', 'Sidley', null, ''],
  ['Ropes & Gray LLP', 'Ropes', null, 'Vault #1 in Boston.'],
  ['Jones Day', '', null, ''],
  ['White & Case LLP', 'W&C', null, 'Vault #1 in International.'],
  ['Goodwin Procter LLP', 'Goodwin', null, ''],
  ['Cooley LLP', 'Cooley', null, 'Vault #1 in Northern California and Emerging Companies/VC.'],
  ['Freshfields LLP', 'Freshfields', null, ''],
  ['Fried, Frank, Harris, Shriver & Jacobson LLP', 'Fried Frank', null, ''],
  ['Proskauer Rose LLP', 'Proskauer', null, ''],
  ['Arnold & Porter Kaye Scholer LLP', 'Arnold & Porter', null, ''],
  ['Morgan, Lewis & Bockius LLP', 'Morgan Lewis', null, ''],
  ['Mayer Brown LLP', 'Mayer Brown', null, ''],
  ['Paul Hastings LLP', 'Paul Hastings', null, ''],
  ['Orrick, Herrington & Sutcliffe LLP', 'Orrick', null, ''],
  ['Wilson Sonsini Goodrich & Rosati', 'Wilson Sonsini; WSGR', null, ''],
  ['Morrison & Foerster LLP', 'MoFo; Morrison Foerster', null, 'Top 25 in the 2026 edition.'],
  ['Clifford Chance US LLP', 'Clifford Chance', null, ''],
  ['Linklaters LLP', 'Linklaters', null, ''],
  ['Dechert LLP', 'Dechert', null, ''],
  ['King & Spalding LLP', 'King & Spalding', null, ''],
  ['Vinson & Elkins LLP', 'V&E', null, 'Vault #1 in Texas and Energy.'],
  ['Baker McKenzie', 'Baker & McKenzie', null, ''],
  ['Winston & Strawn LLP', 'Winston', null, ''],
  ['Katten Muchin Rosenman LLP', 'Katten', null, ''],
  ['Greenberg Traurig, LLP', 'Greenberg; GT', null, ''],
  ['Holland & Knight LLP', 'Holland & Knight', null, 'Vault #1 in Florida.'],
  ['Baker Botts L.L.P.', 'Baker Botts', null, ''],
  ['Alston & Bird LLP', 'Alston', null, ''],
  ['Crowell & Moring LLP', 'Crowell', null, ''],
  ['Hughes Hubbard & Reed LLP', 'Hughes Hubbard', null, ''],
  ['Fish & Richardson P.C.', 'Fish', null, 'Vault #1 in Intellectual Property.'],
  ['Fenwick & West LLP', 'Fenwick', null, ''],
  ['Sheppard, Mullin, Richter & Hampton LLP', 'Sheppard Mullin; Sheppard', null, ''],
  ['Mintz, Levin, Cohn, Ferris, Glovsky and Popeo, P.C.', 'Mintz', null, 'Also has a Toronto office (corporate) with a 2L program.'],
];

const canada = [
  // [name, aliases, market, offices, tiers, note]
  ['Blake, Cassels & Graydon LLP', 'Blakes; Blake Cassels', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa', 'Seven Sisters', ''],
  ['Davies Ward Phillips & Vineberg LLP', 'Davies', 'Toronto', 'Toronto, Montreal, New York', 'Seven Sisters', ''],
  ['Goodmans LLP', 'Goodmans', 'Toronto', 'Toronto', 'Seven Sisters', ''],
  ['McCarthy Tétrault LLP', 'McCarthy; McCarthys; McCarthy Tetrault', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Quebec City, New York', 'Seven Sisters', ''],
  ['Osler, Hoskin & Harcourt LLP', 'Osler', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa, New York', 'Seven Sisters', ''],
  ['Stikeman Elliott LLP', 'Stikeman', 'Montreal', 'Montreal, Toronto, Vancouver, Calgary, Ottawa, New York', 'Seven Sisters', ''],
  ['Torys LLP', 'Torys', 'Toronto', 'Toronto, Montreal, Calgary, New York', 'Seven Sisters', ''],
  ['Bennett Jones LLP', 'Bennett Jones', 'Toronto', 'Toronto, Calgary, Vancouver, Montreal, Ottawa, Edmonton, New York', 'National', ''],
  ['Borden Ladner Gervais LLP', 'BLG; Borden Ladner', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa', 'National', ''],
  ['Fasken Martineau DuMoulin LLP', 'Fasken', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa, Quebec City', 'National', ''],
  ['Gowling WLG (Canada) LLP', 'Gowling; Gowlings', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa', 'National', ''],
  ['Norton Rose Fulbright Canada LLP', 'Norton Rose; NRF', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa, Quebec City', 'National', 'Global firm; US offices include New York.'],
  ['Dentons Canada LLP', 'Dentons', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa, Edmonton', 'National', 'Global firm.'],
  ['McMillan LLP', 'McMillan', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary, Ottawa', 'National', ''],
  ['Cassels Brock & Blackwell LLP', 'Cassels', 'Toronto', 'Toronto, Vancouver, Calgary', 'National', ''],
  ['Miller Thomson LLP', 'Miller Thomson', 'Toronto', 'Toronto, Montreal, Vancouver, Calgary', 'National', ''],
  ['DLA Piper (Canada) LLP', 'DLA Piper', 'Vancouver', 'Vancouver, Toronto, Calgary, Montreal, Edmonton', 'National', 'Global firm; US offices include New York.'],
  ['Aird & Berlis LLP', 'Aird & Berlis', 'Toronto', 'Toronto', 'Bay Street', ''],
  ['Fogler, Rubinoff LLP', 'Foglers', 'Toronto', 'Toronto', 'Bay Street', ''],
  ['WeirFoulds LLP', 'WeirFoulds', 'Toronto', 'Toronto', 'Bay Street', ''],
  ['Lenczner Slaght LLP', 'Lenczner Slaght', 'Toronto', 'Toronto', 'Boutique', 'Litigation boutique.'],
  ['Lavery, de Billy LLP', 'Lavery', 'Montreal', 'Montreal, Quebec City', 'Quebec', ''],
  ['Langlois Lawyers LLP', 'Langlois', 'Montreal', 'Montreal, Quebec City', 'Quebec', ''],
  ['BCF Business Law', 'BCF', 'Montreal', 'Montreal, Quebec City', 'Quebec', ''],
  ['De Grandpré Chait LLP', 'De Grandpré Chait; DGC', 'Montreal', 'Montreal', 'Quebec', ''],
  ['IMK LLP', 'IMK; Irving Mitchell Kalichman', 'Montreal', 'Montreal', 'Quebec', ''],
  ['Woods LLP', 'Woods', 'Montreal', 'Montreal', 'Boutique', 'Litigation boutique.'],
  ['Robinson Sheppard Shapiro LLP', 'RSS', 'Montreal', 'Montreal', 'Quebec', ''],
  ['Lawson Lundell LLP', 'Lawson Lundell', 'Vancouver', 'Vancouver, Calgary, Yellowknife', 'BC', ''],
  ['Farris LLP', 'Farris', 'Vancouver', 'Vancouver, Victoria, Kelowna, Calgary', 'BC', ''],
  ['Clark Wilson LLP', 'Clark Wilson', 'Vancouver', 'Vancouver', 'BC', ''],
  ['Harper Grey LLP', 'Harper Grey', 'Vancouver', 'Vancouver', 'BC', 'Litigation-focused.'],
  ['Alexander Holburn Beaudin + Lang LLP', 'Alexander Holburn; AHBL', 'Vancouver', 'Vancouver, Toronto', 'BC', ''],
];

const rows = [];
for (const [name, aliases, rank, note] of nyc) {
  const tier = rank && rank <= 10 ? 'Vault 10' : rank && rank <= 25 ? 'Vault 25' : 'Vault 100';
  rows.push({
    'Firm Name': name, 'Other names': aliases, Type: 'firm', Market: 'NYC', Offices: 'New York',
    Tiers: tier, Status: 'Not Started', 'How I Found Them': V,
    Notes: [rank ? `Vault 100 2026-27: #${rank}.` : 'Vault 100 2026-27 (rank not checked).', note].filter(Boolean).join(' '),
  });
}
for (const [name, aliases, market, offices, tier, note] of canada) {
  rows.push({
    'Firm Name': name, 'Other names': aliases, Type: 'firm', Market: market, Offices: offices,
    Tiers: tier, Status: 'Not Started', 'How I Found Them': 'Large Canadian firms list (Nov 2026)',
    Notes: [note, 'Offices from memory — check the firm site.'].filter(Boolean).join(' '),
  });
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);
ws['!cols'] = [{ wch: 44 }, { wch: 30 }, { wch: 6 }, { wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 26 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, ws, 'Firms to import');
const about = [
  ['Firm list for import'], [],
  ['How to use', 'Tracker → Settings → Import → choose this file. Firms already in the tracker are skipped.'],
  ['NYC', 'Firms on the Vault 100 (2026-27) that have a New York office. Firms without one (e.g. Munger Tolles, Kellogg Hansen) are left out.'],
  ['Ranks', SRC],
  ['Canada', 'Seven Sisters, other national firms, and large Montreal and Vancouver firms. Offices are from memory; check each firm site.'],
  ['Status', 'All imported as "Not Started" so they stay separate from firms you are actively researching.'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(about), 'About');
XLSX.writeFile(wb, process.argv[2] ?? 'Firm-List-Import.xlsx');
console.log(`${nyc.length} NYC + ${canada.length} Canada = ${rows.length} firms`);
