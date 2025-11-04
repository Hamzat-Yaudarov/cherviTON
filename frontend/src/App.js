import { useState, useEffect } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import Home from './pages/Home';
import Game from './pages/Game';
import { Toaster } from 'sonner';

// Get backend URL from environment or use current domain
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '/';
// Normalize URL - remove trailing slash to avoid double slashes
const normalizedBackendUrl = BACKEND_URL === '.' ? '/' : BACKEND_URL.replace(/\/$/, '');
export const API = `${normalizedBackendUrl}/api`;

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game" element={<Game />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
