#!/usr/bin/env python3
"""
match_tcgplayer_csv.py

Reads your filled-out `MTG_Rapid_Entry_Template.xlsx` (or CSV exported from the
Browser Rapid-Entry Tool) and merges it against your exported TCGplayer Level 4
Pricing CSV (`Export Filtered CSV` from Seller Portal).

Usage:
  python3 match_tcgplayer_csv.py \
      --input MTG_Rapid_Entry_Template.xlsx \
      --tcg-csv sample_tcgplayer_export.csv \
      --output TCGplayer_Level4_Upload_Ready.csv
"""

import argparse
import csv
import json
import os
import re
import urllib.request
from typing import Dict, List, Any, Optional, Tuple
import openpyxl


TCG_STANDARD_HEADERS = [
    "TCGplayer Id",
    "Product Line",
    "Set Name",
    "Product Name",
    "Title",
    "Number",
    "Rarity",
    "Condition",
    "TCG Market Price",
    "TCG Direct Low",
    "TCG Low Price With Shipping",
    "TCG Low Price",
    "Total Quantity",
    "Add to Quantity",
    "TCG Marketplace Price",
    "Photo URL",
]


def normalize_collector_num(val: Any) -> str:
    s = str(val if val is not None else "").strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return re.sub(r"^0+(?=\d)", "", s)


def parse_condition_key(condition: str, finish: str) -> str:
    c = (condition or "Near Mint").strip().lower()
    f = (finish or "Normal").strip().lower()
    is_foil = f in ("foil", "etched")
    return f"{c}|{'foil' if is_foil else 'normal'}"


def parse_tcg_csv_condition(raw_cond: str) -> str:
    lower = (raw_cond or "Near Mint").strip().lower()
    is_foil = "foil" in lower
    base = re.sub(r"\s*foil\s*$", "", lower).strip() or "near mint"
    return f"{base}|{'foil' if is_foil else 'normal'}"


