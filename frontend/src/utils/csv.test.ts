import { describe, expect, it, vi } from 'vitest';
import { csvCell, buildCsv, downloadCsv } from './csv';
import { extractTableRows, Column } from '../components/Table';
import { extractLogbookRows } from '../components/LogbookView';
import { extractInvalidStudentRows } from '../components/panels/StudentListPanel';
import { LogEntry } from '../types';

describe('Safe CSV helpers (issue #747)', () => {
  describe('csvCell', () => {
    it('handles null and undefined as empty string', () => {
      expect(csvCell(null)).toBe('""');
      expect(csvCell(undefined)).toBe('""');
    });

    it('quotes normal strings and numbers', () => {
      expect(csvCell('Aarav')).toBe('"Aarav"');
      expect(csvCell(42)).toBe('"42"');
      expect(csvCell(0)).toBe('"0"');
    });

    it('escapes existing double quotes by doubling them', () => {
      expect(csvCell('Hello "World"')).toBe('"Hello ""World"""');
    });

    it('correctly wraps values with commas and newlines', () => {
      expect(csvCell('Delhi, India')).toBe('"Delhi, India"');
      expect(csvCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
      expect(csvCell('Line 1\r\nLine 2')).toBe('"Line 1\r\nLine 2"');
    });

    it('defuses spreadsheet formula injection prefixes (=, +, -, @, tab, CR)', () => {
      expect(csvCell('=1+1')).toBe('"\'=1+1"');
      expect(csvCell('=HYPERLINK("http://evil.com","click")')).toBe('"\'=HYPERLINK(""http://evil.com"",""click"")"');
      expect(csvCell('+cmd|/c calc')).toBe('"\'+cmd|/c calc"');
      expect(csvCell('-5+2')).toBe('"\' -5+2"'.replace(' ', ''));
      expect(csvCell('@SUM(A1:A10)')).toBe('"\'@SUM(A1:A10)"');
      expect(csvCell('\tleadingTab')).toBe('"\'\tleadingTab"');
      expect(csvCell('\rleadingCR')).toBe('"\'\rleadingCR"');
    });

    it('preserves Unicode and Hindi characters without corruption', () => {
      expect(csvCell('आरव शर्मा')).toBe('"आरव शर्मा"');
      expect(csvCell('कक्षा ३')).toBe('"कक्षा ३"');
    });
  });

  describe('buildCsv', () => {
    it('builds a CRLF-delimited CSV with quoted header and row cells', () => {
      const headers = ['ID', 'Name', 'Score'];
      const rows = [
        ['std-1', 'Aarav', 95],
        ['std-2', 'Priya, K.', 88],
      ];

      const csv = buildCsv(headers, rows);
      expect(csv).toBe(
        '"ID","Name","Score"\r\n' +
        '"std-1","Aarav","95"\r\n' +
        '"std-2","Priya, K.","88"'
      );
    });

    it('neutralizes hostile values across multiple columns in rows', () => {
      const headers = ['Name', 'Note'];
      const rows = [
        ['=cmd|\' /C calc\'!A0', '+12345'],
      ];

      const csv = buildCsv(headers, rows);
      expect(csv).toBe('"Name","Note"\r\n"\'=cmd|\' /C calc\'!A0","\'+12345"');
    });
  });

  describe('downloadCsv', () => {
    it('creates a Blob with UTF-8 BOM, triggers link click, and cleans up URL', async () => {
      let createdBlob: any = null;
      let revokedUrl: string | null = null;
      const fakeUrl = 'blob:http://localhost/test-uuid';

      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };

      const mockDocument = {
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
        createElement: vi.fn((tag: string) => {
          if (tag === 'a') return mockLink;
          return {};
        }),
      };

      const mockURL = {
        createObjectURL: vi.fn((blob: any) => {
          createdBlob = blob;
          return fakeUrl;
        }),
        revokeObjectURL: vi.fn((url: string) => {
          revokedUrl = url;
        }),
      };

      const globalAny = globalThis as any;
      const origDoc = globalAny.document;
      const origURL = globalAny.URL;

      globalAny.document = mockDocument;
      globalAny.URL = mockURL;

      try {
        downloadCsv('test.csv', '"Header"\r\n"Data"');

        expect(mockURL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(createdBlob).not.toBeNull();
        expect(createdBlob?.type).toBe('text/csv;charset=utf-8;');

        // Verify the actual UTF-8 BOM bytes (0xEF, 0xBB, 0xBF)
        const arrayBuffer = await createdBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        expect(bytes.length).toBeGreaterThanOrEqual(3);
        expect(bytes[0]).toBe(0xEF);
        expect(bytes[1]).toBe(0xBB);
        expect(bytes[2]).toBe(0xBF);

        expect(mockDocument.createElement).toHaveBeenCalledWith('a');
        expect(mockLink.download).toBe('test.csv');
        expect(mockLink.href).toBe(fakeUrl);
        expect(mockDocument.body.appendChild).toHaveBeenCalledWith(mockLink);
        expect(mockLink.click).toHaveBeenCalledTimes(1);
        expect(mockDocument.body.removeChild).toHaveBeenCalledWith(mockLink);
        expect(mockURL.revokeObjectURL).toHaveBeenCalledWith(fakeUrl);
        expect(revokedUrl).toBe(fakeUrl);
      } finally {
        globalAny.document = origDoc;
        globalAny.URL = origURL;
      }
    });
  });

  describe('Component export handlers verification', () => {
    it('Table extractTableRows exercises actual exportValue and accessor fallback', () => {
      interface MockRow {
        id: string;
        displayId?: string;
        name: string;
        score: number;
        level: number;
      }

      const columns: Column<MockRow>[] = [
        {
          header: 'ID',
          accessor: (s) => s.displayId || s.id,
          exportValue: (s) => s.displayId || s.id,
        },
        {
          header: 'Name',
          accessor: 'name',
        },
        {
          header: 'Level',
          accessor: (_s) => 'Badge JSX',
          exportValue: (s) => s.level ?? '',
        },
        {
          header: 'Score',
          accessor: (_s) => 'Formatted JSX',
          sortKey: 'score',
        },
      ];

      const sampleData: MockRow[] = [
        { id: 'uuid-1', displayId: 'GPS-01', name: 'Aarav', score: 98, level: 3 },
        { id: 'uuid-2', name: 'Priya', score: 85, level: 4 },
      ];

      const headers = columns.map(c => c.header);
      const rows = extractTableRows(sampleData, columns);

      const csv = buildCsv(headers, rows);
      expect(csv).toBe(
        '"ID","Name","Level","Score"\r\n' +
        '"GPS-01","Aarav","3","98"\r\n' +
        '"uuid-2","Priya","4","85"'
      );
    });

    it('LogbookView extractLogbookRows exercises actual export mapping and column ordering', () => {
      const headers = ['Timestamp', 'Log ID', 'User Email', 'User Role', 'Location School ID', 'Location School Name', 'Activity', 'Status', 'Details'];
      const mockLog: LogEntry = {
        timestamp: '2026-10-11T12:00:00.000Z',
        id: 'log-101',
        userId: 'usr-1',
        userEmail: 'teacher,primary@school.org', // contains comma
        userRole: 'teacher' as any,
        schoolId: '',
        schoolName: '',
        activityType: 'LOGIN' as any,
        status: 'SUCCESS' as any,
        details: '=HYPERLINK("http://evil.com")',
      };

      const rows = extractLogbookRows([mockLog]);

      expect(rows[0]).toHaveLength(9);
      expect(rows[0][0]).toBe('2026-10-11T12:00:00.000Z');
      expect(rows[0][1]).toBe('log-101');
      expect(rows[0][2]).toBe('teacher,primary@school.org');
      expect(rows[0][3]).toBe('teacher');
      expect(rows[0][4]).toBe('National');
      expect(rows[0][5]).toBe('National Framework');
      expect(rows[0][6]).toBe('LOGIN');
      expect(rows[0][7]).toBe('SUCCESS');
      expect(rows[0][8]).toBe('=HYPERLINK("http://evil.com")');

      const csv = buildCsv(headers, rows);
      expect(csv).toContain('"teacher,primary@school.org"');
      expect(csv).toContain('"\'=HYPERLINK(""http://evil.com"")"');
      expect(csv).toContain('"National"');
      expect(csv).toContain('"National Framework"');
    });

    it('StudentListPanel extractInvalidStudentRows exercises actual invalid student mapping', () => {
      const headers = ['name', 'section', 'age', 'classGroup', 'aadharNumber', 'address', 'reason'];
      const parsedRows = [
        { name: '=Malicious Student', section: 'A', age: 7, classGroup: 'Class 2', aadharNumber: '999988887777', address: 'Village, Sector 1' },
        { name: 'Valid Student', section: 'B', age: 8, classGroup: 'Class 3', aadharNumber: '111122223333', address: 'Town' },
        { name: '+Second Invalid', section: 'C', age: 9, classGroup: 'Class 4', aadharNumber: '444455556666', address: 'City' },
      ];
      // Invalid rows interleaved: row 1 and row 3 are invalid, row 2 is valid
      const invalidRows = [parsedRows[0], parsedRows[2]];
      const csvResults = {
        results: [
          { row: 1, status: 'failed', reason: 'Invalid Aadhaar' },
          { row: 2, status: 'success' },
          { row: 3, status: 'failed', reason: 'Invalid Age' },
        ],
      };

      const rows = extractInvalidStudentRows(invalidRows, parsedRows, csvResults);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual([
        '=Malicious Student',
        'A',
        7,
        'Class 2',
        '999988887777',
        'Village, Sector 1',
        'Invalid Aadhaar',
      ]);
      expect(rows[1]).toEqual([
        '+Second Invalid',
        'C',
        9,
        'Class 4',
        '444455556666',
        'City',
        'Invalid Age',
      ]);

      const csv = buildCsv(headers, rows);
      expect(csv).toBe(
        '"name","section","age","classGroup","aadharNumber","address","reason"\r\n' +
        '"\'=Malicious Student","A","7","Class 2","999988887777","Village, Sector 1","Invalid Aadhaar"\r\n' +
        '"\'+Second Invalid","C","9","Class 4","444455556666","City","Invalid Age"'
      );
    });
  });
});
