# AI Tool Functionality Examples

This document provides examples of how to use the AI tools in chat mode.

## Available Tools

The AI agent has access to the following tools:

1. **read_file** - Read the contents of any file
2. **list_directory** - List the contents of a directory
3. **web_search** - Search the web for information
4. **fetch_webpage** - Fetch and extract content from a webpage

## Example Queries

Here are some example queries you can use to interact with the tools:

### File Operations

```
Could you read the contents of the file "package.json" for me?
```

```
Please list all the files in the "src" directory.
```

```
Can you read the README.md file and summarize its contents?
```

### Web Tools

```
Search the web for "latest JavaScript frameworks 2023" and give me the top 3 results.
```

```
Can you fetch the content from "https://example.com" and tell me what it's about?
```

```
Search for information about "tool calling in AI models" and summarize the findings.
```

## Combining Tools

The AI can also combine multiple tools to answer more complex questions:

```
Can you search for "React state management", then fetch the first result webpage and summarize what it says?
```

```
Read the package.json file, tell me what dependencies it has, and then search the web for the latest version of the first dependency.
```

## Tool Response Format

When a tool is used, the AI will format the response clearly to show:

1. What tool was called
2. What arguments were used
3. The result of the tool call
4. A summary or analysis of the information

Example:

```
To answer your question, I'll read the package.json file.

I've read the file and here are the main dependencies:
- react: ^18.2.0
- react-dom: ^18.2.0
- typescript: ^4.9.5
- express: ^4.18.2

This appears to be a React application with TypeScript support and an Express backend.
``` 