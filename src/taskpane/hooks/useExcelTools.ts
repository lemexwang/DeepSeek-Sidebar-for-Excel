import { useCallback } from 'react';
import type { ToolExecutionResult } from '../lib/types';
import { excelTools } from '../lib/excel-tools';

/* global Excel */

function arrayToMarkdownTable(values: any[][]): string {
  if (!values || values.length === 0) return "";
  const header = "| " + values[0].map(v => String(v)).join(" | ") + " |";
  const sep = "| " + values[0].map(() => "---").join(" | ") + " |";
  const rows = values.slice(1).map(r => "| " + r.map(v => String(v)).join(" | ") + " |").join("\n");
  return header + "\n" + sep + (rows ? "\n" + rows : "");
}

export function useExcelTools(options?: { onPropose?: (p: any) => void }) {
  const executeTool = useCallback(async (toolName: string, input: any): Promise<ToolExecutionResult> => {
    try {
      if (toolName === 'web_search') {
        const n = Math.min(input.max_results || 3, 8);
        const res = await fetch(`http://localhost:14002/search?q=${encodeURIComponent(input.query)}&n=${n}`);
        if (!res.ok) return { success: false, error: `Search failed: ${res.status}` };
        return await res.json();
      }

      return await Excel.run(async (context) => {
        switch (toolName) {
          case 'read_range': {
            const sheet = input.worksheet ? context.workbook.worksheets.getItem(input.worksheet) : context.workbook.worksheets.getActiveWorksheet();
            const range = sheet.getRange(input.range);
            range.load('values, formulas, numberFormat, address');
            await context.sync();
            return { success: true, data: { address: range.address, values: range.values, formulas: range.formulas, formats: range.numberFormat } };
          }

          case 'propose_range_edit': {
            const sheet = context.workbook.worksheets.getActiveWorksheet();
            const range = sheet.getRange(input.range);
            range.load('values, address');
            await context.sync();
            
            const oldMarkdown = arrayToMarkdownTable(range.values);
            const newMarkdown = arrayToMarkdownTable(input.values);

            if (options?.onPropose) {
              options.onPropose({
                anchorId: range.address,
                oldMarkdown,
                newMarkdown,
                reason: input.reason
              });
            }
            return { success: true, proposed: true };
          }

          case 'write_range': {
            const sheet = input.worksheet ? context.workbook.worksheets.getItem(input.worksheet) : context.workbook.worksheets.getActiveWorksheet();
            const range = sheet.getRange(input.range);
            const targetRange = range.getResizedRange(input.values.length - 1, input.values[0].length - 1);
            targetRange.values = input.values;
            await context.sync();
            return { success: true, data: { range: targetRange.address, rowsWritten: input.values.length } };
          }

          case 'get_selection': {
            const range = context.workbook.getSelectedRange();
            range.load('address, values, formulas, rowCount, columnCount');
            await context.sync();
            return { success: true, data: { address: range.address, values: range.values, formulas: range.formulas, rowCount: range.rowCount, columnCount: range.columnCount } };
          }

          case 'get_workbook_info': {
            const sheets = context.workbook.worksheets;
            sheets.load('items/name');
            const activeSheet = context.workbook.worksheets.getActiveWorksheet();
            activeSheet.load('name');
            await context.sync();
            return { success: true, data: { worksheets: sheets.items.map(s => s.name), activeWorksheet: activeSheet.name } };
          }

          case 'create_table': {
            const sheet = context.workbook.worksheets.getActiveWorksheet();
            const table = sheet.tables.add(input.range, input.hasHeaders !== false);
            if (input.tableName) table.name = input.tableName;
            await context.sync();
            return { success: true, data: { tableName: table.name, range: input.range } };
          }

          case 'apply_formula': {
            const sheet = context.workbook.worksheets.getActiveWorksheet();
            const range = sheet.getRange(input.range);
            range.load('rowCount, columnCount');
            await context.sync();
            const formulas = Array(range.rowCount).fill(0).map(() => Array(range.columnCount).fill(input.formula));
            range.formulas = formulas;
            await context.sync();
            return { success: true, data: { range: input.range, cellsAffected: range.rowCount * range.columnCount } };
          }

          case 'format_range': {
            const sheet = context.workbook.worksheets.getActiveWorksheet();
            const range = sheet.getRange(input.range);
            if (input.format.numberFormat) range.numberFormat = [[input.format.numberFormat]];
            if (input.format.fontBold !== undefined) range.format.font.bold = input.format.fontBold;
            if (input.format.fontSize) range.format.font.size = input.format.fontSize;
            if (input.format.fillColor) range.format.fill.color = input.format.fillColor;
            if (input.format.fontColor) range.format.font.color = input.format.fontColor;
            await context.sync();
            return { success: true, data: { range: input.range } };
          }

          case 'insert_rows': {
            const sheet = context.workbook.worksheets.getActiveWorksheet();
            const range = sheet.getRangeByIndexes(input.index, 0, input.count, 1);
            range.insert(Excel.InsertShiftDirection.down);
            await context.sync();
            return { success: true, data: { index: input.index, count: input.count } };
          }

          case 'delete_rows': {
            const sheet = context.workbook.worksheets.getActiveWorksheet();
            const range = sheet.getRangeByIndexes(input.index, 0, input.count, 1000);
            range.delete(Excel.DeleteShiftDirection.up);
            await context.sync();
            return { success: true, data: { index: input.index, count: input.count } };
          }

          default:
            return { success: false, error: `Unknown tool: ${toolName}` };
        }
      });
    } catch (error: any) {
      console.error(`Error executing tool ${toolName}:`, error);
      return { success: false, error: error.message || 'An error occurred' };
    }
  }, [options]);

  return { tools: excelTools, executeTool };
}
