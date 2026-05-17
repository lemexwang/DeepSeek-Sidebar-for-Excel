# DeepSeek Excel Sidebar

An AI-powered Excel add-in that brings DeepSeek directly into Microsoft Excel. Analyze data, write formulas, create charts, apply formatting, and automate spreadsheet tasks — all from a sidebar panel.

## Features

- Chat with DeepSeek inside Excel
- Read and write cell data via natural language
- 39 Excel tools: read/write ranges, create tables and charts, apply formulas, conditional formatting, pivot tables, data validation, and more
- Smart context: automatically reads your selected cells and workbook structure

## Architecture

```
Excel (Office.js)  →  Vite dev server (https://localhost:3002)
                               ↓ /v1/* proxy
                    DeepSeek proxy (http://localhost:14002)
                               ↓
                    DeepSeek API (api.deepseek.com)
```

The local proxy (`proxy.py`) converts Anthropic SDK format to DeepSeek API format, enabling tool use and streaming.

---

## Installation

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.8+
- **Microsoft Excel** (Mac or Windows, Microsoft 365)
- A **DeepSeek API key** from [platform.deepseek.com](https://platform.deepseek.com/)

### 1. Clone and install

```bash
git clone https://github.com/lemexwang/DeepSeek-Sidebar-for-Excel.git
cd DeepSeek-Sidebar-for-Excel
npm install
```

### 2. Install proxy dependencies (optional — needed for web search)

```bash
pip3 install ddgs
```

### 3. Trust the dev certificate

The add-in runs on HTTPS localhost. Install the dev certificate once:

```bash
npx office-addin-dev-certs install
```

---

## Running on Mac

### Start the dev server

```bash
export DEEPSEEK_API_KEY=sk-your-key-here
./start.sh
```

Or pass the key inline:

```bash
DEEPSEEK_API_KEY=sk-your-key-here ./start.sh
```

The script starts both the proxy (port 14002) and the Vite dev server (port 3002).

### Sideload the add-in in Excel (Mac)

1. Open **Microsoft Excel**
2. Go to **Insert → Add-ins → My Add-ins**
3. Click **Upload My Add-in** (bottom-left of the dialog)
4. Select `manifest.xml` from this repo folder
5. Click **Upload**

The **Excel DeepSeek Sidebar** will appear. Click the button in the Home ribbon to open it.

> **Tip:** You only need to sideload once. Excel remembers the add-in between sessions as long as the dev server is running.

---

## Running on Windows

### Start the dev server

In **PowerShell** or **Command Prompt**:

```powershell
$env:DEEPSEEK_API_KEY = "sk-your-key-here"
bash ./start.sh
```

If you don't have bash, start the two services manually:

**Terminal 1 — Proxy:**
```powershell
$env:DEEPSEEK_API_KEY = "sk-your-key-here"
python proxy.py
```

**Terminal 2 — Dev server:**
```powershell
npm run dev
```

### Sideload the add-in in Excel (Windows) — Shared Folder method

1. Create a folder anywhere, e.g. `C:\OfficeAddins\DeepSeekExcel`
2. Copy `manifest.xml` into that folder
3. In Excel, go to **File → Options → Trust Center → Trust Center Settings**
4. Click **Trusted Add-in Catalogs**
5. In **Catalog Url**, enter the folder path: `C:\OfficeAddins\DeepSeekExcel`
6. Click **Add catalog**, check **Show in Menu**, click **OK**
7. Restart Excel
8. Go to **Insert → My Add-ins → Shared Folder tab**
9. Select **Excel DeepSeek Sidebar** and click **Add**

> **Alternative (Windows):** If you have `office-addin-debugging` installed, you can also run `npm start` which handles sideloading automatically.

### Trust the HTTPS certificate (Windows)

The Vite dev server uses a self-signed certificate. On first run:

```powershell
npx office-addin-dev-certs install
```

If you see SSL errors in the add-in, open `https://localhost:3002` in Edge or Chrome and click **Advanced → Proceed** to trust the cert.

---

## Configuration

### API Key

Enter your DeepSeek API key in the add-in's **Settings** panel (gear icon in the sidebar header). The key is stored in browser localStorage — it never leaves your machine except when calling the DeepSeek API.

### Ports

| Service | Port | Config location |
|---------|------|-----------------|
| Vite dev server | 3002 | `vite.config.ts` |
| DeepSeek proxy | 14002 | `proxy.py` (`PROXY_PORT` env var) |

To change the proxy port: `PROXY_PORT=15000 python3 proxy.py`

---

## Available Tools

DeepSeek can use 39 Excel tools in this add-in:

| Category | Tools |
|----------|-------|
| Read/Write | `read_range`, `write_range`, `get_selection`, `copy_range`, `clear_range` |
| Workbook info | `get_workbook_info`, `manage_worksheet` |
| Tables & structure | `create_table`, `create_pivot_table`, `merge_cells`, `freeze_panes` |
| Charts | `create_chart`, `add_sparkline` |
| Formulas | `apply_formula`, `create_named_range`, `calculate_statistics` |
| Formatting | `format_range`, `apply_borders`, `set_alignment`, `autofit_columns`, `apply_conditional_formatting` |
| Data operations | `sort_range`, `apply_autofilter`, `find_replace`, `remove_duplicates`, `transpose_range`, `text_to_columns` |
| Rows & columns | `insert_rows`, `delete_rows`, `hide_unhide` |
| Validation | `add_data_validation`, `check_duplicates` |
| Annotations | `add_comment`, `add_hyperlink`, `protect_range` |
| Analysis | `generate_expense_summary`, `convert_currency`, `export_to_csv`, `web_search` |

---

## Development

```bash
npm run dev      # Start dev server with hot reload
npm run build    # Production build
npm run lint     # ESLint
```

Logs are written to `/tmp/deepseek-proxy.log` and `/tmp/excel-addin-dev.log` when using `start.sh`.

---

## Troubleshooting

**Add-in shows blank or "Add-in Error"**
- Make sure the dev server is running: `curl -k https://localhost:3002`
- Check dev server log: `tail -f /tmp/excel-addin-dev.log`

**"Failed to fetch" or API errors**
- Make sure the proxy is running: `curl http://localhost:14002`
- Verify your `DEEPSEEK_API_KEY` is set correctly

**Certificate errors on Mac**
- Run `npx office-addin-dev-certs install` and restart Excel

**Certificate errors on Windows**
- Open `https://localhost:3002` in Edge, proceed past the warning, then reload the add-in
