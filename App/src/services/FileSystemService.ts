import { FileSystemItem } from '../types';
import { RecentProjectsService } from './RecentProjectsService';
import { FileReaderService } from './FileReaderService';

export class FileSystemService {
  private static readonly API_URL = 'http://localhost:8000';
  private static filePaths = new Map<string, string>();
  private static loadedFolders = new Set<string>();
  private static currentDirectory: string | null = null;
  private static fileCache: Map<string, string> = new Map();

  private static normalizePath(path: string): string {
    // Normalize the path to use forward slashes
    let normalized = path.replace(/\\/g, '/');
    
    // If it's a root path (e.g. /file.txt), keep the leading slash
    if (path.startsWith('/') || path.startsWith('\\')) {
      return normalized;
    }
    
    // Otherwise, remove any leading slashes
    return normalized.replace(/^\/+/, '');
  }

  static async fetchFolderContents(path: string): Promise<{ 
    items: Record<string, FileSystemItem>; 
    rootId: string; 
    errors: string[] 
  } | null> {
    try {
      await this.refreshStructure();
      const normalizedPath = this.normalizePath(path);
      console.log('Fetching contents for normalized path:', normalizedPath);

      const response = await fetch(`${this.API_URL}/fetch-folder-contents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          path: normalizedPath,
          currentDir: this.currentDirectory 
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Failed to fetch folder contents:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          path: normalizedPath
        });
        return null;
      }

      const data = await response.json();
      
      // Store file paths
      Object.values(data.items).forEach((item: FileSystemItem) => {
        if (item.type === 'file') {
          this.filePaths.set(item.id, this.normalizePath(item.path));
        }
      });

      this.loadedFolders.add(normalizedPath);
      return data;
    } catch (error) {
      console.error('Error fetching folder contents:', error);
      return null;
    }
  }

  static isFolderLoaded(path: string): boolean {
    return this.loadedFolders.has(path);
  }

  static clearLoadedFolders() {
    this.loadedFolders.clear();
  }

  static setCurrentDirectory(path: string) {
    this.currentDirectory = path;
    console.log('Set current directory to:', path);
  }

  static async openDirectory(): Promise<{ 
    items: Record<string, FileSystemItem>; 
    rootId: string;
    path: string;
    errors: string[] 
  } | null> {
    try {
      await this.refreshStructure();
      // Reset file paths when opening a new directory
      this.filePaths.clear();
      this.currentDirectory = null;

      const response = await fetch(`${this.API_URL}/open-directory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to open directory: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Set current directory
      this.setCurrentDirectory(data.path);

      // Store file paths
      Object.values(data.items).forEach((item: FileSystemItem) => {
        if (item.type === 'file') {
          this.filePaths.set(item.id, this.normalizePath(item.path));
        }
      });

      return data;
    } catch (error) {
      console.error('Error opening directory:', error);
      return null;
    }
  }

  static async openSpecificDirectory(path: string): Promise<{ 
    items: Record<string, FileSystemItem>; 
    rootId: string; 
    errors: string[] 
  } | null> {
    try {
      await this.refreshStructure();
      // Reset file paths when opening a new directory
      this.filePaths.clear();

      const response = await fetch(`${this.API_URL}/open-specific-directory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path })
      });

      if (!response.ok) {
        throw new Error(`Failed to open directory: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Set current directory
      this.setCurrentDirectory(path);

      // Store file paths
      Object.values(data.items).forEach((item: FileSystemItem) => {
        if (item.type === 'file') {
          this.filePaths.set(item.id, this.normalizePath(item.path));
        }
      });

      return data;
    } catch (error) {
      console.error('Error opening directory:', error);
      return null;
    }
  }

  static async readFile(fileId: string): Promise<string | null> {
    try {
      await this.refreshStructure();
      // Clear the cache for this specific file
      this.fileCache.delete(fileId);
      
      const filePath = this.filePaths.get(fileId);
      if (!filePath) {
        console.error(`No path found for file ID: ${fileId}`);
        return null;
      }

      const normalizedPath = this.normalizePath(filePath);
      console.log('Reading file:', { fileId, filePath, normalizedPath, currentDir: this.currentDirectory });
      
      // For root paths, use the path as is without modifying current directory
      const effectiveCurrentDir = this.currentDirectory;
      if (!effectiveCurrentDir && (filePath.startsWith('/') || filePath.startsWith('\\'))) {
        console.log('Reading root file with path:', normalizedPath);
      }
      
      return await FileReaderService.readFile(normalizedPath);
      
    } catch (error) {
      console.error(`Error reading file ${fileId}:`, error);
      return null;
    }
  }

  static async saveFile(path: string, content: string): Promise<{ success: boolean, content: string }> {
    try {
      await this.refreshStructure();
      const normalizedPath = this.normalizePath(path);
      
      // Don't require currentDirectory for root paths
      const isRootPath = path.startsWith('/') || path.startsWith('\\');
      if (!this.currentDirectory && !isRootPath) {
        throw new Error('No directory opened');
      }

      const response = await fetch(`${this.API_URL}/save-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          path: normalizedPath,
          content,
          currentDir: isRootPath ? null : this.currentDirectory
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Server error:', {
          status: response.status,
          statusText: response.statusText
        });
        if (errorData) {
          console.error('Error details:', errorData);
        }
        throw new Error(`Failed to save file: ${response.statusText}`);
      }

      // Return both success status and the saved content
      return { success: true, content };
    } catch (error) {
      console.error(`Error saving file ${path}:`, error);
      throw error;
    }
  }

  static async createFile(parentId: string, name: string): Promise<{ id: string, file: FileSystemItem } | null> {
    try {
      await this.refreshStructure();
      const response = await fetch(`${this.API_URL}/create-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parentId,
          name,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create file: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating file:', error);
      return null;
    }
  }

  static async createDirectory(parentId: string, name: string): Promise<{ id: string, directory: FileSystemItem } | null> {
    try {
      await this.refreshStructure();
      const response = await fetch(`${this.API_URL}/create-directory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parentId,
          name,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create directory: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating directory:', error);
      return null;
    }
  }

  static async openFile(): Promise<{ content: string, filename: string, fullPath: string, id: string } | null> {
    try {
      await this.refreshStructure();
      const response = await fetch(`${this.API_URL}/open-file`, {
        method: 'POST',
        headers: {
          'Accept': 'text/plain'
        }
      });

      if (!response.ok) {
        console.error('Failed to open file:', response.statusText);
        return null;
      }

      // Log all response headers for debugging
      console.log('Response headers:', Array.from(response.headers.entries()));

      const content = await response.text();
      const filename = response.headers.get('X-Filename');
      const fullPath = response.headers.get('X-Full-Path');
      
      console.log('Received headers:', { filename, fullPath });

      if (!filename || !fullPath) {
        console.error('Missing required headers:', {
          filename: filename || 'missing',
          fullPath: fullPath || 'missing'
        });
        return null;
      }

      // Generate a unique ID for the file
      const id = `file_${Date.now()}`;
      
      // Store the normalized full path in our map
      const normalizedPath = this.normalizePath(fullPath);
      this.filePaths.set(id, normalizedPath);
      
      console.log('Stored file path:', { id, path: normalizedPath, original: fullPath });
      
      return { content, filename, fullPath, id };
    } catch (error) {
      console.error('Error opening file:', error);
      return null;
    }
  }

  static async deleteItem(path: string): Promise<boolean> {
    try {
      await this.refreshStructure();
      const response = await fetch(`${this.API_URL}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to delete item:', errorData);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting item:', error);
      return false;
    }
  }

  static async readText(filePath: string): Promise<string | null> {
    try {
      await this.refreshStructure();
      console.log('Reading text file:', filePath);
      return await FileReaderService.readFile(filePath);
    } catch (error) {
      console.error(`Error reading text file:`, error);
      return null;
    }
  }

  static async renameItem(path: string, newName: string): Promise<{ success: boolean, newPath: string | null }> {
    try {
      await this.refreshStructure();
      const response = await fetch(`${this.API_URL}/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          new_name: newName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to rename item:', errorData);
        return { success: false, newPath: null };
      }

      const data = await response.json();
      return { 
        success: data.success, 
        newPath: data.new_path 
      };
    } catch (error) {
      console.error('Error renaming item:', error);
      return { success: false, newPath: null };
    }
  }

  static getCurrentDirectory(): string | null {
    return this.currentDirectory;
  }

  static async refreshStructure() {
    if (!this.getCurrentDirectory()) {
      return null;
    }

    try {
      // Clear all caches
      this.loadedFolders.clear();
      this.fileCache.clear();
      this.filePaths.clear();  // Also clear file paths

      const response = await fetch(`${this.API_URL}/open-specific-directory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: this.getCurrentDirectory()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh directory');
      }

      const data = await response.json();

      // Update file paths after refresh
      Object.values(data.items).forEach((item: FileSystemItem) => {
        if (item.type === 'file') {
          this.filePaths.set(item.id, this.normalizePath(item.path));
        }
      });

      return data;
    } catch (error) {
      console.error('Error refreshing directory:', error);
      throw error;
    }
  }
}