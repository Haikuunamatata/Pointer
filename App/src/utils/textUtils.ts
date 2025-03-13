/**
 * Text utilities for processing and formatting text
 */

/**
 * Removes all markdown code blocks (triple backticks) from a string
 * and returns the cleaned content.
 * 
 * This function handles both:
 * 1. Code blocks with language specifiers: ```javascript ... ```
 * 2. Code blocks without language specifiers: ``` ... ```
 * 
 * @param content The string content containing code blocks
 * @returns The content with code blocks' backticks removed but the code preserved
 */
export function removeMarkdownCodeBlocks(content: string): string {
  if (!content) return content;
  
  // Replace code blocks with language specifier: ```javascript ... ```
  let result = content.replace(/```[\w-]*\n([\s\S]*?)```/g, (_, code) => code);
  
  // Replace code blocks without language specifier: ``` ... ```
  result = result.replace(/```\n([\s\S]*?)```/g, (_, code) => code);
  
  // Handle edge case where language specifier and code are on the same line
  result = result.replace(/```([\w-]*) ([\s\S]*?)```/g, (_, lang, code) => code);
  
  // Replace any stray backticks (in case the regex missed some)
  result = result.replace(/^```[\w-]*$/gm, '').replace(/^```$/gm, '');
  
  return result.trim();
}

/**
 * Cleans up AI response content by:
 * 1. Removing triple backticks from code blocks while preserving the code
 * 2. Trimming whitespace
 * 3. Normalizing line endings
 * 
 * @param content The AI response content to clean
 * @returns The cleaned content
 */
export function cleanAIResponse(content: string): string {
  if (!content) return content;
  
  try {
    // Remove code blocks formatting
    let result = removeMarkdownCodeBlocks(content);
    
    // Normalize line endings
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    return result.trim();
  } catch (error) {
    console.error('Error cleaning AI response:', error);
    // If there's an error, return the original content as a fallback
    return content;
  }
}

/**
 * Checks if a string contains markdown code blocks (triple backticks)
 * 
 * @param content The string content to check
 * @returns boolean True if the content contains code blocks
 */
export function containsMarkdownCodeBlocks(content: string): boolean {
  if (!content) return false;
  
  // Check for code blocks with or without language specifier
  return /```[\w-]*\n[\s\S]*?```/g.test(content) || 
         /```\n[\s\S]*?```/g.test(content) ||
         /```[\w-]* [\s\S]*?```/g.test(content);
}

/**
 * Identifies incomplete code pointer blocks where the start tag exists but not the end tag
 * 
 * @param content The content to check for incomplete code blocks
 * @returns An array of objects containing info about incomplete blocks (filename and startIndex)
 */
export function findIncompleteCodeBlocks(content: string): Array<{filename: string, startIndex: number, partialCode: string}> {
  if (!content) return [];
  
  const incompleteBlocks: Array<{filename: string, startIndex: number, partialCode: string}> = [];
  const startTagRegex = /Pointer:Code\+(.*?):start\s*([\s\S]*?)(?=(Pointer:Code\+\1:end|$))/g;
  
  let match;
  while ((match = startTagRegex.exec(content)) !== null) {
    const [fullMatch, filename, partialCode] = match;
    const endTagExists = content.includes(`Pointer:Code+${filename}:end`);
    
    if (!endTagExists) {
      incompleteBlocks.push({
        filename: filename.trim(),
        startIndex: match.index,
        partialCode: partialCode.trim()
      });
    }
  }
  
  return incompleteBlocks;
}

/**
 * Extracts the language from a filename based on its extension
 * 
 * @param filename The filename to extract language from
 * @returns The language identifier for syntax highlighting
 */
export function getLanguageFromFilename(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  // Map common file extensions to language identifiers
  const extensionToLanguage: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'json': 'json',
    'md': 'markdown',
    'sql': 'sql',
    'sh': 'bash',
    'bash': 'bash',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'swift': 'swift',
    'kt': 'kotlin',
  };
  
  return extensionToLanguage[extension] || extension || 'plaintext';
} 