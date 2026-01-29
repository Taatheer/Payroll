// ==========================
// State
// ==========================
let rawRows = [];        // array of objects from CSV
let columns = [];        // headers
let numericCols = [];    // columns K onward (index 10+)
let countryList = [];
let dfCleaned = [];      // rows with numeric cleaned values (still objects)
let totalsAll = {};      // totals for numeric columns

let previewTable = null;
let totalsTable = null;
let filteredTable = null;
let deptTotalsTable = null;

let LOC_COL = "Location";
let DEPT_COL = "Classification"; // will become "Position" if needed


// ==========================
// Elements
// ==========================
const fileInput = document.getElementById("fileInput");
const statusPill = document.getElementById("statusPill");
const progressWrap = document.getElementById("progressWrap");
const progressText = document.getElementById("progressText");
const errorBox = document.getElementById("errorBox");

const resetBtn = document.getElementById("resetBtn");
const exportBtn = document.getElementById("exportBtn");

const stats = document.getElementById("stats");
const statRows = document.getElementById("statRows");
const statCountries = document.getElementById("statCountries");
const statDepts = document.getElementById("statDepts");
const statNumCols = document.getElementById("statNumCols");

const totalsCards = document.getElementById("totalsCards");
const totalsCardsBtn = document.getElementById("totalsCardsBtn");
const totalsTableBtn = document.getElementById("totalsTableBtn");
const totalsTableDiv = document.getElementById("totalsTable");

const countrySelect = document.getElementById("countrySelect");
const deptSelect = document.getElementById("deptSelect");
const applyFilterBtn = document.getElementById("applyFilterBtn");
const clearFilterBtn = document.getElementById("clearFilterBtn");

const filterTitle = document.getElementById("filterTitle");

// ==========================
// Helpers
// ==========================
function setStatus(text){ statusPill.textContent = text; }

function resolveColumn(cols, wantedLowerNames) {
  // returns the actual column name from `cols` matching any of the lowercase names
  const map = new Map(cols.map(c => [String(c).toLowerCase(), c]));
  for (const w of wantedLowerNames) {
    if (map.has(w)) return map.get(w);
  }
  return null;
}


function showProgress(msg){
  progressWrap.hidden = false;
  progressText.textContent = msg;
}

function hideProgress(){ progressWrap.hidden = true; }

function showError(msg){
  errorBox.hidden = false;
  errorBox.textContent = msg;
}

function clearError(){
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function fmtNumber(x){
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  return x.toLocaleString(undefined, {maximumFractionDigits: 2});
}

// Robust numeric cleaner (keeps your idea: remove commas/$; extends for negatives)
function cleanToNumber(value){
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s || s === "-" || s.toLowerCase() === "n/a") return null;

  // handle (123.45) style negatives
  const isParenNeg = /^\(.*\)$/.test(s);
  if (isParenNeg) s = s.slice(1, -1);

  // remove commas and common currency symbols/codes
  s = s.replaceAll(",", "")
       .replaceAll("$", "")
       .replaceAll("USD", "")
       .replaceAll("MUR", "")
       .replaceAll("RM", "")
       .trim();

  // keep digits, dot, minus
  const num = Number(s);
  if (Number.isNaN(num)) return null;
  return isParenNeg ? -num : num;
}

function getUnique(arr){
  return [...new Set(arr)].filter(v => v !== null && v !== undefined && String(v).trim() !== "");
}

function buildSelect(selectEl, items, placeholder){
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);

  for (const item of items){
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    selectEl.appendChild(opt);
  }
}

function enableUI(enabled){
  resetBtn.disabled = !enabled;
  exportBtn.disabled = !enabled;

  countrySelect.disabled = !enabled;
  deptSelect.disabled = !enabled;
  applyFilterBtn.disabled = !enabled;
  clearFilterBtn.disabled = !enabled;
}

// ==========================
// Tables
// ==========================
function makeTabulatorColumns(cols){
  return cols.map(c => ({title: c, field: c, headerFilter: true}));
}

function renderPreview(){
  const previewRows = dfCleaned.slice(0, 50);

  if (previewTable) previewTable.destroy();
  previewTable = new Tabulator("#previewTable", {
    data: previewRows,
    layout: "fitColumns",
    height: "360px",
    pagination: true,
    paginationSize: 10,
    columns: makeTabulatorColumns(columns),
  });
}

function renderTotals(){
  // Cards
  totalsCards.innerHTML = "";
  for (const col of numericCols){
    const card = document.createElement("div");
    card.className = "totalCard";
    card.innerHTML = `<div class="totalKey">${col}</div><div class="totalVal">${fmtNumber(totalsAll[col])}</div>`;
    totalsCards.appendChild(card);
  }

  // Table
  const totalsRows = numericCols.map(c => ({Column: c, Total: totalsAll[c]}));

  if (totalsTable) totalsTable.destroy();
  totalsTable = new Tabulator("#totalsTable", {
    data: totalsRows,
    layout: "fitColumns",
    height: "360px",
    pagination: true,
    paginationSize: 10,
    columns: [
      {title: "Column", field: "Column", headerFilter: true},
      {title: "Total", field: "Total", hozAlign:"right", formatter: (cell)=> fmtNumber(cell.getValue())},
    ],
  });
}