def read_excel_entries_and_rules(xlsx_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    wb = openpyxl.load_workbook(xlsx_path, data_only=False)
    ws = wb["1_Rapid_Entry"]

    # Read pricing rules from Tab 2 if present
    rules = {
        "Base_Price_Source": "TCG Market Price",
        "Price_Multiplier_Pct": 100.0,
        "Fixed_Offset_USD": 0.0,
        "Minimum_Price_Floor_USD": 0.49,
        "Bulk_Skip_Threshold_USD": 0.25,
        "Exclude_Bulk_From_Upload": "NO",
    }
    if "2_Pricing_Rules" in wb.sheetnames:
        ws_rules = wb["2_Pricing_Rules"]
        for r in range(2, 20):
            k = ws_rules[f"A{r}"].value
            v = ws_rules[f"B{r}"].value
            if k and k in rules and v is not None:
                rules[k] = v

    entries: List[Dict[str, Any]] = []
    cur_set = "MH3"
    cur_finish = "Normal"
    cur_cond = "Near Mint"
    cur_lang = "English"
    cur_box = "Box 1"

    for r in range(4, ws.max_row + 1):
        coll_raw = ws[f"B{r}"].value
        if coll_raw is None or str(coll_raw).strip() == "":
            continue

        set_ov = ws[f"A{r}"].value
        qty_ov = ws[f"C{r}"].value
        fin_ov = ws[f"D{r}"].value
        cond_ov = ws[f"E{r}"].value
        lang_ov = ws[f"F{r}"].value
        box_ov = ws[f"G{r}"].value

        if set_ov is not None and str(set_ov).strip() != "":
            cur_set = str(set_ov).strip().upper()
        if fin_ov is not None and str(fin_ov).strip() != "":
            cur_finish = str(fin_ov).strip()
        if cond_ov is not None and str(cond_ov).strip() != "":
            cur_cond = str(cond_ov).strip()
        if lang_ov is not None and str(lang_ov).strip() != "":
            cur_lang = str(lang_ov).strip()
        if box_ov is not None and str(box_ov).strip() != "":
            cur_box = str(box_ov).strip()

        qty = int(float(qty_ov)) if (qty_ov is not None and str(qty_ov).strip() != "") else 1
        norm_coll = normalize_collector_num(coll_raw)

        entries.append(
            {
                "row": r,
                "set_code": cur_set,
                "collector_number": norm_coll,
                "qty": qty,
                "finish": cur_finish,
                "condition": cur_cond,
                "language": cur_lang,
                "box": cur_box,
            }
        )

    return entries, rules


def consolidate_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    consolidated: Dict[str, Dict[str, Any]] = {}
    for e in entries:
        key = f"{e['set_code']}|{e['collector_number']}|{e['finish']}|{e['condition']}"
        if key in consolidated:
            consolidated[key]["qty"] += e["qty"]
        else:
            consolidated[key] = dict(e)
    return list(consolidated.values())


def load_tcg_pricing_csv(csv_path: Optional[str]) -> Tuple[List[str], Dict[str, Dict[str, str]]]:
    if not csv_path or not os.path.exists(csv_path):
        return TCG_STANDARD_HEADERS, {}

    index: Dict[str, Dict[str, str]] = {}
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = list(reader.fieldnames or TCG_STANDARD_HEADERS)
        for row in reader:
            num = normalize_collector_num(row.get("Number", "")).lower()
            set_name = (row.get("Set Name", "") or "").strip().lower()
            cond_key = parse_tcg_csv_condition(row.get("Condition", ""))
            if num:
                index[f"setnum|{set_name}|{num}|{cond_key}"] = row
                if f"numonly|{num}|{cond_key}" not in index:
                    index[f"numonly|{num}|{cond_key}"] = row
    return headers, index


def compute_price(tcg_row: Optional[Dict[str, str]], rules: Dict[str, Any], fallback_price: float = 0.0) -> float:
    floor = float(rules.get("Minimum_Price_Floor_USD", 0.49) or 0.49)
    mult = float(rules.get("Price_Multiplier_Pct", 100.0) or 100.0) / 100.0
    offset = float(rules.get("Fixed_Offset_USD", 0.0) or 0.0)
    source_col = str(rules.get("Base_Price_Source", "TCG Market Price"))

    base = fallback_price
    if tcg_row:
        raw_val = tcg_row.get(source_col) or tcg_row.get("TCG Market Price") or ""
        try:
            base = float(raw_val)
        except ValueError:
            base = fallback_price

    calculated = round(base * mult + offset, 2)
    return max(floor, calculated)


def match_and_export(
    xlsx_path: str,
    tcg_csv_path: Optional[str],
    output_csv_path: str,
    review_csv_path: str,
) -> None:
    raw_entries, rules = read_excel_entries_and_rules(xlsx_path)
    entries = consolidate_entries(raw_entries)
    headers, tcg_index = load_tcg_pricing_csv(tcg_csv_path)

    upload_rows: List[Dict[str, str]] = []
    review_rows: List[Dict[str, Any]] = []

    for item in entries:
        cond_key = parse_condition_key(item["condition"], item["finish"])
        num_lower = item["collector_number"].lower()

        matched = tcg_index.get(f"numonly|{num_lower}|{cond_key}")
        target_price = compute_price(matched, rules, fallback_price=0.99)
        tcg_cond_str = (
            item["condition"]
            if item["finish"].lower() == "normal"
            else f"{item['condition']} Foil"
        )

        if matched:
            out_row = dict(matched)
            out_row["Add to Quantity"] = str(item["qty"])
            out_row["TCG Marketplace Price"] = f"{target_price:.2f}"
            upload_rows.append(out_row)
        else:
            fallback_row = {h: "" for h in headers}
            fallback_row["Product Line"] = "Magic"
            fallback_row["Set Name"] = item["set_code"]
            fallback_row["Number"] = item["collector_number"]
            fallback_row["Condition"] = tcg_cond_str
            fallback_row["Add to Quantity"] = str(item["qty"])
            fallback_row["TCG Marketplace Price"] = f"{target_price:.2f}"
            upload_rows.append(fallback_row)
            review_rows.append(
                {
                    "Set Code": item["set_code"],
                    "Collector Number": item["collector_number"],
                    "Qty": item["qty"],
                    "Finish": item["finish"],
                    "Condition": item["condition"],
                    "Box": item["box"],
                    "Status": "No exact SKU found in provided TCGplayer Pricing CSV",
                }
            )

    with open(output_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(upload_rows)

    if review_rows:
        with open(review_csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(review_rows[0].keys()))
            writer.writeheader()
            writer.writerows(review_rows)

    print(f"Processed {len(raw_entries)} entered rows ({len(entries)} unique consolidated SKUs).")
    print(f"Wrote TCGplayer Level 4 Staged CSV -> {output_csv_path}")
    if review_rows:
        print(f"Wrote {len(review_rows)} unmatched rows for review -> {review_csv_path}")
    else:
        print("100% of rows matched exact TCGplayer SKUs!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Match MTG Rapid Entry Excel sheet to TCGplayer Level 4 CSV")
    parser.add_argument("--input", default="MTG_Rapid_Entry_Template.xlsx", help="Path to filled Excel workbook")
    parser.add_argument("--tcg-csv", default=None, help="Path to exported TCGplayer Filtered Pricing CSV")
    parser.add_argument("--output", default="TCGplayer_Level4_Upload_Ready.csv", help="Output CSV ready for TCGplayer")
    parser.add_argument("--review", default="Unmatched_or_Review_Report.csv", help="Output report for unmatched SKUs")
    args = parser.parse_args()

    match_and_export(args.input, args.tcg_csv, args.output, args.review)
