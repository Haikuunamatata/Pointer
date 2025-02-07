import { FileSystemService } from './FileSystemService';
import { lmStudio } from './LMStudioService';
import { FileChangeEventService } from './FileChangeEventService';

interface FileOperation {
  path: string;
  content: string;
}

export class AIFileService {
  private static extractFileOperations(aiResponse: string): FileOperation[] {
    const operations: FileOperation[] = [];
    const regex = /Pointer:Code\+(.*?):start\s*([\s\S]*?)\s*Pointer:Code\+\1:end/g;
    let match;

    while ((match = regex.exec(aiResponse)) !== null) {
      const [_, filename, content] = match;
      operations.push({
        path: filename.trim(),
        content: content.trim()
      });
    }

    return operations;
  }

  private static async fileExists(path: string): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:8000/file-exists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });
      
      if (!response.ok) {
        return false;
      }
      
      const result = await response.json();
      return result.exists;
    } catch {
      return false;
    }
  }

  private static async createDirectoryIfNeeded(filePath: string): Promise<void> {
    const directoryPath = filePath.split('/').slice(0, -1).join('/');
    if (directoryPath) {
      try {
        await fetch('http://localhost:8000/create-directory', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            parentId: 'root',
            name: directoryPath,
          }),
        });
      } catch (error) {
        console.log('Directory might already exist:', error);
      }
    }
  }

  private static isCompleteFile(content: string): boolean {
    // Check if content appears to be a complete file
    // Look for indicators like imports at the top, multiple functions/classes, etc.
    const hasImports = /^(import|from|require)/.test(content);
    const hasMultipleFunctions = (content.match(/\b(function|class|const\s+\w+\s*=\s*\(|let\s+\w+\s*=\s*\()/g) || []).length > 1;
    const hasExports = /\b(export|module\.exports)\b/.test(content);
    
    return hasImports || hasMultipleFunctions || hasExports;
  }

  private static async getFileStructure(): Promise<string> {
    try {
      const currentDir = FileSystemService.getCurrentDirectory();
      if (!currentDir) {
        return "No directory opened.";
      }

      const response = await fetch(`http://localhost:8000/files?${new URLSearchParams({
        currentDir
      })}`);

      if (!response.ok) {
        throw new Error('Failed to fetch file structure');
      }

      const files = await response.json();
      return files
        .sort((a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path))
        .map((file: { path: string }) => {
          const parts = file.path.split('/');
          const indent = '  '.repeat(parts.length - 1);
          return `${indent}${parts[parts.length - 1]}`;
        })
        .join('\n');
    } catch (error) {
      console.error('Error getting file structure:', error);
      return "Error fetching file structure.";
    }
  }

  private static async mergeChanges(existingContent: string, newContent: string, filePath: string): Promise<string> {
    const fileExtension = filePath.split('.').pop() || '';
    const fileStructure = await this.getFileStructure();
    
    // Create a prompt for the AI to merge the changes
    const mergePrompt = `You are a code merging expert. You need to analyze and merge code changes intelligently.

Current Project Structure:
${fileStructure}

EXISTING FILE (${filePath}):
\`\`\`${fileExtension}
${existingContent}
\`\`\`

NEW CHANGES:
\`\`\`${fileExtension}
${newContent}
\`\`\`

Task:
1. If the new changes are a complete file, determine if they should replace the existing file entirely
2. If the new changes are partial (e.g., a single function), merge them into the appropriate location
3. Preserve any existing functionality that isn't being explicitly replaced
4. Ensure the merged code is properly formatted and maintains consistency
5. Consider the project structure when merging (e.g., for imports)

Return ONLY the final merged code without any explanations. The code should be ready to use as-is.`;

    try {
      const response = await lmStudio.createChatCompletion({
        model: 'deepseek-coder-v2-lite-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a code merging expert. Return only the merged code without any explanations.'
          },
          {
            role: 'user',
            content: mergePrompt
          }
        ],
        temperature: 0.3,
      });

      const aiContent = response.choices[0]?.message?.content;
      const cleanContent = (content: string) => content.trim().replace(/^```[\w-]*\n/, '').replace(/```$/, '');
      
      return typeof aiContent === 'string' ? cleanContent(aiContent) : cleanContent(newContent);
    } catch (error) {
      console.error('Error merging changes:', error);
      if (this.isCompleteFile(newContent)) {
        return newContent;
      } else {
        return `${existingContent}\n\n// New changes added automatically:\n${newContent}`;
      }
    }
  }

  private static async prepareNewFile(content: string, filePath: string): Promise<string> {
    const fileExtension = filePath.split('.').pop() || '';
    const fileStructure = await this.getFileStructure();
    
    const formatPrompt = `You are a code formatting expert. You need to prepare this new file for creation.

Current Project Structure:
${fileStructure}

NEW FILE (${filePath}):
\`\`\`${fileExtension}
${content}
\`\`\`

Task:
1. Ensure the code is properly formatted and follows best practices
2. Add any necessary imports or dependencies that might be missing
3. Add appropriate comments or documentation if needed
4. Verify the code structure is complete and valid
5. Consider the project structure for imports and dependencies
6. Do not make major functional changes

Return ONLY the final formatted code without any explanations. The code should be ready to use as-is.`;

    try {
      const response = await lmStudio.createChatCompletion({
        model: 'deepseek-coder-v2-lite-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a code formatting expert. Return only the formatted code without any explanations.'
          },
          {
            role: 'user',
            content: formatPrompt
          }
        ],
        temperature: 0.3,
      });

      const aiContent = response.choices[0]?.message?.content;
      const cleanContent = (content: string) => content.trim().replace(/^```[\w-]*\n/, '').replace(/```$/, '');
      
      return typeof aiContent === 'string' ? cleanContent(aiContent) : cleanContent(content);
    } catch (error) {
      console.error('Error formatting new file:', error);
      return content;
    }
  }

  private static async refreshEverything(): Promise<void> {
    try {
      // First refresh the file structure
      await FileSystemService.refreshStructure();
      
      // Clear loaded folders to force a fresh fetch
      FileSystemService.clearLoadedFolders();
      
      // Get current directory and reload its contents
      const currentDir = FileSystemService.getCurrentDirectory();
      if (currentDir) {
        await FileSystemService.fetchFolderContents(currentDir);
      }

      // Get the current file if any
      const currentFile = window.getCurrentFile?.();
      if (currentFile) {
        // Get the file ID from the path
        const fileId = Object.entries(window.fileSystem?.items || {})
          .find(([_, item]) => item.path === currentFile.path)?.[0];

        // If we found the file ID and have the reload function, use it
        if (fileId && window.reloadFileContent) {
          await window.reloadFileContent(fileId);
        } else {
          // Fallback to direct file read
          const response = await fetch(`http://localhost:8000/read-file?path=${encodeURIComponent(currentFile.path)}`);
          if (response.ok) {
            const updatedContent = await response.text();
            if (window.editor?.setValue) {
              window.editor.setValue(updatedContent);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing everything:', error);
    }
  }

  public static async processAIResponse(aiResponse: string): Promise<void> {
    const operations = this.extractFileOperations(aiResponse);
    
    for (const operation of operations) {
      try {
        const normalizedPath = operation.path.replace(/\\/g, '/');
        const isRootPath = operation.path.startsWith('/') || operation.path.startsWith('\\');
        
        if (!isRootPath) {
          await this.createDirectoryIfNeeded(operation.path);
        }
        
        const exists = await this.fileExists(normalizedPath);
        
        if (exists) {
          // Build query parameters for reading the file
          const params = new URLSearchParams();
          params.append('path', normalizedPath);
          
          // Only append currentDir if not a root path
          const currentDir = FileSystemService.getCurrentDirectory();
          if (currentDir && !isRootPath) {
            params.append('currentDir', currentDir);
          }
          
          const response = await fetch(`http://localhost:8000/read-file?${params}`);
          
          if (!response.ok) {
            console.error(`Failed to read existing file: ${normalizedPath}`);
            continue;
          }
          
          const existingContent = await response.text();
          let mergedContent: string;
          
          if (this.isCompleteFile(operation.content)) {
            mergedContent = await this.mergeChanges(existingContent, operation.content, normalizedPath);
          } else {
            mergedContent = await this.mergeChanges(existingContent, operation.content, normalizedPath);
          }

          // Only emit the change, don't save yet
          FileChangeEventService.emitChange(normalizedPath, existingContent, mergedContent);
          console.log(`Proposed changes for: ${normalizedPath}`);
        } else {
          const formattedContent = await this.prepareNewFile(operation.content, normalizedPath);
          
          // Only emit the change for new files, don't save yet
          FileChangeEventService.emitChange(normalizedPath, '', formattedContent);
          console.log(`Proposed new file: ${normalizedPath}`);
        }
      } catch (error) {
        console.error(`Error processing file ${operation.path}:`, error);
      }
    }
  }
} 