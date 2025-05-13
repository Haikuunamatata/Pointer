import React, { useState } from 'react';

// Define expandedToolCalls state to fix the missing reference
const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});

// Add this to the component state 