const API_URL = 'http://localhost:8000';

export class FileReaderService {
  static async readFile(filePath: string): Promise<string | null> {
    try {
      console.log('Reading file:', filePath);
      
      const response = await fetch(`${API_URL}/read-file?path=${encodeURIComponent(filePath)}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        console.error('Server error:', {
          status: response.status,
          statusText: response.statusText
        });
        return null;
      }

      const content = await response.text();
      if (!content) {
        console.error('Empty file content received');
        return '';
      }

      return content;
      
    } catch (error) {
      console.error(`Error reading file:`, error);
      return null;
    }
  }
} 