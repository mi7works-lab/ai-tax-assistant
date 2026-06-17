/**
 * 架電KPIダッシュボード ビルダー（Google Apps Script）
 * ------------------------------------------------------------------
 * 使い方：
 *  1. スプレッドシートで「拡張機能 > Apps Script」を開く
 *  2. このコードを全文貼り付けて保存
 *  3. シートに戻り、メニュー「架電ダッシュボード > 集計を更新／再構築」を実行
 *     （初回は権限の承認が必要です）
 *
 * 仕組み：
 *  - 生ログ（1法人=1行、1〜4回目の架電日/結果）を 架電担当者 × サービス種別 で集計
 *  - 集計結果を隠しシート「_集計データ」に1架電=1行で展開
 *  - 「ダッシュボード」は SUMIFS/COUNTIFS の数式で、種別ドロップダウンに連動して即再計算
 *  - 未達(NA)セルは条件付き書式で自動色分け
 * ================================================================== */

const CONFIG = {
  DASH_SHEET: 'ダッシュボード',
  CALC_SHEET: '_集計データ',     // 隠しシート（自動生成）
  GOAL_SHEET: '目標',
  RAW_SHEET: '',                 // 空なら「架電担当者」列を含むシートを自動検出
  AGENT_HEADER: '架電担当者',
  TYPE_HEADER: 'サービス種別',    // 部分一致（「サービス種別一覧」にヒット）

  // ▼ 自社の「架電結果」の選択肢に合わせて調整してください（部分一致でカウント）
  CONTACT_KEYWORDS: ['担当接触', '担当者接触', 'アポ'], // 担当接触としてカウントする結果
  APPT_KEYWORDS: ['アポ'],                              // アポとしてカウントする結果

  CONTACT_RATE_BENCH: 0.2,       // 担当接触率の基準（これ未満を黄色で警告）
};

// 目標シートの初期値（メンバー, 稼働数, 月間架電目標, 目標アポ率）
const GOAL_SEED = [
  ['賢也', 80, 1360, 0.01],
  ['塩崎', 40, 680, 0.007],
  ['義家', 40, 680, 0.007],
  ['よしき', 40, 680, 0.007],
];

/** メニュー登録 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('架電ダッシュボード')
    .addItem('① 集計を更新 / 再構築', 'buildDashboard')
    .addSeparator()
    .addItem('目標シートを初期化', 'resetGoalSheet')
    .addToUi();
}

/** メイン処理 */
function buildDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { calls, agents, types } = collectCalls_(ss);
  writeCalcSheet_(ss, calls);
  ensureGoalSheet_(ss);
  layoutDashboard_(ss, agents, types);
  SpreadsheetApp.getUi().alert('集計を更新しました（' + agents.length + '名 / 架電 ' + (calls.length - 1) + '件）。');
}

/** 生ログを 1架電=1行 に展開して集計用の配列を作る */
function collectCalls_(ss) {
  const raw = findRawSheet_(ss);
  const values = raw.getDataRange().getValues();

  // ヘッダー行を探す（先頭10行以内で「架電担当者」を含む行）
  let hr = -1;
  for (let i = 0; i < Math.min(values.length, 10); i++) {
    if (values[i].some(c => String(c).trim() === CONFIG.AGENT_HEADER)) { hr = i; break; }
  }
  if (hr < 0) throw new Error('「' + CONFIG.AGENT_HEADER + '」列が見つかりません。RAWシートを確認してください。');

  const headers = values[hr].map(c => String(c).trim());
  const agentCol = headers.indexOf(CONFIG.AGENT_HEADER);
  const typeCol = headers.findIndex(h => h.indexOf(CONFIG.TYPE_HEADER) >= 0);

  // 「○回目架電日」列を検出。結果はその右隣（日→結果→詳細 の並び前提）
  const dateCols = [];
  headers.forEach((h, idx) => { if (/回目架電日/.test(h)) dateCols.push(idx); });
  if (dateCols.length === 0) throw new Error('「○回目架電日」列が見つかりません。');

  const out = [['担当者', '種別', '結果', '接触', 'アポ']];
  const agentSet = [];
  const typeSet = [];

  for (let r = hr + 1; r < values.length; r++) {
    const row = values[r];
    const agent = String(row[agentCol] || '').trim();
    if (!agent) continue;
    const type = (typeCol >= 0 ? String(row[typeCol] || '').trim() : '') || '(未設定)';

    dateCols.forEach(dc => {
      const date = row[dc];
      const result = String(row[dc + 1] || '').trim();
      const hasCall = (date !== '' && date != null) || result !== '';
      if (!hasCall) return;
      const contact = CONFIG.CONTACT_KEYWORDS.some(k => k && result.indexOf(k) >= 0) ? 1 : 0;
      const appt = CONFIG.APPT_KEYWORDS.some(k => k && result.indexOf(k) >= 0) ? 1 : 0;
      out.push([agent, type, result, contact, appt]);
      if (agentSet.indexOf(agent) < 0) agentSet.push(agent);
      if (typeSet.indexOf(type) < 0) typeSet.push(type);
    });
  }
  return { calls: out, agents: agentSet, types: typeSet };
}

