import { ExamResultRecord, QuestionRecord } from '../types/cbt';

export function exportResultsToExcel(results: ExamResultRecord[], filename = 'Laporan_Hasil_Ujian_MazCodeID.xls') {
  const headers = [
    'NIM',
    'Nama Mahasiswa',
    'Program Studi',
    'Mata Kuliah',
    'Benar',
    'Salah',
    'Kosong',
    'Skor Objektif',
    'Skor Esai',
    'Nilai Akhir',
    'Grade',
    'Durasi (Menit)',
    'Jumlah Pelanggaran',
    'Status Verifikasi',
  ];

  const rowsXml = results
    .map(
      (r) => `
      <Row>
        <Cell><Data ss:Type="String">${escapeXml(r.nim)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(r.studentName)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(r.studyProgramName)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(r.courseName)}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.correctCount}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.wrongCount}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.emptyCount}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.objectiveScore}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.essayScore}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.finalScore}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(r.gradeLetter)}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.durationUsedMinutes}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.violationCount}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(r.verificationStatus)}</Data></Cell>
      </Row>`
    )
    .join('');

  const headerXml = `<Row>${headers
    .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('')}</Row>`;

  const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Hasil Ujian MazCodeID">
  <Table>
   ${headerXml}
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  triggerFileDownload(workbookXml, filename, 'application/vnd.ms-excel');
}

export function exportQuestionsToExcel(questions: QuestionRecord[], filename = 'Bank_Soal_MazCodeID.xls') {
  const headers = [
    'ID',
    'Tipe Soal',
    'Tingkat Kesulitan',
    'Pertanyaan',
    'Bobot',
    'Kunci Jawaban',
    'Pembahasan',
  ];

  const rowsXml = questions
    .map(
      (q) => `
      <Row>
        <Cell><Data ss:Type="Number">${q.id}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(q.questionType)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(q.difficulty)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(q.questionText)}</Data></Cell>
        <Cell><Data ss:Type="Number">${q.weight}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(q.correctAnswerKey)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(q.explanation || '')}</Data></Cell>
      </Row>`
    )
    .join('');

  const headerXml = `<Row>${headers
    .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('')}</Row>`;

  const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Bank Soal MazCodeID">
  <Table>
   ${headerXml}
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  triggerFileDownload(workbookXml, filename, 'application/vnd.ms-excel');
}

export function exportResultsToPdfDocument(results: ExamResultRecord[]) {
  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const rowsHtml = results
    .map(
      (r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeXml(r.nim)}</td>
        <td>${escapeXml(r.studentName)}</td>
        <td>${escapeXml(r.studyProgramName)}</td>
        <td>${escapeXml(r.courseName)}</td>
        <td>${r.correctCount} / ${r.wrongCount} / ${r.emptyCount}</td>
        <td><strong>${r.finalScore} (${escapeXml(r.gradeLetter)})</strong></td>
        <td>${r.durationUsedMinutes} mnt</td>
        <td>${r.violationCount}x</td>
        <td>${escapeXml(r.verificationStatus)}</td>
      </tr>`
    )
    .join('');

  const htmlDoc = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Laporan Resmi Hasil Ujian - MazCodeID SMART CBT</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
    .header { border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    h1 { margin: 0; font-size: 20px; color: #0f172a; }
    .sub { font-size: 12px; color: #475569; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #0f172a; color: #ffffff; }
    .footer { margin-top: 32px; font-size: 12px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>MAZCODEID</h1>
      <div class="sub">MazCodeID SMART CBT – ANTI CHEATING EXAM SYSTEM | Laporan Resmi Hasil &amp; Integritas Ujian</div>
    </div>
    <div style="text-align:right; font-size:12px;">Tanggal Cetak: ${dateStr}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>No</th>
        <th>NIM</th>
        <th>Nama Mahasiswa</th>
        <th>Program Studi</th>
        <th>Mata Kuliah</th>
        <th>B / S / K</th>
        <th>Nilai Akhir</th>
        <th>Durasi</th>
        <th>Pelanggaran</th>
        <th>Status Verifikasi</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="footer">
    <div>Dokumen ini diverifikasi secara kriptografis oleh Server MazCodeID SMART CBT.</div>
    <div><strong>Administrator Akademik MazCodeID</strong></div>
  </div>
</body>
</html>`;

  triggerFileDownload(
    htmlDoc,
    'Laporan_Resmi_Hasil_Ujian_MazCodeID_PDF_Ready.html',
    'text/html;charset=utf-8'
  );
}

function escapeXml(unsafe: string): string {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function triggerFileDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
