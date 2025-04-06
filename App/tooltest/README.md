# LM Studio Tool Use Example with QWQ-32B

This project demonstrates how to use LM Studio with QWQ-32B for tool-calling functionality, similar to function calling in OpenAI's API.

## Prerequisites

- LM Studio installed with QWQ-32B model loaded
- Python 3.7+
- Required Python packages (see requirements.txt)

## Setup

1. Install the required Python packages:
```
pip install -r requirements.txt
```

2. Ensure LM Studio is running with the API server enabled:
   - Open LM Studio
   - Load the QWQ-32B model
   - Go to Local Server tab and start the server
   - The default API endpoint is http://localhost:1234/v1

## Running the Example

Run the main script:
```
python main.py
```

The script demonstrates:
1. File operations (reading text, JSON, and CSV files)
2. Web scraping (fetching webpages, extracting links and text)
3. Data processing (encoding, hashing, JSON formatting)

## How it Works

This example uses the OpenAI-compatible API provided by LM Studio to interact with QWQ-32B. 

The process is:
1. Define tools (functions) that the model can use
2. Send a user query to the model
3. The model decides which tools to call based on the query
4. Execute the tool calls and return results to the model
5. The model provides a final response incorporating the tool results

## Tool Categories

### File Reader Tools
- `read_text_file`: Read content from a text file
- `read_csv_file`: Read and parse a CSV file
- `read_json_file`: Read and parse a JSON file
- `file_info`: Get information about a file
- `list_directory`: List files in a directory with optional pattern filtering

### Web Scraper Tools
- `fetch_webpage`: Fetch a webpage and return its HTML content
- `extract_links`: Extract all links from HTML content
- `extract_text`: Extract readable text from HTML content
- `extract_metadata`: Extract metadata (title, meta tags) from HTML content
- `search_in_page`: Search for a term in HTML content with context

### Data Processor Tools
- `format_json`: Format and validate a JSON string
- `transform_data`: Transform data between different formats (JSON, CSV)
- `encode_decode`: Encode or decode text (base64, URL, hex)
- `calculate_hash`: Calculate hash of text (MD5, SHA1, SHA256, SHA512)
- `format_datetime`: Format current datetime or from timestamp

## Project Structure

- `main.py`: Main script demonstrating tool use
- `tools/file_reader.py`: Implementation of file reading tools
- `tools/web_scraper.py`: Implementation of web scraping tools
- `tools/data_processor.py`: Implementation of data processing tools
- Sample files created during execution:
  - `sample_text.txt`: Text file for testing
  - `sample_data.json`: JSON file for testing
  - `sample_data.csv`: CSV file for testing
  - `sample_page.html`: HTML file for testing web scraping locally

## Requirements

```
requests==2.30.0
```

## Notes

- This example demonstrates how to create and use custom tools with LM Studio
- The web scraping tools use simple regex for parsing, suitable for demonstration
- For production use, you would use more robust parsers like BeautifulSoup
- QWQ-32B is a tool-use trained model that performs well with tool calling 