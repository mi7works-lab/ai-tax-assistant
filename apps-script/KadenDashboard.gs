/**
 * 架電KPIダッシュボード ビルダー（Google Apps Script）
 * ------------------------------------------------------------------
 * 使い方：
 *  1. スプレッドシートで「拡張機能 > Apps Script」を開く
 *  2. このコードを全文貼り付けて保存
 *  3. シートに戻り、メニュー「架電ダッシュボード > ① 集計を更新 / 再構築」を実行
 *     （初回は権限の承認が必要です）
 *
 * 仕組み：
 *  - 生ログ（1法人=1行、1〜4回目の架電日/結果）を 1架電=1行 に展開（隠しシート「_集計データ」）
 *  - 架電担当者 × サービス種別 × 架電日 で集計
 *  - 「ダッシュボード」は SUMIFS/COUNTIFS の数式。種別・期間の各プルダウンに連動して即再計算
 *  - 未達(NA)セルは条件付き書式で自動色分け
 *
 * 期間モード：
 *  - 月間   … 対象月（データの最新月）全体
 *  - 週次   … 「1日始まり・月〜日区切り・月末締め」で自動生成した週をプルダウン選択
 *  - 任意期間 … 開始日・終了日を直接入力
 * ================================================================== */

const CONFIG = {
  DASH_SHEET: 'ダッシュボード',
  CALC_SHEET: '_集計データ',     // 隠しシート（自動生成）
  GOAL_SHEET: '目標',
  TREND_SHEET: '達成ペース',
  // 種別ごとの生ログタブ。名前にこの語を含むシートを対象にし、
  // タブ名の（ ）内を「種別」として扱う（例：「リスト（介護）」→ 種別「介護」）
  RAW_SHEET_KEYWORD: 'リスト',
  AGENT_HEADER: '架電担当者',

  // 架電結果の分類（部分一致でカウント）
  //  選択肢例: 1_不通 / 2_現アナ / 3〜6_受付対応：… / 7〜10_担当接触：…（10=アポ）
  CONTACT_KEYWORDS: ['担当接触'], // 7〜10「担当接触：…」を担当接触としてカウント
  APPT_KEYWORDS: ['アポ'],        // 10「担当接触：アポ」をアポとしてカウント

  CONTACT_RATE_BENCH: 0.2,       // 担当接触率の基準（これ未満を黄色で警告）

  // ▼ おすすめの打ち手（Next Action）判定の基準。自社水準に合わせて調整可
  //   ※接触率は外的要因（リスト品質・時間帯）のため打ち手対象から除外
  PASS_RATE_BENCH: 0.3,          // 受付突破率：これ未満なら「受付トーク改善」
  CONTACT_TO_APPT_BENCH: 0.05,   // 接触→アポ率：これ未満なら「担当トーク改善」
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
  const { calls, agents, types, maxDate } = collectCalls_(ss);
  const months = collectMonths_(calls, maxDate);
  writeCalcSheet_(ss, calls, months);
  const goal = ensureGoalSheet_(ss);
  ensureRulesTable_(goal);
  // 旧：別シート版の達成ペースがあれば撤去（ダッシュボードに統合したため）
  const oldTrend = ss.getSheetByName(CONFIG.TREND_SHEET);
  if (oldTrend) ss.deleteSheet(oldTrend);
  layoutDashboard_(ss, agents, types, months);
  SpreadsheetApp.getUi().alert(
    '集計を更新しました。\n' +
    'メンバー: ' + agents.length + '名 ／ 架電: ' + (calls.length - 1) + '件\n' +
    '対象月: ' + months.map(m => m.label).join('、 ')
  );
}

/** データに含まれる月を抽出し、各月の週区分を生成（昇順） */
function collectMonths_(calls, maxDate) {
  const seen = {};
  const list = [];
  for (let i = 1; i < calls.length; i++) {
    const d = calls[i][2];
    if (!(d instanceof Date)) continue;
    const key = d.getFullYear() + '-' + d.getMonth();
    if (seen[key]) continue;
    seen[key] = true;
    const wk = generateWeeks_(d);
    list.push({
      label: d.getFullYear() + '年' + (d.getMonth() + 1) + '月', // 日付化け防止のため「年/月」表記
      monthStart: wk.monthStart,
      monthEnd: wk.monthEnd,
      weeks: wk.weeks,
      sort: d.getFullYear() * 12 + d.getMonth(),
    });
  }
  if (list.length === 0) {
    const d = maxDate || new Date();
    const wk = generateWeeks_(d);
    list.push({
      label: d.getFullYear() + '年' + (d.getMonth() + 1) + '月',
      monthStart: wk.monthStart, monthEnd: wk.monthEnd, weeks: wk.weeks,
      sort: d.getFullYear() * 12 + d.getMonth(),
    });
  }
  list.sort((a, b) => a.sort - b.sort);
  return list;
}