/** RAW（生ログ）シートを特定 */
function findRawSheet_(ss) {
  if (CONFIG.RAW_SHEET) {
    const s = ss.getSheetByName(CONFIG.RAW_SHEET);
    if (s) return s;
  }
  const sheets = ss.getSheets();
  for (const s of sheets) {
    if ([CONFIG.DASH_SHEET, CONFIG.CALC_SHEET, CONFIG.GOAL_SHEET].indexOf(s.getName()) >= 0) continue;
    const lastCol = s.getLastColumn();
    if (lastCol === 0) continue;
    const head = s.getRange(1, 1, Math.min(10, s.getLastRow() || 1), lastCol).getValues();
    if (head.some(rowArr => rowArr.some(c => String(c).trim() === CONFIG.AGENT_HEADER))) return s;
  }
  throw new Error('生ログのシートが見つかりません。CONFIG.RAW_SHEET にシート名を指定してください。');
}

/** 隠しシートに展開済みデータを書き出す */
function writeCalcSheet_(ss, calls) {
  let calc = ss.getSheetByName(CONFIG.CALC_SHEET);
  if (!calc) calc = ss.insertSheet(CONFIG.CALC_SHEET);
  calc.clearContents();
  calc.getRange(1, 1, calls.length, 5).setValues(calls);
  // 種別フィルタの判定用セル：全体なら "*"（=任意の種別にマッチ）
  calc.getRange('G1').setFormula(
    "=IF('" + CONFIG.DASH_SHEET + "'!$C$3=\"全体\",\"*\",'" + CONFIG.DASH_SHEET + "'!$C$3)"
  );
  calc.hideSheet();
}

/** 目標シートを用意（無ければ初期値で作成） */
function ensureGoalSheet_(ss) {
  let g = ss.getSheetByName(CONFIG.GOAL_SHEET);
  if (g) return g;
  g = ss.insertSheet(CONFIG.GOAL_SHEET);
  g.getRange(1, 1, 1, 4).setValues([['メンバー', '稼働数', '月間架電目標', '目標アポ率']])
    .setFontWeight('bold').setBackground('#f1f5f9');
  g.getRange(2, 1, GOAL_SEED.length, 4).setValues(GOAL_SEED);
  g.getRange(2, 4, GOAL_SEED.length, 1).setNumberFormat('0.0%');
  g.setColumnWidths(1, 4, 120);
  return g;
}

function resetGoalSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName(CONFIG.GOAL_SHEET);
  if (old) ss.deleteSheet(old);
  ensureGoalSheet_(ss);
  SpreadsheetApp.getUi().alert('目標シートを初期化しました。');
}

