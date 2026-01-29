import io
import re
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple

import pandas as pd


# -----------------------------
# Robust numeric cleaning
# (same logic: remove commas/$; improved to handle parentheses negatives etc.)
# -----------------------------
_NUM_CLEAN_RE = re.compile(r"[,\s]")

def resolve_location_column(df: pd.DataFrame) -> str:
    cols_lower = {c.lower(): c for c in df.columns}
    if "location" in cols_lower:
        return cols_lower["location"]
    raise ValueError("Missing required column: expected 'Location' (any casing).")

def resolve_department_column(df: pd.DataFrame) -> str:
    cols_lower = {c.lower(): c for c in df.columns}
    if "classification" in cols_lower:
        return cols_lower["classification"]
    if "position" in cols_lower:
        return cols_lower["position"]
    raise ValueError("Missing department column: expected 'Classification' or 'Position' (any casing).")

def clean_to_number(x) -> Optional[float]:
    if pd.isna(x):
        return None
    s = str(x).strip()
    if s == "" or s == "-" or s.lower() == "n/a":
        return None

    # (123.45) negative format
    is_paren_neg = s.startswith("(") and s.endswith(")")
    if is_paren_neg:
        s = s[1:-1].strip()

    # remove commas/spaces
    s = _NUM_CLEAN_RE.sub("", s)

    # remove common currency markers (extend if needed)
    for token in ("$", "USD", "MUR", "RM"):
        s = s.replace(token, "")

    s = s.strip()
    try:
        val = float(s)
    except ValueError:
        return None

    return -val if is_paren_neg else val


@dataclass
class PayrollResult:
    df: pd.DataFrame
    numeric_cols: List[str]

    totals_all: pd.Series
    country_list: List[str]

    def filter_department(self, country: str, department: str) -> pd.DataFrame:
        return self.df[(self.df["Location"] == country) & (self.df["Classification"] == department)].copy()

    def totals_for_department(self, country: str, department: str) -> pd.Series:
        dept_df = self.filter_department(country, department)
        return dept_df[self.numeric_cols].sum(numeric_only=True)


def load_and_process_payroll(csv_path_or_buffer, encoding: str = "ISO-8859-1") -> PayrollResult:
    # Read
    df = pd.read_csv(csv_path_or_buffer, encoding=encoding)

    # Clean column names
    df.columns = df.columns.astype(str).str.strip()

    # Validate required columns
    loc_col = resolve_location_column(df)
    dept_col = resolve_department_column(df)

    # Standardize names so the rest of your pipeline stays unchanged
    if loc_col != "Location":
        df = df.rename(columns={loc_col: "Location"})
    if dept_col != "Classification":
        df = df.rename(columns={dept_col: "Classification"})

    if len(df.columns) < 11:
        raise ValueError("CSV has fewer than 11 columns; cannot apply 'K onwards' numeric rule (index 10+).")

    # Numeric columns from K onward (index 10)
    numeric_cols = list(df.columns[10:])

    # Convert numeric cols
    for col in numeric_cols:
        df[col] = df[col].apply(clean_to_number)

    # Totals across all rows for numeric columns
    totals_all = df[numeric_cols].sum(numeric_only=True)

    # Countries
    country_list = sorted(df["Location"].dropna().astype(str).unique().tolist())

    return PayrollResult(
        df=df,
        numeric_cols=numeric_cols,
        totals_all=totals_all,
        country_list=country_list,
    )


def build_country_summary_excel_bytes(result: PayrollResult) -> bytes:
    """
    Generates the same output structure you had:
    - One sheet: "Summary"
    - Each country block written side-by-side horizontally
    - Each block: groupby("Classification").sum().T + Total column
    Returns Excel bytes (no disk writes).
    """
    output = io.BytesIO()

    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        worksheet = workbook.add_worksheet("Summary")
        writer.sheets["Summary"] = worksheet

        # Formatting (makes it look stronger without changing logic)
        fmt_title = workbook.add_format({"bold": True, "font_size": 12})
        fmt_header = workbook.add_format({"bold": True, "bg_color": "#1F2A44", "font_color": "#FFFFFF", "border": 1})
        fmt_num = workbook.add_format({"num_format": "#,##0.00", "border": 1})
        fmt_text = workbook.add_format({"border": 1})

        start_col = 0

        for country in result.country_list:
            country_df = result.df[result.df["Location"] == country].copy()

            summary_table = country_df.groupby("Classification")[result.numeric_cols].sum(numeric_only=True).T
            summary_table["Total"] = summary_table.sum(axis=1)

            # Write country label
            worksheet.write(0, start_col, country, fmt_title)

            # Write the table with formatting
            # We'll write headers manually for better formatting
            headers = ["Metric"] + summary_table.columns.tolist()
            worksheet.write_row(2, start_col, headers, fmt_header)

            # Data rows
            for r_idx, metric in enumerate(summary_table.index.tolist(), start=3):
                worksheet.write(r_idx, start_col, metric, fmt_text)
                for c_idx, col_name in enumerate(summary_table.columns.tolist(), start=start_col + 1):
                    val = summary_table.loc[metric, col_name]
                    worksheet.write_number(r_idx, c_idx, float(val) if pd.notna(val) else 0.0, fmt_num)

            # Slightly adjust width
            worksheet.set_column(start_col, start_col, 22)  # Metric
            worksheet.set_column(start_col + 1, start_col + len(headers) - 1, 14)

            # Space between country tables
            start_col += len(headers) + 2

    output.seek(0)
    return output.read()


# -----------------------------
# Example usage
# -----------------------------
if __name__ == "__main__":
    # 1) Load & process
    res = load_and_process_payroll("payroll.csv")

    print("Numeric columns (K+):", res.numeric_cols[:5], "...")
    print("Totals (all):")
    print(res.totals_all)

    # 2) Filter example
    country = res.country_list[0]
    dept = sorted(res.df[res.df["Location"] == country]["Classification"].astype(str).unique().tolist())[0]
    dept_totals = res.totals_for_department(country, dept)
    print(f"\nTotals for {dept} in {country}:")
    print(dept_totals)

    # 3) Export Excel bytes → write to file (optional)
    excel_bytes = build_country_summary_excel_bytes(res)
    with open("Country_Department_Summary.xlsx", "wb") as f:
        f.write(excel_bytes)

    print("\nSaved: Country_Department_Summary.xlsx")
