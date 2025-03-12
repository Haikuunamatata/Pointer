import { FileSystemService } from './FileSystemService';
import { lmStudio } from './LMStudioService';
import { FileChangeEventService } from './FileChangeEventService';

interface FileOperation {
  path: string;
  content: string;
}

export class AIFileService {
  private static async detectFileType(content: string): Promise<string> {
    try {
      const prompt = `You are a programming language detection expert. Given a code snippet, return ONLY the most appropriate file extension (e.g., 'js', 'py', 'ts', etc.) without any explanation or additional text.

Code snippet:
\`\`\`
${content}
\`\`\`

Return ONLY the file extension.`;

      const response = await lmStudio.createChatCompletion({
        model: 'deepseek-coder-v2-lite-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a programming language detection expert. Return only the file extension without any explanation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for more consistent results
      });

      const extension = response.choices[0]?.message?.content?.trim().toLowerCase();
      
      // Validate the extension is reasonable
      const validExtensions = new Set([
        'py', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'md',
        'sql', 'yaml', 'yml', 'sh', 'java', 'cpp', 'c', 'go', 'rs',
        'rb', 'php', 'vue', 'svelte', 'astro', 'jsx', 'tsx', 'mjs',
        'cjs', 'scss', 'less', 'sass', 'styl', 'xml', 'kt', 'swift',
        'r', 'jl', 'lua', 'pl', 'ex', 'exs', 'elm', 'fs', 'cs'
      ]);

      return validExtensions.has(extension) ? extension : 'txt';
    } catch (error) {
      console.error('Error detecting file type:', error);
      return 'txt';
    }
  }

