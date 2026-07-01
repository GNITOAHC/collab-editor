import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { EditorContainer } from './components/EditorContainer';
import { SignalBoard } from './components/SignalBoard';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/board" element={<SignalBoard />} />
        <Route path="/project/:projectName" element={<EditorContainer />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