/** 種別ごとの生ログタブを全て走査し、1架電=1行 に展開して集計用配列を作る */
function collectCalls_(ss) {
  const sheets = findRawSheets_(ss);
  if (sheets.length === 0) {
    throw new Error('「' + CONFIG.RAW_SHEET_KEYWORD + '」を名前に含むシート（例：リスト（介護））が見つかりません。');
  }

  const out = [['担当者', '種別', '架電日', '結果', '接触', 'アポ', '通電']];
  const agentSet = [];
  const typeSet = [];
  let maxDate = null;

  sheets.forEach(sh => {
    const type = typeFromTab_(sh.getName()); // タブ名の（ ）内 → 種別
    const values = sh.getDataRange().getValues();

    // ヘッダー行（先頭10行以内で「架電担当者」を含む行）
    let hr = -1;
    for (let i = 0; i < Math.min(values.length, 10); i++) {
      if (values[i].some(c => String(c).trim() === CONFIG.AGENT_HEADER)) { hr = i; break; }
    }
    if (hr < 0) return; // 架電担当者列が無いシートはスキップ

    const headers = values[hr].map(c => String(c).trim());
    const agentCol = headers.indexOf(CONFIG.AGENT_HEADER);
    const dateCols = [];
    headers.forEach((h, idx) => { if (/回目架電日/.test(h)) dateCols.push(idx); });
    if (dateCols.length === 0) return;

    if (typeSet.indexOf(type) < 0) typeSet.push(type);

    for (let r = hr + 1; r < values.length; r++) {
      const row = values[r];
      const agent = String(row[agentCol] || '').trim();
      if (!agent) continue;
      dateCols.forEach(dc => {
        const date = toDate_(row[dc]);
        if (!date) return; // 架電日が無い行は集計対象外（日付ベース集計のため）
        const result = String(row[dc + 1] || '').trim();
        const contact = CONFIG.CONTACT_KEYWORDS.some(k => k && result.indexOf(k) >= 0) ? 1 : 0;
        const appt = CONFIG.APPT_KEYWORDS.some(k => k && result.indexOf(k) >= 0) ? 1 : 0;
        // 通電（コンタクト）= 受付対応 または 担当接触（不通・現アナ以外）
        const connect = /受付対応|担当接触/.test(result) ? 1 : 0;
        out.push([agent, type, date, result, contact, appt, connect]);
        if (agentSet.indexOf(agent) < 0) agentSet.push(agent);
        if (!maxDate || date > maxDate) maxDate = date;
      });
    }
  });
  return { calls: out, agents: agentSet, types: typeSet, maxDate: maxDate };
}

/** 値を Date に変換（Date / 文字列日付 のみ。空や不正は null） */
function toDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const d = new Date(v.trim());
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * 月の週区分を生成（ルール：1日始まり・月〜日区切り・月末締め）
 * 例) 2026/6 → 6/1〜6/7, 6/8〜6/14, 6/15〜6/21, 6/22〜6/28, 6/29〜6/30
 */
function generateWeeks_(anyDateInMonth) {
  const y = anyDateInMonth.getFullYear();
  const m = anyDateInMonth.getMonth();
  // 正午基準にしてタイムゾーンによる日付ズレ（月初が前日になる等）を防ぐ
  const monthStart = new Date(y, m, 1, 12);
  const monthEnd = new Date(y, m + 1, 0, 12);
  const weeks = [];
  let ws = new Date(monthStart);
  let n = 1;
  while (ws <= monthEnd) {
    const dow = ws.getDay();              // 0=日, 1=月, … 6=土
    const toSunday = (7 - dow) % 7;       // 直近（以降）の日曜まで
    let we = new Date(ws);
    we.setDate(we.getDate() + toSunday);
    if (we > monthEnd) we = new Date(monthEnd);
    const label = '第' + n + '週 (' +
      (ws.getMonth() + 1) + '/' + ws.getDate() + '〜' +
      (we.getMonth() + 1) + '/' + we.getDate() + ')';
    weeks.push([label, new Date(ws), new Date(we)]);
    ws = new Date(we);
    ws.setDate(ws.getDate() + 1);
    n++;
  }
  return { monthStart: monthStart, monthEnd: monthEnd, weeks: weeks };
}