  private static async findExistingFile(content: string): Promise<string | null> {
    try {
      // Get list of all files in the project
      const currentDir = FileSystemService.getCurrentDirectory();
      if (!currentDir) return null;

      const response = await fetch(`http://localhost:23816/files?${new URLSearchParams({
        currentDir
      })}`);

      if (!response.ok) return null;
      const files = await response.json();

      // Extract key identifiers from the new content
      const identifiers = new Set<string>();
      
      // Extract class names
      const classMatches = content.match(/class\s+(\w+)/g);
      if (classMatches) {
        classMatches.forEach(match => {
          identifiers.add(match.split(/\s+/)[1]);
        });
      }

      // Extract function names
      const funcMatches = content.match(/function\s+(\w+)/g);
      if (funcMatches) {
        funcMatches.forEach(match => {
          identifiers.add(match.split(/\s+/)[1]);
        });
      }

      // Extract component names
      const componentMatches = content.match(/const\s+(\w+)\s*=/g);
      if (componentMatches) {
        componentMatches.forEach(match => {
          identifiers.add(match.split(/\s+/)[1]);
        });
      }

      // Extract import/export identifiers
      const importMatches = content.match(/(?:import|export)\s+{\s*([^}]+)}/g);
      if (importMatches) {
        importMatches.forEach(match => {
          const names = match.replace(/(?:import|export)\s+{\s*|\s*}/g, '').split(',');
          names.forEach(name => identifiers.add(name.trim()));
        });
      }

      // Check each file for matching identifiers
      for (const file of files) {
        try {
          const fileContent = await fetch(`http://localhost:23816/read-file?path=${encodeURIComponent(file.path)}`).then(r => r.text());
          
          // Count how many identifiers match
          let matches = 0;
          for (const identifier of identifiers) {
            if (fileContent.includes(identifier)) {
              matches++;
            }
          }

          // If we have a significant number of matches (e.g., more than 2), this is likely the file
          if (matches >= 2) {
            return file.path;
          }

          // Also check for exact function/class/component matches
          for (const identifier of identifiers) {
            const patterns = [
              new RegExp(`class\\s+${identifier}\\s*{`),
              new RegExp(`function\\s+${identifier}\\s*\\(`),
              new RegExp(`const\\s+${identifier}\\s*=`),
              new RegExp(`let\\s+${identifier}\\s*=`),
              new RegExp(`var\\s+${identifier}\\s*=`),
            ];

            if (patterns.some(pattern => pattern.test(fileContent))) {
              return file.path;
            }
          }
        } catch (error) {
          console.error(`Error reading file ${file.path}:`, error);
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding existing file:', error);
      return null;
    }
  }

  private static extractFileOperations(aiResponse: string): Promise<FileOperation[]> {
    return new Promise<FileOperation[]>(async (resolve) => {
      const operations: FileOperation[] = [];
      
      // First try to extract Pointer:Code format
      const pointerRegex = /Pointer:Code\+(.*?):start\s*([\s\S]*?)\s*Pointer:Code\+\1:end/g;
      let match;
      
      while ((match = pointerRegex.exec(aiResponse)) !== null) {
        const [_, filename, content] = match;
        operations.push({
          path: filename.trim(),
          content: content.trim()
        });
      }

      // If no Pointer:Code blocks found, try to extract regular markdown code blocks
      if (operations.length === 0) {
        const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
        const pendingOperations: Promise<FileOperation | null>[] = [];
        
        while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
          const [_, langHint, content] = match;
          const trimmedContent = content.trim();
          
          if (trimmedContent) {
            pendingOperations.push((async () => {
              // Try to find the existing file this code belongs to
              const existingFile = await this.findExistingFile(trimmedContent);
              
              if (existingFile) {
                return {
                  path: existingFile,
                  content: trimmedContent
                };
              }

              // Look for filename hints in the content
              const filenameHints = [
                // Match "filename: something.ext" or "# filename: something.ext"
                /(?:^|\n)(?:#\s*)?filename:\s*([^\n]+)/i,
                // Match "@file: something.ext" or "# @file: something.ext"
                /(?:^|\n)(?:#\s*)?@file:\s*([^\n]+)/i,
                // Match "File: something.ext" or "# File: something.ext"
                /(?:^|\n)(?:#\s*)?File:\s*([^\n]+)/i,
                // Match "Path: something.ext" or "# Path: something.ext"
                /(?:^|\n)(?:#\s*)?Path:\s*([^\n]+)/i,
                // Match common shebang patterns with paths
                /^#!.*?([^\/\n]+)$/m,
              ];

              for (const pattern of filenameHints) {
                const match = trimmedContent.match(pattern);
                if (match && match[1]) {
                  const suggestedPath = match[1].trim();
                  // If it's just a filename without path, keep it as is
                  // If it's a full path, take just the filename part
                  const filename = suggestedPath.includes('/')
                    ? suggestedPath.split('/').pop()!
                    : suggestedPath;
                  return {
                    path: filename,
                    content: trimmedContent
                  };
                }
              }
              
              // If no filename hints found, use language hint or AI detection
              const detectedType = await this.detectFileType(trimmedContent);
              const fileExt = langHint && langHint !== 'plaintext' ? langHint : detectedType;
              return {
                path: `new_file.${fileExt}`,
                content: trimmedContent
              };
            })());
          }
        }

        // Wait for all file detections to complete
        const results = await Promise.all(pendingOperations);
        operations.push(...results.filter((op): op is FileOperation => op !== null));
      }

      resolve(operations);
    });
  }

  private static async fileExists(path: string): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:23816/file-exists`, {
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
        await fetch('http://localhost:23816/create-directory', {
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

      const response = await fetch(`http://localhost:23816/files?${new URLSearchParams({
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

  private static async refreshEverything(reloadEditor: boolean = false): Promise<void> {
    try {
      // Store current file system state before refresh
      const currentItems = window.fileSystem?.items || {};
      
      // First refresh the file structure
      await FileSystemService.refreshStructure();
      
      // Merge the states more carefully
      if (window.fileSystem) {
        // Create a new merged state
        const mergedItems = { ...window.fileSystem.items };
        
        // Preserve any items that have active tabs
        Object.entries(currentItems).forEach(([id, item]) => {
          if (id.startsWith('file_') || id === 'welcome') {
            mergedItems[id] = item;
          }
        });
        
        // Update the file system with merged state
        window.fileSystem.items = mergedItems;
      }
      
      // Get current directory and reload its contents
      const currentDir = FileSystemService.getCurrentDirectory();
      if (currentDir) {
        await FileSystemService.fetchFolderContents(currentDir);
      }

      // Only reload editor content if specifically requested
      if (reloadEditor) {
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
            const response = await fetch(`http://localhost:23816/read-file?path=${encodeURIComponent(currentFile.path)}`);
            if (response.ok) {
              const updatedContent = await response.text();
              if (window.editor?.setValue) {
                window.editor.setValue(updatedContent);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing everything:', error);
    }
  }

  public static async processAIResponse(aiResponse: string): Promise<void> {
    const operations = await this.extractFileOperations(aiResponse);
    
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
          
          const response = await fetch(`http://localhost:23816/read-file?${params}`);
          
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