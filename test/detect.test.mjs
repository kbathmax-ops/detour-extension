/**
 * Detection tests. Run from the repo root: node test/detect.test.mjs
 *
 * Row text below is transcribed from a real Google Flights page (YVR-MEX
 * return leg, prices rendered in PEN) that the extension failed to detect at
 * all -- the symbol-only price regex matched nothing, so scanned stayed 0.
 */
import fs from 'node:fs';
const m = new Function(
  ['src/us-airports.js','src/core.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n') +
  '\nreturn { detourLooksLikeResult, detourJudgeRow, detourLayoverCodesIn, detourStopCount, DETOUR_US_AIRPORTS };'
)();
const fake = t => ({ innerText: t });
let fail = 0;
const t = (name, cond) => { console.log((cond?'  ok  ':'  FAIL') + '  ' + name); if(!cond) fail++; };

// ── the reported page: YVR–MEX return leg, prices in PEN ──
const pen = [
 ["DFW row","5:15 PM – 10:45 AM+1\nSeparate tickets · American\n18 hr 30 min\nMEX–YVR\n1 stop\n11 hr 11 min DFW\n380 kg CO2e\nAvg emissions\nPEN 1,914\nround trip","hide",["DFW"]],
 ["SFO row","5:00 AM – 2:39 PM\nUnited, Air Canada\n10 hr 39 min\nMEX–YVR\n1 stop\n3 hr 30 min SFO\n468 kg CO2e\n+25% emissions\nPEN 3,191\nround trip","hide",["SFO"]],
 ["IAH row","2:15 PM – 10:46 PM\nUnited · Air Canada\n9 hr 31 min\nMEX–YVR\n1 stop\n2 hr 14 min IAH\n391 kg CO2e\nAvg emissions\nPEN 3,450\nround trip","hide",["IAH"]],
 ["nonstop AC","7:00 AM – 11:45 AM\nAir Canada · Operated by Air Canada Rouge\n5 hr 45 min\nMEX–YVR\nNonstop\n395 kg CO2e\nPEN 6,941\nround trip","keep",[]],
 ["nonstop AM","1:25 AM – 6:05 AM\nAeromexico · WestJet\n5 hr 40 min\nMEX–YVR\nNonstop\n267 kg CO2e\n-29% emissions\nPEN 12,979\nround trip","keep",[]],
];
console.log('\nPEN page (the bug report):');
for (const [n, text, want, us] of pen) {
  t(n+' detected', m.detourLooksLikeResult(fake(text)));
  const j = m.detourJudgeRow(text, null);
  t(`${n} verdict=${j.verdict} us=[${j.usCodes||''}]`, j.verdict===want && JSON.stringify(j.usCodes)===JSON.stringify(us));
}

console.log('\nRegression — USD symbol prices still work:');
const usd = "5:15 PM – 10:45 AM\nAmerican\n18 hr 30 min\nYYZ–LIM\n1 stop\n11 hr 11 min DFW\n380 kg CO2e\n$1,914\nround trip";
t('detected', m.detourLooksLikeResult(fake(usd)));
t('hides via DFW', m.detourJudgeRow(usd,null).verdict==='hide');
const nonUs = "9:00 AM – 7:00 PM\nAir Canada\n12 hr\nYYZ–LIM\n1 stop\n2 hr 5 min YYC\n300 kg CO2e\n$1,500\nround trip";
t('keeps non-US layover YYC', m.detourJudgeRow(nonUs,null).verdict==='keep');

console.log('\nCurrency/airport collisions — must NOT hide:');
for (const c of ['HNL','PLN','BRL','CNY','DKK','CLP','TOP','MYR','SZL']) {
  const row = `9:00 AM – 7:00 PM\nAir Canada\n12 hr\nYYZ–LIM\n1 stop\n2 hr 5 min YYC\n300 kg CO2e\n${c} 1,500\nround trip`;
  t(`${c} price not read as layover`, m.detourLooksLikeResult(fake(row)) && m.detourJudgeRow(row,null).verdict==='keep');
}
console.log('\nStill hides when a real US layover shares the page with such a currency:');
const both = "9:00 AM – 7:00 PM\nUnited\n12 hr\nYYZ–LIM\n1 stop\n2 hr 5 min DFW\n300 kg CO2e\nHNL 1,500\nround trip";
t('HNL price + DFW layover -> hide via DFW only', JSON.stringify(m.detourJudgeRow(both,null).usCodes)===JSON.stringify(['DFW']));

