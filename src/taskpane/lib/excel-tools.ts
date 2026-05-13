import type { ExcelTool } from './types';

export const excelTools: ExcelTool[] = [
  {
    name: 'read_range',
    description: 'Read values from a range of cells in Excel. Returns the values, formulas, and number formats.',
    input_schema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'Cell range in A1 notation (e.g., "A1:B10" or "A1")' },
        worksheet: { type: 'string', description: 'Worksheet name (optional, uses active sheet if not specified)' },
      },
      required: ['range'],
    },
  },
  {
    name: 'propose_range_edit',
    description: 'Propose an edit to a range of cells for user review. Does NOT modify the document until user accepts.',
    input_schema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'Range to edit (e.g. "A1:C5")' },
        values: { type: 'array', description: 'New 2D array of values', items: { type: 'array' } },
        reason: { type: 'string', description: 'Explanation of the change' }
      },
      required: ['range', 'values']
    }
  },
  {
    name: 'write_range',
    description: 'Write values to a range of cells in Excel. Use ONLY if user requested immediate changes.',
    input_schema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'Starting cell or range' },
        values: { type: 'array', description: '2D array of values', items: { type: 'array' } },
        worksheet: { type: 'string', description: 'Worksheet name' },
      },
      required: ['range', 'values'],
    },
  },
  {
    name: 'get_selection',
    description: 'Get currently selected cells.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_workbook_info',
    description: 'Get sheet names and active sheet.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_table',
    description: 'Create a formatted table.',
    input_schema: {
      type: 'object',
      properties: {
        range: { type: 'string' },
        tableName: { type: 'string' },
        hasHeaders: { type: 'boolean' },
      },
      required: ['range'],
    },
  },
  {
    name: 'create_chart',
    description: 'Create a chart.',
    input_schema: {
      type: 'object',
      properties: {
        dataRange: { type: 'string' },
        chartType: { type: 'string', enum: ['ColumnClustered', 'Line', 'Pie', 'BarClustered'] },
        title: { type: 'string' },
      },
      required: ['dataRange', 'chartType'],
    },
  },
  {
    name: 'apply_formula',
    description: 'Apply formula to range.',
    input_schema: {
      type: 'object',
      properties: {
        range: { type: 'string' },
        formula: { type: 'string' },
      },
      required: ['range', 'formula'],
    },
  },
  {
    name: 'format_range',
    description: 'Apply formatting.',
    input_schema: {
      type: 'object',
      properties: {
        range: { type: 'string' },
        format: {
          type: 'object',
          properties: {
            numberFormat: { type: 'string' },
            fontBold: { type: 'boolean' },
            fontSize: { type: 'number' },
            fillColor: { type: 'string' },
            fontColor: { type: 'string' },
          },
        },
      },
      required: ['range', 'format'],
    },
  },
  {
    name: 'insert_rows',
    description: 'Insert rows.',
    input_schema: {
      type: 'object',
      properties: { index: { type: 'number' }, count: { type: 'number' } },
      required: ['index', 'count'],
    },
  },
  {
    name: 'delete_rows',
    description: 'Delete rows.',
    input_schema: {
      type: 'object',
      properties: { index: { type: 'number' }, count: { type: 'number' } },
      required: ['index', 'count'],
    },
  },
  {
    name: 'sort_range',
    description: 'Sort range.',
    input_schema: {
      type: 'object',
      properties: { range: { type: 'string' }, sortOn: { type: 'string' }, ascending: { type: 'boolean' } },
      required: ['range', 'sortOn'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        max_results: { type: 'number' },
      },
      required: ['query'],
    },
  },
];