function renderFiltered(filteredRows){
  if (filteredTable) filteredTable.destroy();
  filteredTable = new Tabulator("#filteredTable", {
    data: filteredRows,
    layout: "fitColumns",
    height: "380px",
    pagination: true,
    paginationSize: 10,
    columns: makeTabulatorColumns(columns),
  });
}

function renderDeptTotals(filteredRows){
  const totals = {};
  for (const c of numericCols) totals[c] = 0;

  for (const row of filteredRows){
    for (const c of numericCols){
      const v = row[c];
      if (typeof v === "number" && !Number.isNaN(v)) totals[c] += v;
    }
  }

  const rows = numericCols.map(c => ({Column: c, Total: totals[c]}));

  if (deptTotalsTable) deptTotalsTable.destroy();
  deptTotalsTable = new Tabulator("#deptTotalsTable", {
    data: rows,
    layout: "fitColumns",
    height: "300px",
    columns: [
      {title: "Column", field: "Column", headerFilter: true},
      {title: "Total", field: "Total", hozAlign:"right", formatter: (cell)=> fmtNumber(cell.getValue())},
    ],
  });
}

// ==========================
// Core logic (same as yours)
// ==========================
function computeNumericCols(){
  if (columns.length < 11){
    throw new Error("CSV has fewer than 11 columns, so 'K onwards' (index 10+) isn't possible.");
  }
  numericCols = columns.slice(10); // K onwards
}

function cleanNumericColumns(){
  // keep row objects, convert K+ to numeric
  dfCleaned = rawRows.map(r => {
    const obj = {...r};
    for (const col of numericCols){
      obj[col] = cleanToNumber(obj[col]);
    }
    return obj;
  });
}

function computeTotalsAll(){
  totalsAll = {};
  for (const c of numericCols) totalsAll[c] = 0;

  for (const row of dfCleaned){
    for (const c of numericCols){
      const v = row[c];
      if (typeof v === "number" && !Number.isNaN(v)) totalsAll[c] += v;
    }
  }
}

function pickDeptColumn(cols){
  const c = cols.find(x => x.toLowerCase() === "classification");
  if (c) return c;
  const p = cols.find(x => x.toLowerCase() === "position");
  if (p) return p;
  return null;
}

function buildCountryAndDeptLists(){
  // Resolve Location (case-insensitive)
  const loc = resolveColumn(columns, ["location"]);
  if (!loc){
    throw new Error("Missing required column: 'Location' (case-insensitive).");
  }

  // Resolve Department column: Classification OR Position (case-insensitive)
  const dept = resolveColumn(columns, ["classification", "position"]);
  if (!dept){
    throw new Error("Missing required column: 'Classification' or 'Position' (case-insensitive).");
  }

  // Save resolved names globally
  LOC_COL = loc;
  DEPT_COL = dept;

  countryList = getUnique(dfCleaned.map(r => r[LOC_COL]));
  countryList.sort((a,b)=> String(a).localeCompare(String(b)));

  buildSelect(countrySelect, countryList, "Select a Country");
  buildSelect(deptSelect, [], "Select a Department");
}