/** 種別ごとの生ログタブ（名前に RAW_SHEET_KEYWORD を含む）を列挙 */
function findRawSheets_(ss) {
  const exclude = [CONFIG.DASH_SHEET, CONFIG.CALC_SHEET, CONFIG.GOAL_SHEET, CONFIG.TREND_SHEET];
  return ss.getSheets().filter(s =>
    exclude.indexOf(s.getName()) < 0 &&
    s.getName().indexOf(CONFIG.RAW_SHEET_KEYWORD) >= 0
  );
}

/** タブ名から種別を抽出（「リスト（介護）」→「介護」。括弧が無ければタブ名そのまま） */
function typeFromTab_(name) {
  const m = name.match(/[（(]\s*([^）)]+?)\s*[）)]/);
  return m ? m[1].trim() : name.trim();
}

/** 隠しシートに展開済みデータ・ヘルパー・月/週テーブルを書き出す
 *  コントロール: C3=種別 C4=対象月 C5=期間モード C6=週 C7/E7=任意期間 */
function writeCalcSheet_(ss, calls, months) {
  const DN = "'" + CONFIG.DASH_SHEET + "'";
  let calc = ss.getSheetByName(CONFIG.CALC_SHEET);
  if (!calc) calc = ss.insertSheet(CONFIG.CALC_SHEET);
  calc.clear();

  // A:G = 1架電=1行（担当者, 種別, 架電日, 結果, 接触, アポ, 通電）
  calc.getRange(1, 1, calls.length, 7).setValues(calls);
  calc.getRange(2, 3, Math.max(calls.length - 1, 1), 1).setNumberFormat('yyyy/mm/dd');

  // J:L = 週テーブル（キー="対象月|第N週", 開始, 終了）
  const weekRows = [];
  months.forEach(mo => {
    mo.weeks.forEach((w, i) => {
      weekRows.push([mo.label + '|第' + (i + 1) + '週', w[1], w[2]]);
    });
  });
  if (weekRows.length) {
    calc.getRange(1, 10, weekRows.length, 1).setNumberFormat('@'); // キーは文字列で保持
    calc.getRange(1, 10, weekRows.length, 3).setValues(weekRows);
    calc.getRange(1, 11, weekRows.length, 2).setNumberFormat('yyyy/mm/dd');
  }

  // N:P = 月テーブル（対象月ラベル, 月初, 月末）
  const monthRows = months.map(mo => [mo.label, mo.monthStart, mo.monthEnd]);
  calc.getRange(1, 14, monthRows.length, 1).setNumberFormat('@'); // ラベルは文字列で保持
  calc.getRange(1, 14, monthRows.length, 3).setValues(monthRows);
  calc.getRange(1, 15, monthRows.length, 2).setNumberFormat('yyyy/mm/dd');

  // H列 = ヘルパー
  calc.getRange('H1').setFormula('=IFERROR(VLOOKUP(' + DN + '!$C$4,$N:$P,2,FALSE),$O$1)').setNumberFormat('yyyy/mm/dd'); // 対象月の月初
  calc.getRange('H2').setFormula('=IFERROR(VLOOKUP(' + DN + '!$C$4,$N:$P,3,FALSE),$P$1)').setNumberFormat('yyyy/mm/dd'); // 対象月の月末
  calc.getRange('H3').setFormula('=IF(' + DN + '!$C$3="全体","*",' + DN + '!$C$3)'); // 種別判定
  calc.getRange('H4').setFormula('=' + DN + '!$C$5');                                 // 期間モード
  calc.getRange('H5').setFormula(                                                     // 実効・開始日
    '=IF($H$4="月間",$H$1,IF($H$4="週次",IFERROR(VLOOKUP(' + DN + '!$C$4&"|"&' + DN + '!$C$6,$J:$L,2,FALSE),$H$1),' + DN + '!$C$7))'
  ).setNumberFormat('yyyy/mm/dd');
  calc.getRange('H6').setFormula(                                                     // 実効・終了日
    '=IF($H$4="月間",$H$2,IF($H$4="週次",IFERROR(VLOOKUP(' + DN + '!$C$4&"|"&' + DN + '!$C$6,$J:$L,3,FALSE),$H$2),' + DN + '!$E$7))'
  ).setNumberFormat('yyyy/mm/dd');

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

/** おすすめ打ち手のルール表を目標シート(F:I列)に用意。
 *  既に存在する場合は上書きしない（ユーザーの編集を保持） */
function ensureRulesTable_(g) {
  if (g.getRange('F1').getValue() !== '') return;
  g.getRange('F1').setValue('おすすめ打ち手ルール（編集可：閾値と打ち手の文言を変更できます）')
    .setFontWeight('bold');
  g.getRange('F2:I2').setValues([['優先', '条件', '閾値', '打ち手']])
    .setFontWeight('bold').setBackground('#f1f5f9');
  const rows = [
    [1, 'アポ率達成＆担当接触率OK', '', '✅ 好調キープ'],
    [2, '受付突破率がこの値未満', CONFIG.PASS_RATE_BENCH, '受付突破↑（受付トーク改善）'],
    [3, '接触→アポ率がこの値未満', CONFIG.CONTACT_TO_APPT_BENCH, '担当トーク↑（接触後の提案改善）'],
    [4, '上記すべてOK（歩留り良好）', '', '歩留り良好→架電量↑'],
    ['-', '架電なし（架電件数0）', '', '架電なし'],
  ];
  g.getRange(3, 6, rows.length, 4).setValues(rows);
  g.getRange('H4:H5').setNumberFormat('0%');
  g.setColumnWidth(7, 210);
  g.setColumnWidth(9, 260);
}

function resetGoalSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName(CONFIG.GOAL_SHEET);
  if (old) ss.deleteSheet(old);
  const g = ensureGoalSheet_(ss);
  ensureRulesTable_(g);
  SpreadsheetApp.getUi().alert('目標シートを初期化しました。');
}

