import React, { useRef, useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import { FileSystemItem } from '../types';
import { getLanguageFromFileName } from '../utils/languageUtils';
import { AIFileService } from '../services/AIFileService';
import { lmStudio } from '../services/LMStudioService';
import { FileSystemService } from '../services/FileSystemService';

// Get access to the App's applyCustomTheme function through the window object
declare global {
  interface Window {
    getCurrentFile: () => { path: string; } | null;
    editor?: monaco.editor.IStandaloneCodeEditor;
    reloadFileContent?: (fileId: string) => Promise<void>;
    fileSystem?: Record<string, FileSystemItem>;
    applyCustomTheme?: () => void;
    loadSettings?: () => Promise<void>;
  }
}

interface EditorPaneProps {
  fileId: string;
  file: FileSystemItem;
  onEditorReady: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

const EditorPane: React.FC<EditorPaneProps> = ({ fileId, file, onEditorReady }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const contentRef = useRef<string>('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [prompt, setPrompt] = useState('');
  const editorInitializedRef = useRef(false);
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPositionRef = useRef<monaco.Position | null>(null);
  const inlineCompletionWidgetRef = useRef<any>(null);
  // Always enabled by default (was previously set to true but might have been changed by users)
  const [completionEnabled, setCompletionEnabled] = useState(true);
  // Add auto-save timeout ref
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if content has changed since last save
  const contentChangedRef = useRef<boolean>(false);

  // Normalize content once when file changes
  useEffect(() => {
    if (file?.content) {
      contentRef.current = file.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    } else if (fileId === 'welcome') {
      // Default content for welcome file if it doesn't have content
      contentRef.current = "// Welcome to your new code editor!\n// Start typing here...\n\n// By the way you can't delete or save this file. (future updates (maybe (if i have motivation)))"
    } else {
      contentRef.current = '';
    }
  }, [file?.content, fileId]);

  // Setup editor with ghost text completion
  useEffect(() => {
    // Only create editor once, don't recreate it on every render
    if (!editorRef.current || editorInitializedRef.current) return;

    const language = file ? getLanguageFromFileName(file.name) : 'javascript';
    const uri = monaco.Uri.parse(file?.path || `file:///${fileId}.js`);

    // Check if a model already exists for this file
    let model = monaco.editor.getModel(uri);
    
    // If model exists, update its value
    if (model) {
      if (model.getValue() !== contentRef.current) {
        model.setValue(contentRef.current);
      }
    } else {
      // Create new model only if it doesn't exist
      model = monaco.editor.createModel(
        contentRef.current,
        language,
        uri
      );
      model.setEOL(monaco.editor.EndOfLineSequence.LF);
    }

    // Define editor options with proper typing
    const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
      model: model,
      automaticLayout: true,
      minimap: {
        enabled: false
      },
      lineNumbers: 'on',
      wordWrap: 'off',
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      cursorStyle: 'line',
      lineHeight: 19,
      renderFinalNewline: 'on',
      detectIndentation: true,
      trimAutoWhitespace: true
    };

    // Create editor with the model
    editor.current = monaco.editor.create(editorRef.current, editorOptions);

    // Load settings first, then apply the custom theme
    if (window.loadSettings) {
      window.loadSettings().then(() => {
        // Apply the custom theme after settings are loaded
        if (window.applyCustomTheme) {
          window.applyCustomTheme();
        }
      }).catch(err => {
        console.error('Error loading settings:', err);
        // Apply theme anyway as fallback
        if (window.applyCustomTheme) {
          window.applyCustomTheme();
        }
      });
    } else if (window.applyCustomTheme) {
      // Fallback if loadSettings is not available
      window.applyCustomTheme();
    }

    // Handle all keyboard events in one place for consistency
    editor.current.onKeyDown((e) => {
      // Tab key to accept ghost text
      if (e.keyCode === monaco.KeyCode.Tab && inlineCompletionWidgetRef.current) {
        acceptGhostText();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      // Keys that should dismiss ghost text
      const dismissKeyCodes = [
        monaco.KeyCode.Escape,
        monaco.KeyCode.Enter,
        monaco.KeyCode.Backspace,
        monaco.KeyCode.Delete
      ];
      
      if (inlineCompletionWidgetRef.current && dismissKeyCodes.includes(e.keyCode)) {
        removeGhostText();
        // Default behavior continues naturally
      }
    });

    // Add keyboard event handler for Ctrl+I
    editor.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
      setShowPromptInput(true);
    });

    // Add Ctrl+Space command for manual code completion
    editor.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      console.log("Manual code completion triggered");
      const currentPosition = editor.current?.getPosition();
      if (currentPosition) {
        lastPositionRef.current = currentPosition;
        requestCodeCompletion();
      }
      return null;
    });

    // Add keyboard shortcut to toggle auto-completion (Ctrl+Shift+Space)
    editor.current.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Space, 
      () => {
        setCompletionEnabled(!completionEnabled);
        console.log(completionEnabled ? "Auto-completion disabled" : "Auto-completion enabled");
        return null;
      }
    );

    // Add content change listener for code completion
    if (editor.current && model) {
      model.onDidChangeContent((e) => {
        // Clear any existing timeouts
        if (completionTimeoutRef.current) {
          clearTimeout(completionTimeoutRef.current);
          completionTimeoutRef.current = null;
        }
        
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
          autoSaveTimeoutRef.current = null;
        }

        // Flag that content has changed and needs saving
        contentChangedRef.current = true;

        // Remove any existing ghost text
        removeGhostText();

        // Skip auto-completion if explicitly disabled by user
        if (!completionEnabled) return;

        // Only request completion if the change was due to typing (not programmatic)
        // and there are actual text changes (not just line breaks)
        const hasTextChanges = e.changes.some(change => 
          change.text && change.text.trim().length > 0);
          
        // Don't trigger completion after deleting text
        const isDeletion = e.changes.some(change => 
          change.text.length === 0 && change.rangeLength > 0);
        
        console.log("Content changed:", { hasTextChanges, isDeletion, completionEnabled });
        
        if (hasTextChanges && !isDeletion) {
          console.log("Setting up completion timeout (200ms)");
          // Setup a new timeout with proper delay
          completionTimeoutRef.current = setTimeout(() => {
            console.log("Timeout fired, triggering suggestions");
            completionTimeoutRef.current = null;
            
            // Get current position for both Monaco suggestions and our custom completions
            const currentPosition = editor.current?.getPosition();
            if (currentPosition && editor.current) {
              // Store position for our custom ghost text completion
              lastPositionRef.current = currentPosition;
              
              // First trigger Monaco's native suggestions (built-in autocomplete)
              try {
                console.log("Triggering Monaco built-in suggestions");
                editor.current.trigger('keyboard', 'editor.action.triggerSuggest', {});
              } catch (err) {
                console.error("Error triggering Monaco suggestions:", err);
              }
              
              // Then trigger our custom AI-powered completions
              requestCodeCompletion();
            }
          }, 200); // Changed to 200ms as requested
        }

        // Set up auto-save timeout
        autoSaveTimeoutRef.current = setTimeout(() => {
          autoSaveTimeoutRef.current = null;
          saveCurrentFile();
        }, 100); // 100ms delay as specified
      });
    }

    if (editor.current) {
      editorInitializedRef.current = true;
      onEditorReady(editor.current);
    }

    // Handle cursor position changes
    editor.current.onDidChangeCursorPosition((e) => {
      // If the cursor position changes significantly, remove ghost text
      if (inlineCompletionWidgetRef.current && lastPositionRef.current) {
        const lastPos = lastPositionRef.current;
        const currentPos = e.position;
        
        // Remove ghost text if cursor moved to a different line or column
        if (lastPos.lineNumber !== currentPos.lineNumber || 
            Math.abs(lastPos.column - currentPos.column) > 1) {
          removeGhostText();
        }
        
        // Update the last position
        lastPositionRef.current = currentPos;
      }
    });

    // Clean up on unmount
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      // Try to save once more before unmounting
      saveCurrentFile();
      removeGhostText();
    };
  }, [fileId, file, onEditorReady, completionEnabled]);

  // Helper function to extract imports from content
  const extractImports = (content: string): string[] => {
    const imports: string[] = [];
    
    // Match import statements in JavaScript/TypeScript
    const jsImportRegex = /import\s+.*?from\s+['"].*?['"]/g;
    const jsImports = content.match(jsImportRegex) || [];
    imports.push(...jsImports);
    
    // Match require statements in JavaScript
    const requireRegex = /(?:const|let|var)\s+.*?=\s+require\(['"].*?['"]\)/g;
    const requires = content.match(requireRegex) || [];
    imports.push(...requires);
    
    // Match Python imports
    const pyImportRegex = /(?:import|from)\s+.*?(?:import|\n|$)/g;
    const pyImports = content.match(pyImportRegex) || [];
    imports.push(...pyImports);
    
    return imports;
  };
  
  // Helper function to extract major declarations based on language
  const extractDeclarations = (content: string, language: string): string[] => {
    const declarations: string[] = [];
    
    if (language === 'javascript' || language === 'typescript') {
      // Match function and class declarations
      const funcClassRegex = /(?:function|class|const|let|var)\s+\w+\s*(?:[=({]|extends)/g;
      const funcClass = content.match(funcClassRegex) || [];
      declarations.push(...funcClass);
      
      // Match export statements
      const exportRegex = /export\s+(?:const|let|var|function|class|default|{)/g;
      const exports = content.match(exportRegex) || [];
      declarations.push(...exports);
    } else if (language === 'python') {
      // Match function and class declarations in Python
      const pyFuncClassRegex = /(?:def|class)\s+\w+\s*(?:\(|\:)/g;
      const pyFuncClass = content.match(pyFuncClassRegex) || [];
      declarations.push(...pyFuncClass);
    }
    
    return declarations;
  };

  // Helper function to extract imported modules/paths from content
  const extractImportPaths = (content: string): string[] => {
    const importPaths: string[] = [];
    
    // Extract import paths from JavaScript/TypeScript
    const jsImportPathRegex = /(?:import|require)\s+.*?(?:from\s+|['"'"])\s*['"]([^'"'"]+)['"'"]]/g;
    let match;
    while ((match = jsImportPathRegex.exec(content)) !== null) {
      if (match[1] && !match[1].startsWith('.')) continue; // Skip non-relative imports
      if (match[1]) importPaths.push(match[1]);
    }
    
    // Extract import paths from Python
    const pyImportPathRegex = /from\s+([^\s]+)\s+import/g;
    while ((match = pyImportPathRegex.exec(content)) !== null) {
      if (match[1] && !match[1].startsWith('.')) continue; // Skip non-relative imports
      if (match[1]) importPaths.push(match[1]);
    }
    
    return importPaths;
  };
  
  // Get context from related files based on imports
  const getRelatedFilesContext = async (currentFilePath: string, content: string): Promise<string> => {
    try {
      const importPaths = extractImportPaths(content);
      if (importPaths.length === 0) return '';
      
      let relatedFilesContext = '';
      
      // Get the directory of the current file
      const currentDir = currentFilePath.split('/').slice(0, -1).join('/');
      
      // Try to resolve each import path to a file
      for (const importPath of importPaths) {
        try {
          // Normalize path based on whether it's relative or not
          let fullPath = importPath;
          if (importPath.startsWith('.')) {
            // Resolve relative path
            fullPath = `${currentDir}/${importPath}`.replace(/\/\.\//g, '/');
          }
          
          // Handle different file extensions (.js, .ts, etc.) or no extension
          const potentialExtensions = ['', '.js', '.jsx', '.ts', '.tsx', '.py'];
          
          for (const ext of potentialExtensions) {
            const pathToTry = `${fullPath}${ext}`;
            
            try {
              // Fetch file content
              const response = await fetch(`http://localhost:23816/read-file?path=${encodeURIComponent(pathToTry)}`);
              
              if (response.ok) {
                const fileContent = await response.text();
                
                // Extract key functions and classes from the imported file
                const language = pathToTry.split('.').pop() || '';
                const declarations = extractDeclarations(fileContent, language);
                
                // Add to context
                if (declarations.length > 0) {
                  relatedFilesContext += `
# Imported file: ${pathToTry}
# Key declarations:
${declarations.join('\n')}

`;
                }
                
                // Found a match, so break the extension loop
                break;
              }
            } catch (error) {
              // Continue trying other extensions
            }
          }
        } catch (error) {
          // Skip this import path if there's an error
          console.error('Error fetching imported file:', error);
        }
      }
      
      return relatedFilesContext;
    } catch (error) {
      console.error('Error getting related files context:', error);
      return '';
    }
  };

  // Request code completion from LM Studio 
  const requestCodeCompletion = async () => {
    if (!editor.current || !lastPositionRef.current) return;
    
    try {
      console.log("Requesting AI code completion");
      
      const model = editor.current.getModel();
      if (!model) return;

      const position = lastPositionRef.current;
      
      // Get text before the cursor for context
      const content = model.getValue();
      const textBeforeCursor = content.substring(0, model.getOffsetAt(position));
      
      // Get current line content and analyze it
      const lineContent = model.getLineContent(position.lineNumber);
      const lineBeforeCursor = lineContent.substring(0, position.column - 1);
      const lineAfterCursor = lineContent.substring(position.column - 1);
      
      // Get file extension and language for better context
      const fileExt = file?.name ? file.name.split('.').pop()?.toLowerCase() : '';
      const language = getLanguageFromFileName(file?.name || '');
      
      // Determine current code context (import, function, class, etc.)
      let codeContext = 'unknown';
      
      // Get the line number of the cursor position
      const cursorLineNumber = position.lineNumber;
      
      // Count total lines in the file
      const totalLines = model.getLineCount();
      
      // Get all lines of the file to analyze the structure
      const allLines = [];
      for (let i = 1; i <= totalLines; i++) {
        allLines.push(model.getLineContent(i));
      }
      
      // For Python files, do a more thorough structure analysis
      if (language === 'python') {
        // Find where import statements end in the file
        let importSectionEndLine = 1;
        let foundNonImport = false;
        
        for (let i = 0; i < allLines.length; i++) {
          const line = allLines[i].trim();
          // Skip empty lines and comments
          if (line === '' || line.startsWith('#')) {
            continue;
          }
          
          if (line.startsWith('import ') || line.startsWith('from ')) {
            if (!foundNonImport) {
              importSectionEndLine = i + 1;
            }
          } else {
            foundNonImport = true;
            // If we already found a non-import and now see another import,
            // it's probably not in the primary import section
            if (i > importSectionEndLine + 5) {
              break;
            }
          }
        }
        
        console.log(`Import section ends at line ${importSectionEndLine}, cursor at line ${cursorLineNumber}`);
        
        // Check if cursor is in the import section
        if (cursorLineNumber <= importSectionEndLine + 2) { // +2 for a bit of buffer
          codeContext = 'import';
        } else {
          // Look for function or class definitions above the cursor
          let insideFunction = false;
          let insideClass = false;
          let functionIndentation = 0;
          let classIndentation = 0;
          
          // Scan from the cursor position backwards to find what context we're in
          for (let i = cursorLineNumber - 1; i >= 0; i--) {
            const line = allLines[i];
            const trimmedLine = line.trim();
            const indentation = line.length - line.trimStart().length;
            
            if (trimmedLine.startsWith('def ') && trimmedLine.includes(':')) {
              functionIndentation = indentation;
              insideFunction = true;
              break;
            } else if (trimmedLine.startsWith('class ') && trimmedLine.includes(':')) {
              classIndentation = indentation;
              insideClass = true;
              break;
            } else if (trimmedLine && !trimmedLine.startsWith('#')) {
              // If we hit a non-empty, non-comment line with less indentation
              // than our cursor position, we're not inside any function or class
              const currentLineIndentation = lineContent.length - lineContent.trimStart().length;
              if (indentation < currentLineIndentation) {
                break;
              }
            }
          }
          
          // Determine context based on indentation and definitions
          if (insideFunction) {
            codeContext = 'function';
          } else if (insideClass) {
            codeContext = 'class';
          } else {
            codeContext = 'module';
          }
        }
      } else {
        // Original context detection for non-Python files
        // Check if we're in an import section
        const lastImportMatch = textBeforeCursor.match(/^([\s\S]*?)(import|from)\s+[^;]*?$/m);
        const isInImportSection = lastImportMatch && 
                                 (position.lineNumber <= textBeforeCursor.split('\n').length - lastImportMatch[0].split('\n').length + 5);
        
        // Check if we're inside a function definition
        const lastFunctionMatch = textBeforeCursor.match(/def\s+\w+\s*\([^)]*\)\s*:/);
        const isInFunction = lastFunctionMatch && 
                             !textBeforeCursor.substring(textBeforeCursor.lastIndexOf(lastFunctionMatch[0])).includes('\ndef ');
        
        // Check if we're inside a class definition
        const lastClassMatch = textBeforeCursor.match(/class\s+\w+/);
        const isInClass = lastClassMatch && 
                          !textBeforeCursor.substring(textBeforeCursor.lastIndexOf(lastClassMatch[0])).includes('\nclass ');
        
        // Assign code context based on position
        if (isInImportSection) {
          codeContext = 'import';
        } else if (isInFunction) {
          codeContext = 'function';
        } else if (isInClass) {
          codeContext = 'class';
        }
      }
      
      console.log(`Current code context: ${codeContext}, Line: ${position.lineNumber}, Column: ${position.column}`);
      
      // Build stop sequences based on language
      const stopSequences = ['\n\n'];
      if (language === 'javascript' || language === 'typescript') {
        stopSequences.push(';\n', '}\n');
      } else if (language === 'python') {
        stopSequences.push('\ndef ', '\nclass ');
      } else if (language === 'html') {
        stopSequences.push('>\n', '</');
      }
      
      // Add HTML context if needed
      let htmlContext = '';
      if (language === 'html') {
        // Check if we're inside a tag
        const lastOpenTagMatch = textBeforeCursor.match(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*$/);
        const isInsideTag = lastOpenTagMatch && !textBeforeCursor.endsWith('>')
        
        // Check for unclosed tags to help with proper tag completion
        const openTagsStack = [];
        const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
        let match;
        
        while ((match = tagRegex.exec(textBeforeCursor)) !== null) {
          const fullTag = match[0];
          const tagName = match[1];
          
          if (fullTag.startsWith('</')) {
            // Closing tag
            if (openTagsStack.length > 0 && openTagsStack[openTagsStack.length - 1] === tagName) {
              openTagsStack.pop();
            }
          } else if (!fullTag.endsWith('/>')) {
            // Opening tag (not self-closing)
            openTagsStack.push(tagName);
          }
        }
        
        if (openTagsStack.length > 0 || isInsideTag) {
          htmlContext = `
# HTML Context:
${isInsideTag ? `Currently typing tag: ${lastOpenTagMatch[1]}` : ''}
${openTagsStack.length > 0 ? `Unclosed tags: ${openTagsStack.join(', ')}` : ''}
`;
        }
      }
      
      // Get additional context about the current file and codebase
      let enhancedContextPrompt = '';
      try {
        // 1. Get imports and major declarations from the file
        const importStatements = extractImports(content);
        const declarations = extractDeclarations(content, language);
        
        // 2. Get surrounding code context (10 lines above and below cursor)
        const startLine = Math.max(1, position.lineNumber - 10);
        const endLine = Math.min(model.getLineCount(), position.lineNumber + 10);
        let surroundingContext = '';
        for (let i = startLine; i <= endLine; i++) {
          if (i === position.lineNumber) {
            // Mark the cursor position with [CURSOR] marker
            const lineText = model.getLineContent(i);
            surroundingContext += lineText.substring(0, position.column - 1) + 
                                 "[CURSOR]" + 
                                 lineText.substring(position.column - 1) + "\n";
          } else {
            surroundingContext += model.getLineContent(i) + "\n";
          }
        }
        
        // 3. Get context from related files based on imports
        const currentFilePath = file?.path || '';
        const relatedFilesContext = await getRelatedFilesContext(currentFilePath, content);
        
        // 4. Build the enhanced context prompt with code context information
        enhancedContextPrompt = `
# File: ${file?.name || 'untitled'}
# Language: ${language}
# Current Position: Line ${position.lineNumber}, Column ${position.column}
# Code Context: ${codeContext}
${htmlContext}
${importStatements.length > 0 ? '# Imports:\n' + importStatements.join('\n') : ''}

${declarations.length > 0 ? '# Major Declarations:\n' + declarations.join('\n') : ''}

${relatedFilesContext ? '# Related Files Context:\n' + relatedFilesContext : ''}

# Surrounding Context:
\`\`\`${language}
${surroundingContext}
\`\`\`

I need a completion that continues exactly from the [CURSOR] position. The completion should be VERY SHORT (ideally just a few words or a single line) and must be contextually appropriate for ${codeContext} context.

If I'm in the middle of a function, suggest only function body code, NOT imports or declarations.
If I'm at the top level outside functions, suggest declarations or logical next steps.
If I'm in an import section, suggest only relevant imports.

DO NOT include the [CURSOR] marker in your response. Provide ONLY the completion text without any explanation.
`;
      } catch (error) {
        console.error('Error building enhanced context:', error);
        enhancedContextPrompt = '';
      }
      
      console.log("Sending completion API request to LM Studio");
      
      // Request completion with the enhanced context
      const contextPrompt = `${enhancedContextPrompt}\n\nUser request: ${prompt}`;
      
      try {
        // Use autocompletion model for code completion
        const modelId = await AIFileService.getModelIdForPurpose('autocompletion');
        console.log(`Using model for code completion: ${modelId}`);

        // Get response from LM Studio
        const response = await lmStudio.createChatCompletion({
          model: modelId,
          messages: [
            {
              role: 'system',
              content: 'You are a code completion assistant. Provide short, contextually relevant code completions. Response should be just the completion text without explanation or markdown.'
            },
            {
              role: 'user',
              content: contextPrompt
            }
          ],
          temperature: 0.2, // Lower temperature for more focused completions
        });

        const aiContent = response.choices[0]?.message?.content;
        if (aiContent) {
          // Extract the first line or a reasonable suggestion from the AI content
          let suggestion = aiContent.trim();
          
          // Remove markdown code blocks if present
          suggestion = suggestion.replace(/```[\w]*\n/g, '').replace(/```/g, '');
          
          // If the suggestion is prefixed with the language name, remove it
          suggestion = suggestion.replace(/^(javascript|typescript|python|html|css|java|c\+\+|c#|go|rust|php|ruby|swift|kotlin|scala)\s+/i, '');
          
          // Remove any [CURSOR] markers
          suggestion = suggestion.replace('[CURSOR]', '');
          
          // Context-aware filtering based on where we are in the code
          if (codeContext === 'function' && suggestion.includes('import ')) {
            console.log("Filtering out inappropriate import in function context");
            suggestion = '';
          } else if (codeContext !== 'import' && suggestion.trim().startsWith('from ') && suggestion.includes(' import ')) {
            console.log("Filtering out inappropriate import outside import section");
            suggestion = '';
          }
          
          // If suggestion is not empty after cleaning, show it as ghost text
          if (suggestion.trim()) {
            console.log("Showing ghost text suggestion:", suggestion);
            
            // Additional Python-specific filtering
            if (language === 'python') {
              // If we're not in an import section but the suggestion starts with an import,
              // don't show it as ghost text
              if (codeContext !== 'import' && 
                 (suggestion.trim().startsWith('from ') || 
                  suggestion.trim().startsWith('import '))) {
                console.log("Blocking inappropriate import in Python context:", codeContext);
                return;
              }
              
              // If we're inside a function body, make sure we don't suggest non-indented code
              if (codeContext === 'function' && 
                  lineContent.startsWith(' ') && 
                  !suggestion.startsWith(' ') && 
                  suggestion.trim().length > 0) {
                // Add proper indentation to match the current line
                const currentIndent = lineContent.length - lineContent.trimStart().length;
                suggestion = ' '.repeat(currentIndent) + suggestion.trimStart();
              }
            }
            
            showGhostText(suggestion);
          } else {
            console.log("No valid suggestion to show after filtering");
          }
        }
      } catch (error) {
        console.error('Error processing AI request:', error);
      }
    } catch (error) {
      console.error('Error getting code completion:', error);
    }
  };

  // Show ghost text in the editor
  const showGhostText = (text: string) => {
    if (!editor.current || !lastPositionRef.current) return;
    
    // First, remove any existing ghost text
    removeGhostText();
    
    // If the input text is empty or only whitespace, don't show anything
    if (!text || !text.trim()) {
      console.log("Empty text received in showGhostText, not displaying");
      return;
    }
    
    // Clean up the completion text
    const position = lastPositionRef.current;
    const model = editor.current.getModel();
    if (!model) return;
    
    const lineContent = model.getLineContent(position.lineNumber);
    const columnTextBefore = lineContent.substring(0, position.column - 1);
    
    let displayText = text;
    
    // Final check to make sure we're not showing imports at inappropriate places
    const totalLines = model.getLineCount();
    const isTopOfFile = position.lineNumber <= 3; // First 3 lines
    const isMiddleOfFile = position.lineNumber > 3 && position.lineNumber < totalLines - 3;
    
    if (isMiddleOfFile && (displayText.includes('import ') || displayText.includes('from '))) {
      // If it's an import statement in the middle of a file, don't show it
      console.log("Blocking import statement in middle of file");
      return;
    }
    
    // If we're at the beginning of a line, trim any leading whitespace
    if (columnTextBefore.trim() === '') {
      displayText = text.trimStart();
    }
    
    // Check if we're completing inside a word - if so, only suggest the remainder
    const lastWordMatch = columnTextBefore.match(/[\w\d_]+$/);
    if (lastWordMatch && displayText.startsWith(lastWordMatch[0])) {
      displayText = displayText.substring(lastWordMatch[0].length);
    }
    
    // Check if we're typing a function/method and it suggests the same one
    const lastParensMatch = columnTextBefore.match(/\w+\s*\(\s*$/);
    if (lastParensMatch && displayText.includes('(')) {
      const funcName = lastParensMatch[0].trim().replace(/\($/, '');
      if (displayText.startsWith(funcName)) {
        displayText = displayText.substring(displayText.indexOf('('));
      }
    }
    
    // If the completion is empty or only whitespace after processing, don't show it
    if (!displayText || displayText.trim() === '') {
      console.log("Completion became empty after processing, not displaying");
      return;
    }
    
    // Create the ghost text widget with improved styling
    const contentWidget = {
      getId: () => 'ghost-text-widget',
      getDomNode: () => {
        const node = document.createElement('div');
        node.className = 'ghost-text-widget';
        node.style.color = 'rgba(255, 255, 255, 0.5)'; // Semi-transparent white
        node.style.fontStyle = 'italic';
        node.style.display = 'inline-block';
        node.style.pointerEvents = 'none'; // Make it non-interactive
        node.textContent = displayText;
        return node;
      },
      getPosition: () => {
        // Get the current position every time to ensure it's accurate
        const currentPosition = editor.current?.getPosition() || position;
        return {
          position: currentPosition,
          preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
        };
      }
    };
    
    // Store the widget reference before adding it to the editor
    inlineCompletionWidgetRef.current = contentWidget;
    editor.current.addContentWidget(contentWidget);
    
    // Log success message
    console.log("Ghost text displayed:", displayText);
  };

  // Remove ghost text from the editor
  const removeGhostText = () => {
    try {
      if (editor.current && inlineCompletionWidgetRef.current) {
        // Get the widget before clearing the reference
        const widget = inlineCompletionWidgetRef.current;
        
        // Clear the reference first to prevent race conditions
        inlineCompletionWidgetRef.current = null;
        
        // Now remove the widget from the editor
        editor.current.removeContentWidget(widget);
      }
    } catch (error) {
      console.error('Error removing ghost text widget:', error);
      // Reset the reference even if there was an error
      inlineCompletionWidgetRef.current = null;
    }
  };

  // Accept the ghost text and insert it into the editor
  const acceptGhostText = () => {
    if (!editor.current || !inlineCompletionWidgetRef.current || !lastPositionRef.current) return;
    
    const widget = inlineCompletionWidgetRef.current;
    const text = widget.getDomNode().textContent;
    
    if (text) {
      const position = lastPositionRef.current;
      editor.current.executeEdits('ghostText', [{
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        ),
        text: text,
        forceMoveMarkers: true
      }]);
    }
    
    removeGhostText();
  };

  // Update model when file changes
  useEffect(() => {
    if (editor.current && file) {
      const model = editor.current.getModel();
      if (model && model.getValue() !== contentRef.current) {
        const position = editor.current.getPosition();
        const selections = editor.current.getSelections();
        model.setValue(contentRef.current);
        // Restore cursor position and selections
        if (position) {
          editor.current.setPosition(position);
        }
        if (selections) {
          editor.current.setSelections(selections);
        }
        
        // Reapply the custom theme when file content changes
        if (window.applyCustomTheme) {
          window.applyCustomTheme();
        }
      }
    }
  }, [file?.content]);

  // Complete cleanup only when component is unmounted
  useEffect(() => {
    return () => {
      if (editor.current) {
        const model = editor.current.getModel();
        editor.current.dispose();
        editor.current = null;
        if (model && !model.isDisposed()) {
          model.dispose();
        }
        editorInitializedRef.current = false;
      }
    };
  }, []);

  const handlePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    // Get the current selection or cursor position
    const selection = editor.current?.getSelection();
    const position = selection?.getStartPosition();
    const model = editor.current?.getModel();
    
    // Get the current file path
    const currentFile = window.getCurrentFile?.();
    if (!currentFile) return;

    // Build enhanced context
    let enhancedContext = `File: ${currentFile.path}`;
    
    if (position && model) {
      enhancedContext += `\nPosition: Line ${position.lineNumber}, Column ${position.column}`;
      
      // Add surrounding code context (5 lines before and after cursor)
      const startLine = Math.max(1, position.lineNumber - 5);
      const endLine = Math.min(model.getLineCount(), position.lineNumber + 5);
      
      let surroundingCode = '\n\nSurrounding code:\n```\n';
      for (let i = startLine; i <= endLine; i++) {
        const lineContent = model.getLineContent(i);
        // Mark the current line
        surroundingCode += `${i === position.lineNumber ? '> ' : '  '}${lineContent}\n`;
      }
      surroundingCode += '```';
      
      enhancedContext += surroundingCode;
      
      // Add information about imports and structure
      try {
        const content = model.getValue();
        const fileExt = currentFile.path.split('.').pop()?.toLowerCase() || '';
        const language = getLanguageFromFileName(currentFile.path);
        
        const importStatements = extractImports(content);
        if (importStatements.length > 0) {
          enhancedContext += '\n\nImports in this file:\n```\n' + importStatements.join('\n') + '\n```';
        }
        
        const declarations = extractDeclarations(content, language);
        if (declarations.length > 0) {
          enhancedContext += '\n\nMajor declarations in this file:\n```\n' + declarations.join('\n') + '\n```';
        }
        
        // Add related files context
        const relatedFilesContext = await getRelatedFilesContext(currentFile.path, content);
        if (relatedFilesContext) {
          enhancedContext += '\n\nContext from related files:\n```\n' + relatedFilesContext + '\n```';
        }
      } catch (error) {
        console.error('Error adding imports/declarations to context:', error);
      }
    }
    
    // Create a context-aware prompt with file structure info
    const contextPrompt = `${enhancedContext}\n\nUser request: ${prompt}`;
    
    try {
      // Use autocompletion model for code completion
      const modelId = await AIFileService.getModelIdForPurpose('autocompletion');
      console.log(`Using model for code completion: ${modelId}`);

      // Get response from LM Studio
      const response = await lmStudio.createChatCompletion({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: 'You are a coding assistant with deep knowledge of software development. Respond with concise, accurate code that addresses the user\'s needs.'
          },
          {
            role: 'user',
            content: contextPrompt
          }
        ],
        temperature: 0.3,
      });

      const aiContent = response.choices[0]?.message?.content;
      if (aiContent) {
        // Process the AI response directly
        await AIFileService.processAIResponse(aiContent);
      }
    } catch (error) {
      console.error('Error processing AI request:', error);
    }

    // Reset the prompt input
    setPrompt('');
    setShowPromptInput(false);
  };

  // Function to save the current file
  const saveCurrentFile = async () => {
    if (!editor.current || !contentChangedRef.current || !fileId || fileId === 'welcome') return;
    
    try {
      const content = editor.current.getValue();
      
      // Only save if file path is valid and content has changed
      if (file?.path && contentChangedRef.current) {
        console.log(`Auto-saving file: ${file.path}`);
        await FileSystemService.saveFile(fileId, content);
        contentChangedRef.current = false;
        console.log(`File saved: ${file.path}`);
      }
    } catch (error) {
      console.error('Error auto-saving file:', error);
    }
  };

  if (!file) {
    return <div>No file loaded</div>;
  }

  return (
    <div className="editor-pane">
      <div 
        ref={editorRef} 
        className="monaco-editor-container" 
        style={{ width: '100%', height: '100%' }}
      />
      
      {showPromptInput && (
        <div className="prompt-overlay">
          <form onSubmit={handlePromptSubmit}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask AI anything..."
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
              autoFocus
            />
            <div style={{ 
              marginTop: '10px', 
              display: 'flex', 
              justifyContent: 'flex-end',
              gap: '8px'
            }}>
              <button
                type="button"
                onClick={() => setShowPromptInput(false)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--accent-color)',
                  borderRadius: '4px',
                  background: 'var(--accent-color)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Ask AI
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface EditorGridProps {
  openFiles: string[];
  currentFileId: string | null;
  items: Record<string, FileSystemItem>;
  onEditorChange: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  onTabClose: (fileId: string) => void;
  isGridLayout?: boolean;
  onToggleGrid?: () => void;
}

interface EditorLayout {
  id: string;
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DragHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({ onMouseDown }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '24px',
      background: 'var(--bg-secondary)',
      cursor: 'move',
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      fontSize: '12px',
      color: 'var(--text-secondary)',
      userSelect: 'none',
    }}
    onMouseDown={onMouseDown}
  >
    ⋮⋮ Drag to move
  </div>
);

const EditorGrid: React.FC<EditorGridProps> = ({ 
  openFiles, 
  currentFileId, 
  items,
  onEditorChange,
  onTabClose,
  isGridLayout = false,
  onToggleGrid,
}) => {
  const [layouts, setLayouts] = useState<EditorLayout[]>([]);
  const [draggingLayout, setDraggingLayout] = useState<EditorLayout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Reapply theme when the current file changes
  useEffect(() => {
    if (currentFileId && window.applyCustomTheme) {
      // Small delay to ensure the editor is ready
      setTimeout(() => window.applyCustomTheme?.(), 50);
    }
  }, [currentFileId]);

  useEffect(() => {
    // Initialize layout when files change or grid layout changes
    setLayouts(prevLayouts => {
      const newLayouts: EditorLayout[] = [];
      openFiles.forEach((fileId, index) => {
        const existingLayout = prevLayouts.find(l => l.fileId === fileId);
        if (existingLayout && isGridLayout) {
          newLayouts.push(existingLayout);
        } else {
          // Calculate grid position for new files or when switching to grid
          if (isGridLayout) {
            const column = index % 2;
            const row = Math.floor(index / 2);
            newLayouts.push({
              id: `editor-${fileId}`,
              fileId,
              x: column * 50,
              y: row * 50,
              width: 50,
              height: 50,
            });
          } else {
            // Single editor mode - full width and height
            newLayouts.push({
              id: `editor-${fileId}`,
              fileId,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            });
          }
        }
      });
      return newLayouts;
    });
  }, [openFiles, isGridLayout]);

  const handleDragStart = (layout: EditorLayout, e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingLayout(layout);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current || !dragStartPos.current) return;

      const container = containerRef.current.getBoundingClientRect();
      const deltaX = moveEvent.clientX - dragStartPos.current.x;
      const deltaY = moveEvent.clientY - dragStartPos.current.y;
      
      const newX = ((deltaX / container.width) * 100) + layout.x;
      const newY = ((deltaY / container.height) * 100) + layout.y;

      // Snap to grid
      const snapX = Math.max(0, Math.min(50, Math.round(newX / 50) * 50));
      const snapY = Math.max(0, Math.min(50, Math.round(newY / 50) * 50));

      // Find if there's another layout at the target position
      const targetLayout = layouts.find(l => 
        l.id !== layout.id && 
        l.x === snapX && 
        l.y === snapY
      );

      setLayouts(prevLayouts => {
        if (targetLayout) {
          // Swap positions with the target layout
          return prevLayouts.map(l => {
            if (l.id === layout.id) {
              return { ...l, x: snapX, y: snapY };
            }
            if (l.id === targetLayout.id) {
              return { ...l, x: layout.x, y: layout.y };
            }
            return l;
          });
        } else {
          // Just move the current layout
          return prevLayouts.map(l => 
            l.id === layout.id 
              ? { ...l, x: snapX, y: snapY }
              : l
          );
        }
      });
    };

    const handleMouseUp = () => {
      setDraggingLayout(null);
      dragStartPos.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {layouts.map(layout => {
        const isVisible = isGridLayout || layout.fileId === currentFileId;
        const fileExists = !!items[layout.fileId];
        
        // Check if file exists before rendering
        if (!fileExists) {
          console.warn(`Missing file for id: ${layout.fileId}`);
        }
        
        return isVisible ? (
          <div
            key={layout.id}
            style={{
              position: 'absolute',
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              width: `${layout.width}%`,
              height: `${layout.height}%`,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              transition: draggingLayout?.id === layout.id ? 'none' : 'all 0.2s ease',
              display: isVisible ? 'block' : 'none',
            }}
          >
            {isGridLayout && (
              <DragHandle onMouseDown={(e) => handleDragStart(layout, e)} />
            )}
            <div style={{ 
              height: isGridLayout ? 'calc(100% - 24px)' : '100%', 
              marginTop: isGridLayout ? '24px' : '0',
            }}>
              {fileExists ? (
                <EditorPane
                  fileId={layout.fileId}
                  file={items[layout.fileId]}
                  onEditorReady={onEditorChange}
                />
              ) : (
                <div style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  padding: '20px',
                  textAlign: 'center',
                  fontSize: '14px'
                }}>
                  File not found. The file may have been moved or deleted.
                </div>
              )}
            </div>
          </div>
        ) : null;
      })}
    </div>
  );
};

export default EditorGrid; 