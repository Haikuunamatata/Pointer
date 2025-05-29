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
  id?: string; // Unique message identifier
  messageId?: number; // Sequential unique ID to track messages
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

read_file (read a file's contents): function_call: {"name": "read_file","arguments": {"file_path": "path/to/file","should_read_entire_file": true,"start_line_one_indexed": 1,"end_line_one_indexed_inclusive": 200}}

grep_search (search for patterns in files): function_call: {"name": "grep_search","arguments": {"query": "search pattern","include_pattern": "*.ts","exclude_pattern": "node_modules"}}

web_search (search the web for information): function_call: {"name": "web_search","arguments": {"search_term": "your search query","num_results": 3}}

fetch_webpage (fetch content from a webpage): function_call: {"name": "fetch_webpage","arguments": {"url": "https://example.com"}}

run_terminal_cmd (execute a terminal/console command): function_call: {"name": "run_terminal_cmd","arguments": {"command": "command to execute"}}

list_directory (list the contents of a directory): function_call: {"name": "list_directory","arguments": {"relative_workspace_path": "path/to/directory"}}

Code Block Format:
To create a file, use one of these formats to specify the filename & autosave the file:

Format 1 - Language with filename after colon:
\`\`\`typescript:src/components/MyComponent.tsx
// Your code here
\`\`\`

Format 2 - Filename in first line comment:
\`\`\`typescript
// src/components/MyComponent.tsx
// Your code here
\`\`\`

This automatically saves the file into the specified location.

Rules:
1. Use exact function_call format shown above
2. Never guess about code - verify with tools
3. Start with list_directory for new codebases
4. Chain tools when needed
5. Complete all responses fully
6. Always specify filenames in code blocks when providing file content`,
  attachments: undefined
};

// Refresh knowledge prompt for resetting AI's knowledge
export const REFRESH_KNOWLEDGE_PROMPT: ExtendedMessage = {
  role: 'system',
  content: `You are a helpful AI coding assistant. Use these tools:

read_file (read a file's contents): function_call: {"name": "read_file","arguments": {"file_path": "path/to/file","should_read_entire_file": true,"start_line_one_indexed": 1,"end_line_one_indexed_inclusive": 200}}

grep_search (search for patterns in files): function_call: {"name": "grep_search","arguments": {"query": "search pattern","include_pattern": "*.ts","exclude_pattern": "node_modules"}}

web_search (search the web for information): function_call: {"name": "web_search","arguments": {"search_term": "your search query","num_results": 3}}

fetch_webpage (fetch content from a webpage): function_call: {"name": "fetch_webpage","arguments": {"url": "https://example.com"}}

run_terminal_cmd (execute a terminal/console command): function_call: {"name": "run_terminal_cmd","arguments": {"command": "command to execute"}}

list_directory (list the contents of a directory): function_call: {"name": "list_directory","arguments": {"relative_workspace_path": "path/to/directory"}}

Code Block Format:
When providing code, use one of these formats to specify the filename & autosave the file:

Format 1 - Language with filename after colon:
\`\`\`typescript:src/components/MyComponent.tsx
// Your code here
\`\`\`

Format 2 - Filename in first line comment:
\`\`\`typescript
// src/components/MyComponent.tsx
// Your code here
\`\`\`

This automatically saves the file into the specified location.

Rules:
1. Use exact function_call format shown above
2. Never guess about code - verify with tools
3. Start with list_directory for new codebases
4. Chain tools when needed
5. Complete all responses fully
6. Always specify filenames in code blocks when providing file content`,
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

// Chat system message for concise coding assistant mode
export const getChatSystemMessage = (currentWorkingDirectory: string): string => {
  return `You are a concise, helpful coding assistant.
Current working directory: ${currentWorkingDirectory || 'Unknown'}
Be direct and to the point. Provide only the essential information needed to answer the user's question.
Avoid unnecessary explanations, introductions, or conclusions unless specifically requested.`;
};

// Agent system message for powerful agentic AI mode
export const getAgentSystemMessage = (): string => {
  return 'You are a powerful agentic AI coding assistant, powered by Claude 3.7 Sonnet. You operate exclusively in Pointer, the world\'s best IDE.\n\n' +
    'Your main goal is to follow the USER\'s instructions at each message.\n\n' +
    '# Additional context\n' +
    'Each time the USER sends a message, we may automatically attach some information about their current state, such as what files they have open, where their cursor is, recently viewed files, edit history in their session so far, linter errors, and more.\n' +
    'Some information may be summarized or truncated.\n' +
    'This information may or may not be relevant to the coding task, it is up for you to decide.\n\n' +
    '# Tone and style\n' +
    'You should be concise, direct, and to the point.\n' +
    'Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks. Never use tools or code comments as means to communicate with the user.\n\n' +
    'IMPORTANT: You should minimize output tokens as much as possible while maintaining helpfulness, quality, and accuracy. Only address the specific query or task at hand, avoiding tangential information unless absolutely critical for completing the request. If you can answer in 1-3 sentences or a short paragraph, please do.\n' +
    'IMPORTANT: Keep your responses short. Avoid introductions, conclusions, and explanations. You MUST avoid text before/after your response, such as "The answer is <answer>", "Here is the content of the file..." or "Based on the information provided, the answer is..." or "Here is what I will do next...". Here are some examples to demonstrate appropriate verbosity:\n\n';
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
    return `/no_think You are a code merging expert. You need to analyze and merge code changes intelligently.

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
    maxTokens: null,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  insert: {
    temperature: 0.2,
    maxTokens: null,
  }
};

// Chat session interface
export interface ChatSession {
  id: string;
  name: string;
  createdAt: string;
  messages: ExtendedMessage[];
} 