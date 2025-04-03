import React, { useState, useEffect, useCallback } from 'react';
import { FileSystemItem } from '../types';
import { showToast } from '../services/ToastService';

interface TableSchema {
  name: string;
  type: string;
  pk: number; // 1 if primary key, 0 otherwise
}

interface DatabaseSchema {
  tables: Record<string, TableSchema[]>;
}

interface QueryResult {
  success: boolean;
  columns?: string[];
  data?: Record<string, any>[];
  rowCount?: number;
  executionTime?: number;
  message?: string;
  error?: string;
}

const API_URL = 'http://localhost:23816';

const DatabaseViewer: React.FC<{ file: FileSystemItem }> = ({ file }) => {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<QueryResult | null>(null);
  const [customQuery, setCustomQuery] = useState<string>('');
  const [customQueryResult, setCustomQueryResult] = useState<QueryResult | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingQuery, setIsLoadingQuery] = useState(false);

  const fetchSchema = useCallback(async () => {
    setIsLoadingSchema(true);
    try {
      const response = await fetch(`${API_URL}/db/schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }
      const data: DatabaseSchema = await response.json();
      setSchema(data);
    } catch (error: any) {
      showToast(`Error fetching schema: ${error.message}`, 'error');
      setSchema(null);
    } finally {
      setIsLoadingSchema(false);
    }
  }, [file.path]);

  const fetchTableData = useCallback(async (tableName: string, limit = 100) => {
    setIsLoadingData(true);
    setTableData(null);
    try {
      const response = await fetch(`${API_URL}/db/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path, sql: `SELECT * FROM "${tableName}" LIMIT ${limit}` }),
      });
      const data: QueryResult = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch table data');
      }
      setTableData(data);
    } catch (error: any) {
      showToast(`Error fetching data for table ${tableName}: ${error.message}`, 'error');
      setTableData({ success: false, error: error.message });
    } finally {
      setIsLoadingData(false);
    }
  }, [file.path]);

  const executeCustomQuery = async () => {
    if (!customQuery.trim()) {
      showToast('Please enter a SQL query.', 'warning');
      return;
    }
    setIsLoadingQuery(true);
    setCustomQueryResult(null);
    try {
      const response = await fetch(`${API_URL}/db/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path, sql: customQuery }),
      });
      const data: QueryResult = await response.json();
      setCustomQueryResult(data);
      if (!data.success) {
        showToast(data.error || 'Query execution failed', 'error');
      }
    } catch (error: any) {
      showToast(`Error executing query: ${error.message}`, 'error');
      setCustomQueryResult({ success: false, error: error.message });
    } finally {
      setIsLoadingQuery(false);
    }
  };

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  useEffect(() => {
    if (selectedTable) {
      fetchTableData(selectedTable);
    }
  }, [selectedTable, fetchTableData]);

  const renderTable = (result: QueryResult) => {
    if (!result || !result.success || !result.columns || !result.data) {
      return <p style={{ color: 'var(--text-secondary)' }}>No data to display or error occurred.</p>;
    }

    return (
      <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              {result.columns.map(col => <th key={col} style={styles.th}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.data.map((row, rowIndex) => (
              <tr key={rowIndex} style={styles.tr}>
                {result.columns?.map(col => (
                  <td key={`${rowIndex}-${col}`} style={styles.td}>
                    {row[col] === null ? 'NULL' : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <h3 style={styles.sidebarTitle}>Database: {file.name}</h3>
        {isLoadingSchema ? (
          <p style={styles.loadingText}>Loading schema...</p>
        ) : schema && Object.keys(schema.tables).length > 0 ? (
          <>
            <h4 style={styles.tableListTitle}>Tables</h4>
            <ul style={styles.tableList}>
              {Object.entries(schema.tables).map(([tableName, columns]) => (
                <li 
                  key={tableName} 
                  style={selectedTable === tableName ? styles.tableListItemActive : styles.tableListItem}
                  onClick={() => setSelectedTable(tableName)}
                >
                  {tableName}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p style={styles.noTablesText}>No tables found or error loading schema.</p>
        )}
      </div>

      <div style={styles.mainContent}>
        {selectedTable && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Table: {selectedTable} (showing first 100 rows)</h4>
            {isLoadingData ? (
              <p style={styles.loadingText}>Loading data...</p>
            ) : tableData ? (
              renderTable(tableData)
            ) : null}
          </div>
        )}

        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Custom SQL Query</h4>
          <textarea
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Enter your SQL query here (e.g., SELECT * FROM your_table WHERE id = 1)"
            style={styles.textarea}
            rows={4}
            disabled={isLoadingQuery}
          />
          <button 
            onClick={executeCustomQuery} 
            disabled={isLoadingQuery} 
            style={styles.button}
          >
            {isLoadingQuery ? 'Executing...' : 'Run Query'}
          </button>

          {customQueryResult && (
            <div style={{ marginTop: '15px' }}>
              <h5>Query Result:</h5>
              {customQueryResult.success ? (
                customQueryResult.columns ? (
                  renderTable(customQueryResult)
                ) : (
                  <p style={{ color: 'var(--text-success)' }}>{customQueryResult.message}</p>
                )
              ) : (
                <p style={{ color: 'var(--text-error)' }}>Error: {customQueryResult.error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    height: '100%',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  sidebar: {
    width: '250px',
    borderRight: '1px solid var(--border-color)',
    padding: '15px',
    overflowY: 'auto',
    backgroundColor: 'var(--bg-secondary)',
  },
  sidebarTitle: {
    marginTop: 0,
    marginBottom: '15px',
    fontSize: '16px',
    borderBottom: '1px solid var(--border-subtle)',
    paddingBottom: '10px',
  },
  tableListTitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '10px',
  },
  tableList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  tableListItem: {
    padding: '6px 10px',
    cursor: 'pointer',
    borderRadius: '4px',
    marginBottom: '4px',
    transition: 'background-color 0.2s',
    fontSize: '13px',
  },
  tableListItemActive: {
    padding: '6px 10px',
    cursor: 'pointer',
    borderRadius: '4px',
    marginBottom: '4px',
    transition: 'background-color 0.2s',
    fontSize: '13px',
    backgroundColor: 'var(--bg-selected)',
    color: 'var(--accent-color)',
    fontWeight: 500,
  },
  loadingText: {
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
  noTablesText: {
    color: 'var(--text-secondary)',
  },
  mainContent: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
  },
  section: {
    marginBottom: '25px',
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: '15px',
    fontSize: '15px',
    borderBottom: '1px solid var(--border-subtle)',
    paddingBottom: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    tableLayout: 'fixed',
  },
  th: {
    border: '1px solid var(--border-color)',
    padding: '6px 8px',
    textAlign: 'left',
    backgroundColor: 'var(--bg-hover)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tr: {
    'hover': {
      backgroundColor: 'var(--bg-hover)',
    },
  },
  td: {
    border: '1px solid var(--border-color)',
    padding: '6px 8px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '200px',
  },
  textarea: {
    width: '100%',
    padding: '8px',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    resize: 'vertical',
    marginBottom: '10px',
  },
  button: {
    padding: '8px 15px',
    backgroundColor: 'var(--accent-color)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    fontSize: '13px',
    ':hover': {
      backgroundColor: 'var(--accent-color-hover)',
    },
    ':disabled': {
      opacity: 0.6,
      cursor: 'not-allowed',
    },
  },
};

export default DatabaseViewer; 