/* ------------------------------------------------------------------ *
 * Only codes in layover POSITION count
 *
 * The old sweep took every all-caps triplet on the row. 1,271 US IATA codes
 * is a wide net, and it catches tokens that are plainly not airports. Two of
 * these are live hazards rather than hypotheticals:
 *   LOT — LOT Polish Airlines, and also Lottsburg, Virginia
 *   PDT — Pacific Daylight Time, and also Pendleton, Oregon
 * Under the old rule a Warsaw connection on LOT hid itself as a US layover,
 * and nothing on screen said why.
 * ------------------------------------------------------------------ */
console.log('\nStray caps tokens must not read as layovers:');
const strays = [
  ['LOT Polish via Warsaw', "10:00 AM – 8:00 AM+1\nLOT Polish Airlines\n16 hr\nYYZ–DEL\n1 stop\n3 hr 20 min WAW\n700 kg CO2e\n$1,100\nround trip"],
  ['PDT in a timestamp',    "9:00 AM PDT – 7:00 PM\nAir Canada\n12 hr\nYYZ–LIM\n1 stop\n2 hr 5 min YYC\n300 kg CO2e\n$1,500\nround trip"],
  ['SUN/DAY/NEW in prose',  "9:00 AM – 7:00 PM\nAir Canada · SUN DAY NEW\n12 hr\nYYZ–LIM\n1 stop\n2 hr 5 min YYC\n300 kg CO2e\n$1,500\nround trip"],
];
for (const [n, row] of strays) {
  const j = m.detourJudgeRow(row, null);
  t(`${n} -> ${j.verdict} (layovers ${JSON.stringify(j.layovers)})`, j.verdict === 'keep');
}
t('sanity: LOT and PDT really are in the US set',
  m.DETOUR_US_AIRPORTS.has('LOT') && m.DETOUR_US_AIRPORTS.has('PDT'));

console.log('\nLayover position — what counts:');
t('duration to the left, same line', m.detourLayoverCodesIn('1 stop\n2 hr 5 min ATL').has('ATL'));
t('"via" form', m.detourLayoverCodesIn('1 stop via ATL').has('ATL'));
t('"Layover in" form', m.detourLayoverCodesIn('Layover in ATL').has('ATL'));
t('duration on the PREVIOUS line does not reach across',
  !m.detourLayoverCodesIn('18 hr 30 min\nMEX–YVR').has('MEX'));
t('bare code with no context is not a layover', !m.detourLayoverCodesIn('Delta\nATL').has('ATL'));

/* ------------------------------------------------------------------ *
 * Reading one stop off a two-stop row proves nothing about the other
 * ------------------------------------------------------------------ */
console.log('\nMulti-stop completeness:');
const twoBothRead = "6:00 AM – 11:00 PM\nAir Canada\n20 hr\nYYZ–DEL\n2 stops\n2 hr YYC, 4 hr LHR\n900 kg CO2e\n$1,300\nround trip";
t('2 stops, both read, neither US -> keep', m.detourJudgeRow(twoBothRead,null).verdict==='keep');

const twoOneUS = "6:00 AM – 11:00 PM\nUnited\n20 hr\nYYZ–DEL\n2 stops\n2 hr ORD, 4 hr LHR\n900 kg CO2e\n$1,300\nround trip";
const jUS = m.detourJudgeRow(twoOneUS,null);
t('2 stops, one US -> hide via ORD', jUS.verdict==='hide' && jUS.usCodes.includes('ORD'));

const twoOneRead = "6:00 AM – 11:00 PM\nAir Canada\n20 hr\nYYZ–DEL\n2 stops\n2 hr YYC\n900 kg CO2e\n$1,300\nround trip";
const jPart = m.detourJudgeRow(twoOneRead,null);
t(`2 stops, only 1 read -> unknown, not keep (${jPart.reason})`, jPart.verdict==='unknown');

t('1 stop, none read -> unknown',
  m.detourJudgeRow("6:00 AM – 11:00 PM\nAir Canada\n20 hr\nYYZ–DEL\n1 stop\n900 kg CO2e\n$1,300\nround trip",null).verdict==='unknown');

console.log('\nStop counting:');
t('"Nonstop" -> 0', m.detourStopCount('Nonstop')===0);
t('"1 stop" -> 1', m.detourStopCount('1 stop')===1);
t('"2 stops" -> 2', m.detourStopCount('2 stops')===2);
t('unstated -> null', m.detourStopCount('Air Canada')===null);
t('numeric wins over a stray "Nonstop"', m.detourStopCount('Nonstop filter\n2 stops')===2);

console.log('\nUnknown must never hide:');
for (const [n, row] of [['no endpoints','1 stop\n2 hr 5 min YYC\n$500'], ['partial read', twoOneRead]]) {
  t(`${n} stays visible`, m.detourJudgeRow(row,null).verdict!=='hide');
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail?1:0);
