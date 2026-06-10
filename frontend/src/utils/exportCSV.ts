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