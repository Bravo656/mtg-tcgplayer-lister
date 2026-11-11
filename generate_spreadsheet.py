#!/usr/bin/env python3
"""
Generates MTG_Rapid_Entry_Template.xlsx for rapid Set + Collector Number entry.

Features:
- Tab 1 (1_Rapid_Entry):
  - Sticky batch columns (Set Code, Finish, Condition, Language, Box/Location)
    that automatically inherit from the row above if you only type Collector Number (Col B).
  - Pre-built Excel formulas in Columns H-K that auto-normalize Collector Numbers,
    build a composite SKU key, and flag rows ready for matching.
  - Data Validation dropdowns for Finish (Normal, Foil, Etched) and Condition.
- Tab 2 (2_Pricing_Rules):
  - Configurable Pricing Strategy (Market, Low, Direct Low), Multiplier %,
    Minimum Price Floor ($0.49), and Bulk Exclusion Threshold ($0.25).
- Tab 3 (3_Instructions_&_Set_Codes):
  - Quick reference of Modern MTG Set Codes and step-by-step instructions.
"""

import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


def create_rapid_entry_workbook(output_path: str) -> None:
    wb = openpyxl.Workbook()

    # Palette
    header_fill = PatternFill("solid", fgColor="1E293B")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    sticky_fill = PatternFill("solid", fgColor="EFF6FF")  # Light blue for sticky/override cols
    primary_fill = PatternFill("solid", fgColor="FEF9C3")  # Soft yellow highlight for Collector #
    auto_fill = PatternFill("solid", fgColor="F1F5F9")     # Grey for auto-calculated cols
    accent_fill = PatternFill("solid", fgColor="DCFCE7")   # Soft green

    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    # =========================================================================
    # TAB 1: 1_Rapid_Entry
    # =========================================================================
    ws1 = wb.active
    ws1.title = "1_Rapid_Entry"
    ws1.views.sheetView[0].showGridLines = True

    # Top Banner
    ws1.merge_cells("A1:L1")
    ws1["A1"] = (
        "MTG RAPID COLLECTOR-# ENTRY SHEET  |  "
        "TIP: Fill Row 4 to set your starting Set/Condition/Foil, then ONLY type Collector # in Column B (Yellow)!"
    )
    ws1["A1"].font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
    ws1["A1"].fill = PatternFill("solid", fgColor="0F172A")
    ws1["A1"].alignment = Alignment(vertical="center", horizontal="left", indent=1)
    ws1.row_dimensions[1].height = 28

    ws1.merge_cells("A2:L2")
    ws1["A2"] = (
        "Columns A, C, D, E, F, G are 'Sticky Override' columns: leave them blank to automatically copy the value from the row above, "
        "or type a new Set Code / Finish / Condition whenever you switch piles."
    )
    ws1["A2"].font = Font(name="Calibri", size=10, italic=True, color="334155")
    ws1["A2"].fill = PatternFill("solid", fgColor="E2E8F0")
    ws1["A2"].alignment = Alignment(vertical="center", horizontal="left", indent=1)
    ws1.row_dimensions[2].height = 22

    headers = [
        ("A", "Set Override\n(Blank = Same Set)", 18),
        ("B", "Collector #\n(TYPE HERE + ENTER)", 22),
        ("C", "Qty\n(Blank = 1)", 12),
        ("D", "Finish Override\n(Normal/Foil/Etched)", 20),
        ("E", "Condition Override\n(NM/LP/MP/HP/DMG)", 22),
        ("F", "Language\n(Blank = English)", 16),
        ("G", "Box / Location\n(Blank = Same Box)", 20),
        ("H", "Effective Set\n(Auto)", 15),
        ("I", "Effective Coll #\n(Auto Normalized)", 18),
        ("J", "Effective Qty\n(Auto)", 14),
        ("K", "Effective Finish &\nCondition (Auto)", 26),
        ("L", "Effective Box\n(Auto)", 18),
    ]

    ws1.row_dimensions[3].height = 30
    for col_letter, text, width in headers:
        cell = ws1[f"{col_letter}3"]
        cell.value = text
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws1.column_dimensions[col_letter].width = width

    # Freeze panes below header row
    ws1.freeze_panes = "A4"

    # Data Validation for Finish & Condition
    dv_finish = DataValidation(type="list", formula1='"Normal,Foil,Etched"', allow_blank=True)
    dv_cond = DataValidation(
        type="list",
        formula1='"Near Mint,Lightly Played,Moderately Played,Heavily Played,Damaged"',
        allow_blank=True,
    )
    ws1.add_data_validation(dv_finish)
    ws1.add_data_validation(dv_cond)
    dv_finish.add("D4:D1003")
    dv_cond.add("E4:E1003")

    # Seed sample starter rows (Rows 4-7) so user sees how sticky inheritance works
    sample_rows = [
        # (Set, Coll#, Qty, Finish, Condition, Lang, Box)
        ("MH3", "214", 1, "Normal", "Near Mint", "English", "Box 1 - Row A"),
        ("", "234", 2, "", "", "", ""),
        ("", "325", "", "Foil", "", "", ""),
        ("", "412", 1, "Normal", "Lightly Played", "", ""),
    ]

    max_rows = 500
    for r in range(4, 4 + max_rows):
        idx = r - 4
        if idx < len(sample_rows):
            s_set, s_coll, s_qty, s_fin, s_cond, s_lang, s_box = sample_rows[idx]
            ws1[f"A{r}"] = s_set
            ws1[f"B{r}"] = s_coll
            ws1[f"C{r}"] = s_qty
            ws1[f"D{r}"] = s_fin
            ws1[f"E{r}"] = s_cond
            ws1[f"F{r}"] = s_lang
            ws1[f"G{r}"] = s_box

        # Sticky formulas in Columns H - L
        if r == 4:
            ws1[f"H{r}"] = f'=IF(B{r}="","",UPPER(IF(A{r}<>"",A{r},"MH3")))'
            ws1[f"I{r}"] = f'=IF(B{r}="","",TRIM(B{r}))'
            ws1[f"J{r}"] = f'=IF(B{r}="","",IF(C{r}<>"",C{r},1))'
            ws1[f"K{r}"] = (
                f'=IF(B{r}="","",IF(E{r}<>"",E{r},"Near Mint")&" | "&IF(D{r}<>"",D{r},"Normal"))'
            )
            ws1[f"L{r}"] = f'=IF(B{r}="","",IF(G{r}<>"",G{r},"Box 1 - Row A"))'
        else:
            prev = r - 1
            ws1[f"H{r}"] = f'=IF(B{r}="","",UPPER(IF(A{r}<>"",A{r},H{prev})))'
            ws1[f"I{r}"] = f'=IF(B{r}="","",TRIM(B{r}))'
            ws1[f"J{r}"] = f'=IF(B{r}="","",IF(C{r}<>"",C{r},1))'
            ws1[f"K{r}"] = (
                f'=IF(B{r}="","",'
                f'IF(E{r}<>"",E{r},LEFT(K{prev},FIND(" | ",K{prev})-1))'
                f'&" | "&'
                f'IF(D{r}<>"",D{r},MID(K{prev},FIND(" | ",K{prev})+3,99)))'
            )
            ws1[f"L{r}"] = f'=IF(B{r}="","",IF(G{r}<>"",G{r},L{prev}))'

        # Styling each column
        for col_idx in range(1, 13):
            col_let = get_column_letter(col_idx)
            cell = ws1[f"{col_let}{r}"]
            cell.border = thin_border
            if col_let == "B":
                cell.fill = primary_fill
                cell.font = Font(name="Calibri", size=11, bold=True)
                cell.alignment = Alignment(horizontal="center")
            elif col_let in ("A", "C", "D", "E", "F", "G"):
                cell.fill = sticky_fill
                cell.alignment = Alignment(horizontal="center")
            else:
                cell.fill = auto_fill
                cell.font = Font(name="Calibri", size=10, color="334155")
                cell.alignment = Alignment(horizontal="center")

    # =========================================================================
    # TAB 2: 2_Pricing_Rules
    # =========================================================================
    ws2 = wb.create_sheet(title="2_Pricing_Rules")
    ws2.column_dimensions["A"].width = 34
    ws2.column_dimensions["B"].width = 24
    ws2.column_dimensions["C"].width = 58

    ws2["A1"] = "Setting Name"
    ws2["B1"] = "Value"
    ws2["C1"] = "Description / How match_tcgplayer_csv.py Uses This"
    for col in ("A", "B", "C"):
        ws2[f"{col}1"].font = header_font
        ws2[f"{col}1"].fill = header_fill

    rules = [
        ("Base_Price_Source", "TCG Market Price", "Options: TCG Market Price, TCG Low Price, TCG Direct Low"),
        ("Price_Multiplier_Pct", 100.0, "Percentage of Base Price (e.g., 100 = 100% of Market, 95 = 5% discount)"),
        ("Fixed_Offset_USD", 0.00, "Fixed dollar offset added after multiplier (e.g., 0.05 adds 5 cents)"),
        ("Minimum_Price_Floor_USD", 0.49, "Hard floor: no card will ever be priced below this amount on TCGplayer"),
        ("Bulk_Skip_Threshold_USD", 0.25, "Cards with Market Price below this threshold can be flagged or excluded"),
        ("Exclude_Bulk_From_Upload", "NO", "Set to YES to automatically skip bulk below threshold in TCGplayer CSV"),
    ]

    for idx, (k, v, desc) in enumerate(rules, start=2):
        ws2[f"A{idx}"] = k
        ws2[f"A{idx}"].font = Font(bold=True)
        ws2[f"B{idx}"] = v
        ws2[f"B{idx}"].fill = accent_fill
        ws2[f"B{idx}"].font = Font(bold=True)
        ws2[f"C{idx}"] = desc
        for c in ("A", "B", "C"):
            ws2[f"{c}{idx}"].border = thin_border

    # =========================================================================
    # TAB 3: 3_Instructions_&_Set_Codes
    # =========================================================================
    ws3 = wb.create_sheet(title="3_Instructions_&_Set_Codes")
    ws3.column_dimensions["A"].width = 16
    ws3.column_dimensions["B"].width = 44
    ws3.column_dimensions["C"].width = 22
    ws3.column_dimensions["D"].width = 50

    ws3["A1"] = "Set Code"
    ws3["B1"] = "Official TCGplayer / Scryfall Set Name"
    ws3["C1"] = "Release Era"
    ws3["D1"] = "Variant / Collector Number Notes"
    for col in ("A", "B", "C", "D"):
        ws3[f"{col}1"].font = header_font
        ws3[f"{col}1"].fill = header_fill

    common_sets = [
        ("FDN", "Foundations", "2024", "Standard #1-291; Borderless/Showcase #292+"),
        ("DSK", "Duskmourn: House of Horror", "2024", "Standard #1-286; Showcase/Borderless #287+"),
        ("BLB", "Bloomburrow", "2024", "Standard #1-281; Woodland/Borderless #282+"),
        ("MH3", "Modern Horizons 3", "2024", "Standard #1-303; Retro/Borderless/Profile #304+"),
        ("OTJ", "Outlaws of Thunder Junction", "2024", "Watch out for Breaking News (OTP) bonus sheet!"),
        ("MKM", "Murders at Karlov Manor", "2024", "Standard #1-286; Dossier Showcase #287+"),
        ("RVR", "Ravnica Remastered", "2024", "Retro frames have distinct higher collector #s"),
        ("LCI", "The Lost Caverns of Ixalan", "2023", "Jurassic World cards use set code REX"),
        ("WOE", "Wilds of Eldraine", "2023", "Enchanting Tales bonus sheet uses set code WOT"),
        ("CMM", "Commander Masters", "2023", "Borderless/Frame Break/Etched have distinct #s"),
        ("LTR", "The Lord of the Rings: Tales of Middle-earth", "2023", "Ring Showcase & Borderless Poster have distinct #s"),
        ("MOM", "March of the Machine", "2023", "Multiverse Legends bonus sheet uses set code MUL"),
        ("ONE", "Phyrexia: All Will Be One", "2023", "Ichor Showcase & Oil Slick Foils have distinct #s"),
        ("DMR", "Dominaria Remastered", "2023", "Retro & Borderless have distinct #s"),
        ("BRO", "The Brothers' War", "2022", "Retro Artifacts bonus sheet uses set code BRR"),
        ("DMU", "Dominaria United", "2022", "Stained Glass Showcase #282+"),
        ("2X2", "Double Masters 2022", "2022", "Borderless #332-411; Etched Foils #412-571"),
        ("NEO", "Kamigawa: Neon Dynasty", "2022", "Ninja/Samurai/Soft Glow Showcase #303+"),
        ("MH2", "Modern Horizons 2", "2021", "Sketch, Retro Frame, Borderless have distinct #s"),
        ("PLST", "The List (Reprints)", "Various", "Has tiny Planeswalker icon in bottom-left corner!"),
    ]

    for idx, (code, name, era, notes) in enumerate(common_sets, start=2):
        ws3[f"A{idx}"] = code
        ws3[f"A{idx}"].font = Font(bold=True)
        ws3[f"B{idx}"] = name
        ws3[f"C{idx}"] = era
        ws3[f"D{idx}"] = notes
        for c in ("A", "B", "C", "D"):
            ws3[f"{c}{idx}"].border = thin_border

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    wb.save(output_path)
    print(f"Created Excel workbook: {output_path}")


if __name__ == "__main__":
    target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "MTG_Rapid_Entry_Template.xlsx")
    create_rapid_entry_workbook(target)