// ==========================
// Excel Export (same summary logic)
// Summary table per country: groupby Classification, sum numericCols, transpose, add Total
// Written into ONE worksheet with blocks side-by-side (same as your Streamlit version)
// ==========================
function exportSummaryExcel(){
  showProgress("Building Excel summary…");
  setStatus("Exporting");

  try{
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Summary"]]);

    let startCol = 0;

    for (const country of countryList){
      const countryRows = dfCleaned.filter(r => r[LOC_COL] === country);


      // group sums by Classification
      const groups = {};
      for (const row of countryRows){
        const dept = row[DEPT_COL];
        if (!groups[dept]) {
          groups[dept] = {};
          for (const c of numericCols) groups[dept][c] = 0;
        }
        for (const c of numericCols){
          const v = row[c];
          if (typeof v === "number" && !Number.isNaN(v)) groups[dept][c] += v;
        }
      }

      // Build table shaped like your pandas: groupby.sum().T + Total
      const depts = Object.keys(groups).sort((a,b)=> String(a).localeCompare(String(b)));

      // header rows
      // row0: country name
      // row2: table headers (first col = Metric, then each dept, then Total)
      const header = ["Metric", ...depts, "Total"];

      // metrics are numericCols (rows)
      const tableAoA = [];
      for (const metric of numericCols){
        let rowTotal = 0;
        const row = [metric];
        for (const dept of depts){
          const val = groups[dept][metric] ?? 0;
          row.push(val);
          rowTotal += val;
        }
        row.push(rowTotal);
        tableAoA.push(row);
      }

      // place in worksheet
      XLSX.utils.sheet_add_aoa(ws, [[country]], {origin: {r: 0, c: startCol}});
      XLSX.utils.sheet_add_aoa(ws, [header], {origin: {r: 2, c: startCol}});
      XLSX.utils.sheet_add_aoa(ws, tableAoA, {origin: {r: 3, c: startCol}});

      startCol += header.length + 2; // space between tables (same idea as your code)
    }

    XLSX.utils.book_append_sheet(wb, ws, "Summary");

    const out = XLSX.write(wb, {bookType:"xlsx", type:"array"});
    const blob = new Blob([out], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "Country_Department_Summary.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

  } finally {
    hideProgress();
    setStatus("Ready");
  }
}

// ==========================
// Events
// ==========================
fileInput.addEventListener("change", () => {
  clearError();
  const file = fileInput.files?.[0];
  if (!file) return;

  setStatus("Parsing");
  showProgress("Parsing CSV…");
  enableUI(false);

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // we control typing
    complete: (results) => {
      try{
        rawRows = results.data || [];
        columns = (results.meta && results.meta.fields) ? results.meta.fields.map(h => String(h).trim()) : [];

        // normalize keys in each row to trimmed headers
        rawRows = rawRows.map(row => {
          const fixed = {};
          for (const k of Object.keys(row)){
            fixed[String(k).trim()] = row[k];
          }
          return fixed;
        });

        if (rawRows.length === 0) throw new Error("No rows found in CSV.");

        computeNumericCols();        // K onwards
        cleanNumericColumns();       // convert those
        computeTotalsAll();          // totals
        buildCountryAndDeptLists();  // filter lists

        // Stats
        const deptCount = getUnique(dfCleaned.map(r => r[DEPT_COL])).length;

        stats.hidden = false;
        statRows.textContent = rawRows.length.toLocaleString();
        statCountries.textContent = countryList.length.toLocaleString();
        statDepts.textContent = deptCount.toLocaleString();
        statNumCols.textContent = numericCols.length.toLocaleString();

        // Render
        renderPreview();
        renderTotals();

        // Enable UI
        enableUI(true);
        exportBtn.disabled = false;

        setStatus("Ready");
      } catch (e){
        showError(e.message || String(e));
        setStatus("Error");
      } finally {
        hideProgress();
      }
    },
    error: (err) => {
      hideProgress();
      showError(err?.message || "Failed to parse CSV.");
      setStatus("Error");
    }
  });
});

countrySelect.addEventListener("change", () => {
  clearError();
  const country = countrySelect.value;
  if (!country){
    buildSelect(deptSelect, [], "Select a Department");
    return;
  }
  const countryRows = dfCleaned.filter(r => r[LOC_COL] === country);
  const deptList = getUnique(countryRows.map(r => r[DEPT_COL])).sort((a,b)=> String(a).localeCompare(String(b)));

  buildSelect(deptSelect, deptList, "Select a Department");
});

applyFilterBtn.addEventListener("click", () => {
  clearError();
  const country = countrySelect.value;
  const dept = deptSelect.value;
  if (!country || !dept){
    showError("Please select both a Country (Location) and a Department (Classification).");
    return;
  }

  const filtered = dfCleaned.filter(r => r[LOC_COL] === country && r[DEPT_COL] === dept);

  filterTitle.textContent = `Data for ${dept} in ${country} (rows: ${filtered.length.toLocaleString()})`;
  renderFiltered(filtered);
  renderDeptTotals(filtered);
});

clearFilterBtn.addEventListener("click", () => {
  clearError();
  countrySelect.value = "";
  deptSelect.value = "";
  buildSelect(deptSelect, [], "Select a Department");
  filterTitle.textContent = "No filter applied yet.";

  if (filteredTable) { filteredTable.destroy(); filteredTable = null; document.getElementById("filteredTable").innerHTML = ""; }
  if (deptTotalsTable) { deptTotalsTable.destroy(); deptTotalsTable = null; document.getElementById("deptTotalsTable").innerHTML = ""; }
});

exportBtn.addEventListener("click", () => {
  if (!dfCleaned.length) return;
  exportSummaryExcel();
});

resetBtn.addEventListener("click", () => {
  // Hard reset
  rawRows = [];
  columns = [];
  numericCols = [];
  countryList = [];
  dfCleaned = [];
  totalsAll = {};

  fileInput.value = "";
  enableUI(false);
  clearError();
  setStatus("Idle");
  stats.hidden = true;

  document.getElementById("previewTable").innerHTML = "";
  document.getElementById("totalsCards").innerHTML = "";
  document.getElementById("totalsTable").innerHTML = "";
  document.getElementById("filteredTable").innerHTML = "";
  document.getElementById("deptTotalsTable").innerHTML = "";

  filterTitle.textContent = "No filter applied yet.";
});

// Totals view toggle
totalsCardsBtn.addEventListener("click", () => {
  totalsCardsBtn.classList.add("active");
  totalsTableBtn.classList.remove("active");
  totalsCards.hidden = false;
  totalsTableDiv.hidden = true;
});
totalsTableBtn.addEventListener("click", () => {
  totalsTableBtn.classList.add("active");
  totalsCardsBtn.classList.remove("active");
  totalsCards.hidden = true;
  totalsTableDiv.hidden = false;
});