/** ダッシュボードのレイアウト・数式・書式を構築 */
function layoutDashboard_(ss, agents, types, months) {
  const CN = "'" + CONFIG.CALC_SHEET + "'";
  const GN = "'" + CONFIG.GOAL_SHEET + "'";
  const bench = CONFIG.CONTACT_RATE_BENCH;

  // 集計範囲・判定セル（_集計データの列）
  const A = CN + '!$A:$A', B = CN + '!$B:$B', Cc = CN + '!$C:$C',
    Ec = CN + '!$E:$E', Fc = CN + '!$F:$F', Gc = CN + '!$G:$G';
  const tc = CN + '!$H$3', sd = CN + '!$H$5', ed = CN + '!$H$6';
  const dateCrit = ',' + Cc + ',">="&' + sd + ',' + Cc + ',"<="&' + ed;

  let dash = ss.getSheetByName(CONFIG.DASH_SHEET);
  if (!dash) dash = ss.insertSheet(CONFIG.DASH_SHEET);
  const prev = {
    type: dash.getRange('C3').getValue(),
    month: dash.getRange('C4').getValue(),
    mode: dash.getRange('C5').getValue(),
    week: dash.getRange('C6').getValue(),
  };
  dash.clear();
  dash.clearConditionalFormatRules();
  dash.getCharts().forEach(c => dash.removeChart(c)); // clearではチャートは消えないため
  dash.getRange(1, 1, dash.getMaxRows(), 15).setDataValidation(null);

  // ---- タイトル / 対象期間表示 ----
  dash.getRange('A1:O1').merge().setValue('架電KPIダッシュボード')
    .setFontSize(20).setFontWeight('bold').setVerticalAlignment('middle');
  dash.setRowHeight(1, 42);

  // ---- コントロール（種別 / 対象月 / 期間モード / 週 / 任意期間） ----
  const monthLabels = months.map(m => m.label);
  const maxWeeks = months.reduce((mx, m) => Math.max(mx, m.weeks.length), 0);
  const weekLabels = [];
  for (let i = 1; i <= maxWeeks; i++) weekLabels.push('第' + i + '週');
  const latestMonth = monthLabels[monthLabels.length - 1] || '';

  dash.getRange('A3').setValue('種別フィルタ').setFontWeight('bold');
  const typeList = ['全体'].concat(types);
  dash.getRange('C3')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(typeList, true).setAllowInvalid(false).build())
    .setValue(typeList.indexOf(prev.type) >= 0 ? prev.type : '全体')
    .setBackground('#eef2ff').setFontWeight('bold');

  dash.getRange('A4').setValue('対象月').setFontWeight('bold');
  dash.getRange('C4').setNumberFormat('@') // 文字列固定（日付化け防止）
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(monthLabels, true).setAllowInvalid(false).build())
    .setValue(monthLabels.indexOf(prev.month) >= 0 ? prev.month : latestMonth)
    .setBackground('#eef2ff').setFontWeight('bold');

  dash.getRange('A5').setValue('期間モード').setFontWeight('bold');
  const modeList = ['月間', '週次', '任意期間'];
  dash.getRange('C5')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(modeList, true).setAllowInvalid(false).build())
    .setValue(modeList.indexOf(prev.mode) >= 0 ? prev.mode : '月間')
    .setBackground('#eef2ff').setFontWeight('bold');

  dash.getRange('A6').setValue('週を選択（週次のとき）').setFontColor('#64748b');
  dash.getRange('C6')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(weekLabels, true).setAllowInvalid(true).build())
    .setValue(weekLabels.indexOf(prev.week) >= 0 ? prev.week : (weekLabels[0] || ''));

  dash.getRange('A7').setValue('任意期間（任意期間のとき）').setFontColor('#64748b');
  const latest = months[months.length - 1];
  dash.getRange('C7').setValue(latest.monthStart).setNumberFormat('yyyy/mm/dd');
  dash.getRange('D7').setValue('〜').setHorizontalAlignment('center');
  dash.getRange('E7').setValue(latest.monthEnd).setNumberFormat('yyyy/mm/dd');

  // ---- 表 ----
  const HR = 11;                // ヘッダー行
  const first = HR + 1;
  const n = agents.length;
  const last = HR + n;
  const rt = last + 1;          // 合計行

  const header = ['メンバー', '架電件数', '接触数', '接触率', '担当接触数',
    '受付突破率', 'アポ数', '接触→アポ率', 'アポ率', '月間架電目標', '目標進捗',
    '目標アポ率', '判定', '進捗バー', 'おすすめの打ち手'];
  dash.getRange(HR, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#f1f5f9').setFontColor('#475569');

  // 各項目の説明（ヘッダーにマウスを乗せると表示されるコメント）
  const notes = [
    '架電担当者',
    '架電日が入っている架電の総数（1〜4回目を各回1件としてカウント）',
    '誰かと話せた架電数 ＝ 受付対応(3〜6) ＋ 担当接触(7〜10)。不通(1)・現アナ(2)は含まない',
    '接触数 ÷ 架電件数。電話がつながって人が出た割合（リストの番号品質・架電時間帯の指標）',
    '担当者本人と話せた架電数。架電結果が「担当接触：…」(7〜10)',
    '担当接触数 ÷ 接触数。受付を突破して担当者まで到達できた割合（受付トークの実力）',
    'アポ獲得数。架電結果が「担当接触：アポ」(10)',
    'アポ数 ÷ 担当接触数。担当者と話せたうちアポになった割合（担当クロージング力）',
    'アポ数 ÷ 架電件数。全架電に対するアポ獲得率',
    '目標シートの「月間架電目標」',
    '架電件数 ÷ 月間架電目標',
    '目標シートの「目標アポ率」',
    'アポ率が目標以上かつ担当接触率20%以上で「達成」／アポ0で「未達」／その他「要注意」',
    '架電件数 ÷ 月間架電目標 のバー表示',
    'ファネルの最弱点に応じた次の一手（効く順に1つ提示）',
  ];
  notes.forEach((note, i) => dash.getRange(HR, i + 1).setNote(note));

  for (let i = 0; i < n; i++) {
    const r = first + i;
    // 列: B架電 C接触数 D接触率 E担当接触数 F受付突破率 G アポ数 H接触→アポ率
    //     I アポ率 J月間架電目標 K目標進捗 L目標アポ率 M判定 N進捗バー O打ち手
    dash.getRange(r, 1).setValue(agents[i]);
    dash.getRange(r, 2).setFormula('=COUNTIFS(' + A + ',$A' + r + ',' + B + ',' + tc + dateCrit + ')');
    dash.getRange(r, 3).setFormula('=SUMIFS(' + Gc + ',' + A + ',$A' + r + ',' + B + ',' + tc + dateCrit + ')');
    dash.getRange(r, 4).setFormula('=IF($B' + r + '=0,0,$C' + r + '/$B' + r + ')');
    dash.getRange(r, 5).setFormula('=SUMIFS(' + Ec + ',' + A + ',$A' + r + ',' + B + ',' + tc + dateCrit + ')');
    dash.getRange(r, 6).setFormula('=IF($C' + r + '=0,0,$E' + r + '/$C' + r + ')');
    dash.getRange(r, 7).setFormula('=SUMIFS(' + Fc + ',' + A + ',$A' + r + ',' + B + ',' + tc + dateCrit + ')');
    dash.getRange(r, 8).setFormula('=IF($E' + r + '=0,0,$G' + r + '/$E' + r + ')');
    dash.getRange(r, 9).setFormula('=IF($B' + r + '=0,0,$G' + r + '/$B' + r + ')');
    dash.getRange(r, 10).setFormula('=IFERROR(VLOOKUP($A' + r + ',' + GN + '!$A:$D,3,FALSE),"")');
    dash.getRange(r, 11).setFormula('=IF($J' + r + '="","",$B' + r + '/$J' + r + ')');
    dash.getRange(r, 12).setFormula('=IFERROR(VLOOKUP($A' + r + ',' + GN + '!$A:$D,4,FALSE),0)');
    dash.getRange(r, 13).setFormula(
      '=IF($G' + r + '=0,"未達",IF(AND($I' + r + '>=$L' + r + ',IF($B' + r + '=0,0,$E' + r + '/$B' + r + ')>=' + bench + '),"達成","要注意"))'
    );
    dash.getRange(r, 14).setFormula(
      '=IF($J' + r + '="","",SPARKLINE($B' + r + ',{"charttype","bar";"max",$J' + r + ';"color1","#6366f1";"empty","zero"}))'
    );
    // おすすめの打ち手（ファネルの最弱点を1つ提示）
    // 打ち手は目標シートのルール表(F:I)を参照（閾値・文言はシートで編集可）
    dash.getRange(r, 15).setFormula(
      '=IF($B' + r + '=0,' + GN + '!$I$7,' +
      'IF(AND($G' + r + '>0,$I' + r + '>=$L' + r + ',IF($B' + r + '=0,0,$E' + r + '/$B' + r + ')>=' + bench + '),' + GN + '!$I$3,' +
      'IF($F' + r + '<' + GN + '!$H$4,' + GN + '!$I$4,' +
      'IF($H' + r + '<' + GN + '!$H$5,' + GN + '!$I$5,' +
      GN + '!$I$6))))'
    );
  }

  // 合計 / 平均 行
  dash.getRange(rt, 1).setValue('合計 / 平均').setFontWeight('bold');
  dash.getRange(rt, 2).setFormula('=SUM(B' + first + ':B' + last + ')');
  dash.getRange(rt, 3).setFormula('=SUM(C' + first + ':C' + last + ')');
  dash.getRange(rt, 4).setFormula('=IF($B' + rt + '=0,0,$C' + rt + '/$B' + rt + ')');
  dash.getRange(rt, 5).setFormula('=SUM(E' + first + ':E' + last + ')');
  dash.getRange(rt, 6).setFormula('=IF($C' + rt + '=0,0,$E' + rt + '/$C' + rt + ')');
  dash.getRange(rt, 7).setFormula('=SUM(G' + first + ':G' + last + ')');
  dash.getRange(rt, 8).setFormula('=IF($E' + rt + '=0,0,$G' + rt + '/$E' + rt + ')');
  dash.getRange(rt, 9).setFormula('=IF($B' + rt + '=0,0,$G' + rt + '/$B' + rt + ')');
  dash.getRange(rt, 10).setFormula('=SUM(J' + first + ':J' + last + ')');
  dash.getRange(rt, 11).setFormula('=IF($J' + rt + '=0,"",$B' + rt + '/$J' + rt + ')');
  dash.getRange(rt, 12).setFormula('=IFERROR(SUMPRODUCT(J' + first + ':J' + last + ',L' + first + ':L' + last + ')/$J' + rt + ',0)');
  dash.getRange(rt, 13).setFormula('=COUNTIF(M' + first + ':M' + last + ',"達成")&" / ' + n + '名 達成"');
  dash.getRange(rt, 14).setFormula(
    '=IF($J' + rt + '=0,"",SPARKLINE($B' + rt + ',{"charttype","bar";"max",$J' + rt + ';"color1","#4f46e5";"empty","zero"}))'
  );
  dash.getRange(rt, 1, 1, 15).setBackground('#f8fafc').setFontWeight('bold')
    .setBorder(true, false, false, false, false, false, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // ---- KPI（合計行を参照） ----
  const kpis = [
    ['総架電数', '=B' + rt, '#', '対象期間・種別の総架電件数'],
    ['接触率', '=D' + rt, '%1', '誰かと話せた率（接触数÷架電件数）'],
    ['担当接触率', '=IF(B' + rt + '=0,0,E' + rt + '/B' + rt + ')', '%1', '担当者まで届いた率（担当接触数÷架電件数）'],
    ['平均アポ率', '=I' + rt, '%2', 'アポ数÷架電件数'],
  ];
  kpis.forEach((k, i) => {
    const c = 1 + i * 3;
    dash.getRange(8, c).setValue(k[0]).setFontColor('#64748b').setFontWeight('bold').setNote(k[3]);
    const v = dash.getRange(9, c).setFormula(k[1]).setFontSize(18).setFontWeight('bold');
    if (k[2] === '#') v.setNumberFormat('#,##0');
    if (k[2] === '%1') v.setNumberFormat('0.0%');
    if (k[2] === '%2') v.setNumberFormat('0.00%');
  });

  // ---- 数値書式 ----
  [2, 3, 5, 7, 10].forEach(col => dash.getRange(first, col, n + 1, 1).setNumberFormat('#,##0'));
  [4, 6, 8, 11, 12].forEach(col => dash.getRange(first, col, n + 1, 1).setNumberFormat('0.0%'));
  dash.getRange(first, 9, n + 1, 1).setNumberFormat('0.00%'); // アポ率

  // ---- 条件付き書式（未達=NA） ----
  const rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule() // アポ数=0
    .whenFormulaSatisfied('=$G' + first + '=0')
    .setBackground('#fff1f2').setFontColor('#e11d48').setRanges([dash.getRange(first, 7, n, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule() // アポ率<目標
    .whenFormulaSatisfied('=$I' + first + '<$L' + first)
    .setBackground('#fff1f2').setFontColor('#e11d48').setRanges([dash.getRange(first, 9, n, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule() // 接触→アポ率が低い（要改善の本丸）
    .whenFormulaSatisfied('=AND($E' + first + '>0,$H' + first + '<0.05)')
    .setBackground('#fffbeb').setFontColor('#b45309').setRanges([dash.getRange(first, 8, n, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('未達')
    .setBackground('#fff1f2').setFontColor('#be123c').setBold(true).setRanges([dash.getRange(first, 13, n, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('達成')
    .setBackground('#ecfdf5').setFontColor('#047857').setBold(true).setRanges([dash.getRange(first, 13, n, 1)]).build());
  dash.setConditionalFormatRules(rules);

  // ---- 体裁 ----
  dash.setColumnWidth(1, 130);
  dash.setColumnWidths(2, 12, 88);
  dash.setColumnWidth(14, 150);
  dash.setColumnWidth(15, 230);
  dash.setFrozenRows(HR);
  dash.getRange(HR, 1, n + 2, 15)
    .setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
  dash.setHiddenGridlines(true);

  // ===== 下部：達成ペース（期間モード連動）＆ メンバー別構成比 =====
  // 日次の元データは隠しシート(_集計データ)の R:X 列に作成し、画面には出さない。
  const calc = ss.getSheetByName(CONFIG.CALC_SHEET);
  const DAYS = 45;        // 月間=最大31。任意期間が長い場合は先頭45日
  const TC = 18;          // R列スタート（18列目）
  calc.getRange(1, TC, DAYS + 1, 7).clearContent();
  calc.getRange(1, TC, 1, 7).setValues([['日付', '当日架電', '累積架電', '架電ペース', '当日アポ', '累積アポ', 'アポペース']]);
  const dCallTgt = '(SUM(' + GN + '!$C$2:$C$200)/DAY($H$2))';
  const dApptTgt = '(SUMPRODUCT(' + GN + '!$C$2:$C$200,' + GN + '!$D$2:$D$200)/DAY($H$2))';
  const drows = [];
  for (let i = 1; i <= DAYS; i++) {
    const r = i + 1; // 隠しシート上の行（ヘッダー=1行目）
    drows.push([
      '=IF(INT($H$5)+' + (i - 1) + '>INT($H$6),"",INT($H$5)+' + (i - 1) + ')',
      '=IF($R' + r + '="","",COUNTIFS($C:$C,">="&$R' + r + ',$C:$C,"<"&$R' + r + '+1,$B:$B,$H$3))',
      '=IF($R' + r + '="","",SUM($S$2:$S' + r + '))',
      '=IF($R' + r + '="","",' + dCallTgt + '*' + i + ')',
      '=IF($R' + r + '="","",SUMIFS($F:$F,$C:$C,">="&$R' + r + ',$C:$C,"<"&$R' + r + '+1,$B:$B,$H$3))',
      '=IF($R' + r + '="","",SUM($V$2:$V' + r + '))',
      '=IF($R' + r + '="","",' + dApptTgt + '*' + i + ')',
    ]);
  }
  calc.getRange(2, TC, DAYS, 7).setFormulas(drows);
  calc.getRange(2, TC, DAYS, 1).setNumberFormat('m/d');

  const base = rt + 3;
  dash.getRange(base, 1).setValue('達成ペース（選択期間内の累積実績 vs 目標ペース）')
    .setFontWeight('bold').setFontSize(12);
  const dom = calc.getRange(1, TC, DAYS + 1, 1);        // 日付（ドメイン）

  // 架電バーンアップ（累積架電 + 架電ペース）
  dash.insertChart(dash.newChart().asLineChart()
    .addRange(dom).addRange(calc.getRange(1, TC + 2, DAYS + 1, 2))
    .setOption('title', '架電：累積実績 vs 目標ペース')
    .setOption('legend', { position: 'bottom' })
    .setOption('colors', ['#6366f1', '#cbd5e1'])
    .setOption('width', 520).setOption('height', 280)
    .setPosition(base + 1, 1, 0, 0).build());
  // アポバーンアップ（累積アポ + アポペース）
  dash.insertChart(dash.newChart().asLineChart()
    .addRange(dom).addRange(calc.getRange(1, TC + 5, DAYS + 1, 2))
    .setOption('title', 'アポ：累積実績 vs 目標ペース')
    .setOption('legend', { position: 'bottom' })
    .setOption('colors', ['#10b981', '#cbd5e1'])
    .setOption('width', 520).setOption('height', 280)
    .setPosition(base + 1, 9, 0, 0).build());
  // アポ数の構成比（メンバー別）
  dash.insertChart(dash.newChart().asPieChart()
    .addRange(dash.getRange(first, 1, n, 1)).addRange(dash.getRange(first, 7, n, 1))
    .setOption('title', 'アポ数の構成比（メンバー別）')
    .setOption('pieHole', 0.4).setOption('width', 430).setOption('height', 280)
    .setPosition(base + 17, 1, 0, 0).build());
  // 架電数の構成比（メンバー別）
  dash.insertChart(dash.newChart().asPieChart()
    .addRange(dash.getRange(first, 1, n, 1)).addRange(dash.getRange(first, 2, n, 1))
    .setOption('title', '架電数の構成比（メンバー別）')
    .setOption('pieHole', 0.4).setOption('width', 430).setOption('height', 280)
    .setPosition(base + 17, 9, 0, 0).build());

  dash.getRange(base + 33, 1).setValue(
    '※ 達成ペース・構成比は 種別／対象月／期間モード のプルダウンに連動。目標ペースは暦日ベースの直線（チーム全体の月間目標）。'
  ).setFontColor('#94a3b8');

  ss.setActiveSheet(dash);
}

