# MTG Rapid Collector-Number Lister & TCGplayer Level 4 CSV Tool

A high-speed, low-error entry toolkit for Magic: The Gathering sellers with **TCGplayer Level 4 CSV** access who sort cards by set and want to avoid robotic sorters or slow camera misidentifications on Showcase/Borderless/Retro variants.

## Features

1. **Zero-Latency Browser Rapid-Entry App ([index.html](index.html), [app.js](app.js), [styles.css](styles.css))**
   - **Full-Set Scryfall Caching**: Caches an entire Magic set in memory once so every Collector Number resolves in `0ms` as you type on your numpad.
   - **Sticky Batch Settings**: Lock in your active Set Code (e.g., `MH3`), Finish (`Normal`, `Foil`, `Etched`), Condition (`NM`, `LP`, `MP`, `HP`, `DMG`), and Physical Box Location (`Box 1 - Row A`).
   - **Rapid Numpad Shortcuts**:
     - Type Collector Number + `Enter` (e.g. `214` or `234*4` for quantity 4).
     - Press `+` on an empty input to increment the last card's quantity.
     - Press `F` on an empty input to cycle the last card's Finish (`Normal` / `Foil` / `Etched`).
     - Press `L`, `M`, or `H` on an empty input to toggle the last card's Condition (`LP`, `MP`, `HP`).
     - Press `Ctrl+Z` / `Cmd+Z` to undo the last entry.
   - **Visual & Audio Error Prevention**: Displays the card image immediately, plays distinct audio chimes for normal vs. high-value (`$5+`) hits, and flashes a warning badge on **Borderless**, **Showcase**, **Extended Art**, or **Retro Frame** collector numbers.
   - **In-Browser TCGplayer Level 4 CSV Merger**: Drop in your exported TCGplayer Filtered Pricing CSV (`Pricing` -> `Export Filtered CSV`) and export a ready-to-upload Level 4 Staged Inventory CSV with `Add to Quantity` and your custom pricing rules + minimum floor applied.

2. **Sticky-Batch Excel Workbook & Python Matcher ([MTG_Rapid_Entry_Template.xlsx](MTG_Rapid_Entry_Template.xlsx), [generate_spreadsheet.py](generate_spreadsheet.py), [match_tcgplayer_csv.py](match_tcgplayer_csv.py))**
   - Pre-built Excel template where Set Code, Finish, Condition, and Box Location automatically inherit from the row above so you only type the Collector Number in Column B.
   - Command-line script `match_tcgplayer_csv.py` to consolidate duplicate entries and merge against your TCGplayer Pricing CSV.

## Quick Start

### Option A: Browser Rapid-Entry App
Open `index.html` in any modern browser:
```bash
open index.html
```

### Option B: Excel Template + Python CLI Matcher
1. Open `MTG_Rapid_Entry_Template.xlsx` (or regenerate a fresh copy with `python3 generate_spreadsheet.py`).
2. Enter your cards in Tab 1 (`1_Rapid_Entry`) and configure your floor/multiplier in Tab 2 (`2_Pricing_Rules`).
3. Run the matcher against your exported TCGplayer Pricing CSV:
```bash
python3 match_tcgplayer_csv.py \
  --input MTG_Rapid_Entry_Template.xlsx \
  --tcg-csv your_tcgplayer_export.csv \
  --output TCGplayer_Level4_Upload_Ready.csv
```
