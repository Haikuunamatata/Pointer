export interface FileSystemItem {
  id: string;
  name: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileSystemItem[];
  parentId: string | null;
  path: string;
}

export interface FileSystemState {
  items: Record<string, FileSystemItem>;
  currentFileId: string | null;
  rootId: string;
  terminalOpen: boolean;
} 