import { ReactFlowProvider } from 'reactflow';
import Flow from './Flow';
import React from 'react';
export default function App() {
  return <ReactFlowProvider><Flow /></ReactFlowProvider>;
}