/** ダッシュボードのレイアウト・数式・書式を構築 */
function layoutDashboard_(ss, agents, types) {
  const CN = "'" + CONFIG.CALC_SHEET + "'";
  const GN = "'" + CONFIG.GOAL_SHEET + "'";
  const crit = CN + "!$G$1";
  const bench = CONFIG.CONTACT_RATE_BENCH;

  let dash = ss.getSheetByName(CONFIG.DASH_SHEET);
  if (!dash) dash = ss.insertSheet(CONFIG.DASH_SHEET);
  const prevType = dash.getRange('C3').getValue();
  dash.clear();
  dash.clearConditionalFormatRules();
  dash.getRange(1, 1, dash.getMaxRows(), 11).setDataValidation(null);

  // ---- タイトル ----
  dash.getRange('A1:K1').merge().setValue('架電KPIダッシュボード')
    .setFontSize(20).setFontWeight('bold').setVerticalAlignment('middle');
  dash.setRowHeight(1, 42);
  dash.getRange('A2').setValue('対象：月間集計 ／ 生ログを 架電担当者 × サービス種別 で自動集計')
    .setFontColor('#64748b');

  // ---- 種別ドロップダウン ----
  dash.getRange('A3').setValue('種別フィルタ').setFontWeight('bold');
  const dvList = ['全体'].concat(types);
  const dv = SpreadsheetApp.newDataValidation().requireValueInList(dvList, true).setAllowInvalid(false).build();
  dash.getRange('C3').setDataValidation(dv)
    .setValue(dvList.indexOf(prevType) >= 0 ? prevType : '全体')
    .setBackground('#eef2ff').setFontWeight('bold');

  // ---- 表 ----
  const HR = 8;                 // ヘッダー行
  const first = HR + 1;         // 最初のメンバー行
  const n = agents.length;
  const last = HR + n;          // 最後のメンバー行
  const rt = last + 1;          // 合計行

  const header = ['メンバー', '架電件数', '担当接触数', '担当接触率', 'アポ数',
    '接触→アポ率', 'アポ率', '月間架電目標', '目標進捗', '目標アポ率', '判定'];
  dash.getRange(HR, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#f1f5f9').setFontColor('#475569');

  // メンバー行の数式
  for (let i = 0; i < n; i++) {
    const r = first + i;
    dash.getRange(r, 1).setValue(agents[i]);
    dash.getRange(r, 2).setFormula(`=COUNTIFS(${CN}!$A:$A,$A${r},${CN}!$B:$B,${crit})`);
    dash.getRange(r, 3).setFormula(`=SUMIFS(${CN}!$D:$D,${CN}!$A:$A,$A${r},${CN}!$B:$B,${crit})`);
    dash.getRange(r, 4).setFormula(`=IF($B${r}=0,0,$C${r}/$B${r})`);
    dash.getRange(r, 5).setFormula(`=SUMIFS(${CN}!$E:$E,${CN}!$A:$A,$A${r},${CN}!$B:$B,${crit})`);
    dash.getRange(r, 6).setFormula(`=IF($C${r}=0,0,$E${r}/$C${r})`);
    dash.getRange(r, 7).setFormula(`=IF($B${r}=0,0,$E${r}/$B${r})`);
    dash.getRange(r, 8).setFormula(`=IFERROR(VLOOKUP($A${r},${GN}!$A:$D,3,FALSE),"")`);
    dash.getRange(r, 9).setFormula(`=IF($H${r}="","",$B${r}/$H${r})`);
    dash.getRange(r, 10).setFormula(`=IFERROR(VLOOKUP($A${r},${GN}!$A:$D,4,FALSE),0)`);
    dash.getRange(r, 11).setFormula(
      `=IF($E${r}=0,"未達",IF(AND($G${r}>=$J${r},$D${r}>=${bench}),"達成","要注意"))`
    );
  }

  // 合計 / 平均 行
  dash.getRange(rt, 1).setValue('合計 / 平均').setFontWeight('bold');
  dash.getRange(rt, 2).setFormula(`=SUM(B${first}:B${last})`);
  dash.getRange(rt, 3).setFormula(`=SUM(C${first}:C${last})`);
  dash.getRange(rt, 4).setFormula(`=IF($B${rt}=0,0,$C${rt}/$B${rt})`);
  dash.getRange(rt, 5).setFormula(`=SUM(E${first}:E${last})`);
  dash.getRange(rt, 6).setFormula(`=IF($C${rt}=0,0,$E${rt}/$C${rt})`);
  dash.getRange(rt, 7).setFormula(`=IF($B${rt}=0,0,$E${rt}/$B${rt})`);
  dash.getRange(rt, 8).setFormula(`=SUM(H${first}:H${last})`);
  dash.getRange(rt, 9).setFormula(`=IF($H${rt}=0,"",$B${rt}/$H${rt})`);
  dash.getRange(rt, 10).setFormula(`=IFERROR(SUMPRODUCT(H${first}:H${last},J${first}:J${last})/$H${rt},0)`);
  dash.getRange(rt, 11).setFormula(`=COUNTIF(K${first}:K${last},"達成")&" / ${n}名 達成"`);
  dash.getRange(rt, 1, 1, 11).setBackground('#f8fafc').setFontWeight('bold')
    .setBorder(true, false, false, false, false, false, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // ---- KPI（合計行を参照） ----
  const kpis = [['総架電数', `=B${rt}`, '#'], ['担当接触率', `=D${rt}`, '%1'],
    ['総アポ数', `=E${rt}`, '#'], ['平均アポ率', `=G${rt}`, '%2']];
  kpis.forEach((k, i) => {
    const c = 1 + i * 3;
    dash.getRange(5, c).setValue(k[0]).setFontColor('#64748b').setFontWeight('bold');
    const v = dash.getRange(6, c).setFormula(k[1]).setFontSize(18).setFontWeight('bold');
    if (k[2] === '#') v.setNumberFormat('#,##0');
    if (k[2] === '%1') v.setNumberFormat('0.0%');
    if (k[2] === '%2') v.setNumberFormat('0.00%');
  });

  // ---- 数値書式 ----
  dash.getRange(first, 2, n + 1, 1).setNumberFormat('#,##0'); // 架電件数
  dash.getRange(first, 3, n + 1, 1).setNumberFormat('#,##0'); // 担当接触数
  dash.getRange(first, 5, n + 1, 1).setNumberFormat('#,##0'); // アポ数
  dash.getRange(first, 8, n + 1, 1).setNumberFormat('#,##0'); // 月間架電目標
  dash.getRange(first, 4, n + 1, 1).setNumberFormat('0.0%');  // 担当接触率
  dash.getRange(first, 6, n + 1, 1).setNumberFormat('0.0%');  // 接触→アポ率
  dash.getRange(first, 7, n + 1, 1).setNumberFormat('0.00%'); // アポ率
  dash.getRange(first, 9, n + 1, 1).setNumberFormat('0.0%');  // 目標進捗
  dash.getRange(first, 10, n + 1, 1).setNumberFormat('0.0%'); // 目標アポ率

  // ---- 条件付き書式（未達=NA を色分け） ----
  const rules = [];
  const apptRange = dash.getRange(first, 5, n, 1);   // アポ数=0
  const apptRateRange = dash.getRange(first, 7, n, 1); // アポ率<目標
  const contactRange = dash.getRange(first, 4, n, 1);  // 接触率<基準
  const judgeRange = dash.getRange(first, 11, n, 1);

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$E${first}=0`)
    .setBackground('#fff1f2').setFontColor('#e11d48').setRanges([apptRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$G${first}<$J${first}`)
    .setBackground('#fff1f2').setFontColor('#e11d48').setRanges([apptRateRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$D${first}<${bench}`)
    .setBackground('#fffbeb').setFontColor('#b45309').setRanges([contactRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('未達')
    .setBackground('#fff1f2').setFontColor('#be123c').setBold(true).setRanges([judgeRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('達成')
    .setBackground('#ecfdf5').setFontColor('#047857').setBold(true).setRanges([judgeRange]).build());
  dash.setConditionalFormatRules(rules);

  // ---- 体裁 ----
  dash.setColumnWidth(1, 110);
  dash.setColumnWidths(2, 10, 92);
  dash.setFrozenRows(HR);
  dash.getRange(HR, 1, n + 2, 11)
    .setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
  dash.setHiddenGridlines(true);
  ss.setActiveSheet(dash);
}
