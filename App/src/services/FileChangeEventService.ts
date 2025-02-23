export type FileChangeListener = (filePath: string, oldContent: string, newContent: string) => void;

export class FileChangeEventService {
  private static listeners: FileChangeListener[] = [];

  public static subscribe(listener: FileChangeListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public static emitChange(filePath: string, oldContent: string, newContent: string) {
    this.listeners.forEach(listener => {
      try {
        listener(filePath, oldContent, newContent);
      } catch (error) {
        console.error('Error in file change listener:', error);
      }
    });
  }
} 