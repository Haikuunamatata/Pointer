import { Message } from '../types';

// Add interface for attached files
export interface AttachedFile {
  name: string;
  path: string;
  content: string;
}

// Extend the Message interface to include attachments
export interface ExtendedMessage extends Message {
  attachments?: AttachedFile[];
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string | object;
  }>;
}

// Simplified system message
export const INITIAL_SYSTEM_MESSAGE: ExtendedMessage = {
  role: 'system',
  content: `You are a helpful AI coding assistant. Use these tools:

read_file (read a file's contents): function_call: {"name": "read_file","arguments": {"target_file": "path/to/file","should_read_entire_file": true,"start_line_one_indexed": 1,"end_line_one_indexed_inclusive": 200}}

list_directory (list the contents of a directory): function_call: {"name": "list_directory","arguments": {"relative_workspace_path": "path/to/directory"}}

grep_search (search for a pattern in the workspace): function_call: {"name": "grep_search","arguments": {"query": "search pattern","include_pattern": "*.ts","exclude_pattern": "node_modules"}}

web_search (search the web): function_call: {"name": "web_search","arguments": {"search_term": "your search query"}}

Rules:
1. Use exact function_call format shown above
2. Never guess about code - verify with tools
3. Start with list_directory for new codebases
4. Chain tools when needed
5. Complete all responses fully`,
  attachments: undefined
};

// Refresh knowledge prompt for resetting AI's knowledge
export const REFRESH_KNOWLEDGE_PROMPT: ExtendedMessage = {
  role: 'system',
  content: `You are a helpful AI coding assistant. Use these tools:

read_file (read a file's contents): function_call: {"name": "read_file","arguments": {"target_file": "path/to/file","should_read_entire_file": true,"start_line_one_indexed": 1,"end_line_one_indexed_inclusive": 200}}

list_directory (list the contents of a directory): function_call: {"name": "list_directory","arguments": {"relative_workspace_path": "path/to/directory"}}

grep_search (search for a pattern in the workspace): function_call: {"name": "grep_search","arguments": {"query": "search pattern","include_pattern": "*.ts","exclude_pattern": "node_modules"}}

web_search (search the web): function_call: {"name": "web_search","arguments": {"search_term": "your search query"}}

Rules:
1. Use exact function_call format shown above
2. Never guess about code - verify with tools
3. Start with list_directory for new codebases
4. Chain tools when needed
5. Complete all responses fully`,
  attachments: undefined
};

// Prompt to be added after tool call responses
export const AFTER_TOOL_CALL_PROMPT: ExtendedMessage = {
  role: 'system',
  content: `/no_think Now that you have the tool call results, please provide a clear and concise response to the original query. 
Remember to:
1. Interpret the tool results accurately
2. Connect the findings directly to the user's question
3. Be specific and precise in your answer
4. Do not repeat the raw tool output unless specifically asked
5. If additional tools are needed, use them immediately rather than suggesting the user do so`,
  attachments: undefined
};

// Function to determine if tool use should be forced based on a query
export const shouldForceToolUse = (query: string): boolean => {
  const toolUseIndicators = [
    'show me',
    'look up',
    'search for',
    'find',
    'what is in',
    'list',
    'read',
    'scan',
    'explore',
    'check',
    'directory',
    'file contents',
    'show code',
    'view code',
    'search code'
  ];
  
  return toolUseIndicators.some(indicator => query.toLowerCase().includes(indicator));
};

// Function to get the appropriate tool name for a query
export const getAppropriateToolForQuery = (query: string): string => {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('search web') || lowerQuery.includes('look up online') || lowerQuery.includes('find online')) {
    return 'web_search';
  }
  
  if (lowerQuery.includes('list') || lowerQuery.includes('directory') || lowerQuery.includes('folder')) {
    return 'list_directory';
  }
  
  if (lowerQuery.includes('search') || lowerQuery.includes('find') || lowerQuery.includes('grep')) {
    return 'grep_search';
  }
  
  if (lowerQuery.includes('read') || lowerQuery.includes('file contents') || lowerQuery.includes('show code') || lowerQuery.includes('view code')) {
    return 'read_file';
  }
  
  // Default to grep_search as a general search tool
  return 'grep_search';
};

// Configuration for file extensions based on language
export const getFileExtension = (language: string): string => {
  const extensions: { [key: string]: string } = {
    javascript: 'js',
    typescript: 'ts',
    javascriptreact: 'jsx',
    typescriptreact: 'tsx',
    html: 'html',
    css: 'css',
    json: 'json',
    markdown: 'md',
    python: 'py',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    csharp: 'cs',
    go: 'go',
    rust: 'rs',
    php: 'php',
    ruby: 'rb',
    shell: 'sh',
    bash: 'sh',
    powershell: 'ps1',
    yaml: 'yaml',
    dockerfile: 'Dockerfile',
    plaintext: 'txt'
  };
  
  return extensions[language] || 'txt';
};

// Function to generate a valid tool call ID
export const generateValidToolCallId = (): string => {
  return `call_${Math.random().toString(36).substring(2, 10)}`;
};

// Function to generate prompts for specific purposes
export const generatePrompts = {
  // Prompt for chat title generation
  titleGeneration: (messages: ExtendedMessage[]): string => {
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    const lastUserMessages = userMessages.slice(-3);
    
    return `Generate a short, concise title (maximum 6 words) for a chat that contains these user messages:
${lastUserMessages.join('\n')}

Title:`;
  },
  
  // Prompt for code merging
  codeMerging: (filename: string, originalContent: string, newContent: string): string => {
    return `You are a code merging expert. You need to analyze and merge code changes intelligently.

${originalContent ? `EXISTING FILE (${filename}):\n\`\`\`\n${originalContent}\n\`\`\`\n` : `The file ${filename} is new and will be created.\n`}

${originalContent ? 'NEW CHANGES:' : 'NEW FILE CONTENT:'}
\`\`\`
${newContent}
\`\`\`

Task:
${originalContent ? 
  '1. If the new changes are a complete file, determine if they should replace the existing file entirely\n2. If the new changes are partial (e.g., a single function), merge them into the appropriate location\n3. Preserve any existing functionality that isn\'t being explicitly replaced' : 
  '1. This is a new file, so use the provided content directly.'
}
4. Ensure the merged code is properly formatted and maintains consistency
5. Consider the project structure when merging (e.g., for imports)

Return ONLY the final merged code without any explanations. The code should be ready to use as-is.`;
  }
};

// Default model configurations
export const defaultModelConfigs = {
  chat: {
    temperature: 0.3,
    maxTokens: -1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  insert: {
    temperature: 0.2,
    maxTokens: -1,
  }
};

// Chat session interface
export interface ChatSession {
  id: string;
  name: string;
  createdAt: string;
  messages: ExtendedMessage[];
} 