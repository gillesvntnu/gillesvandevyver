import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import './App.css';
import Home from './components/pages/Home';
import '@fortawesome/fontawesome-free/css/all.min.css';
import DataAnalytics from "./components/pages/project_pages/DataAnalytics";
import FindingHearts from "./components/pages/project_pages/FindingHearts";
import PatternRecognition from "./components/pages/project_pages/PatternRecognition";
import GenerativeAI from "./components/pages/project_pages/GenerativeAI";
import PdfViewer from './components/viewers/PDFViewer';
import JSXViewer from './components/viewers/JSXViewer';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  return (
      <>
        <HashRouter>
          <ScrollToTop />
          <Navbar />
          <Routes>
            <Route path='/' element={<Home />} />
            <Route path='/projects/data-analytics' element={<DataAnalytics />} />
            <Route path='/projects/finding-hearts' element={<FindingHearts />} />
            <Route path='/projects/pattern-recognition' element={<PatternRecognition />} />
            <Route path='/projects/generative-ai' element={<GenerativeAI />} />
            <Route path="/recommendation-pdf" element={<PdfViewer />} />
            <Route path="/recommendation" element={
              <JSXViewer/>
            } />

          </Routes>
        </HashRouter>
      </>
  );
}

export default App;