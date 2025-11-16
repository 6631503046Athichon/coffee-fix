export interface CSVExportOptions {
  filename: string;
  headers: string[];
  data: any[][];
}

export function exportToCSV({ filename, headers, data }: CSVExportOptions): void {
  const csvRows = [
    headers.join(','),
    ...data.map(row => row.join(','))
  ];

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Helper to convert objects to CSV rows
export function objectsToCSV<T extends Record<string, any>>(
  objects: T[],
  columns: (keyof T)[],
  filename: string
): void {
  const headers = columns.map(col => String(col));
  const data = objects.map(obj =>
    columns.map(col => {
      const value = obj[col];
      // Handle values with commas by wrapping in quotes
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return String(value ?? '');
    })
  );

  exportToCSV({ filename, headers, data });
}
